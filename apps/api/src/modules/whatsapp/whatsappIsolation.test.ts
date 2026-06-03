import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  resolveMetadata: vi.fn(),
  createEventFromMessage: vi.fn(),
  resolveIdentity: vi.fn(),
  upsertAliases: vi.fn(),
  getAliases: vi.fn(),
  refreshRollups: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: {
    query: mocks.query,
  },
  redis: {
    get: mocks.redisGet,
    set: mocks.redisSet,
  },
}));

vi.mock("./evolutionMetadataService.js", () => ({
  resolveWhatsappMessageMetadata: mocks.resolveMetadata,
}));

vi.mock("./whatsappIdentityService.js", () => ({
  resolveWhatsappConversationIdentity: mocks.resolveIdentity,
  upsertWhatsappJidAliases: mocks.upsertAliases,
  getWhatsappConversationAliases: mocks.getAliases,
}));

vi.mock("./whatsappActivityRollupService.js", () => ({
  refreshWhatsappActivityRollups: mocks.refreshRollups,
}));

vi.mock("../events/eventsService.js", () => ({
  createEventFromMessage: mocks.createEventFromMessage,
}));

// Force group-message processing ON so the cross-instance dedup path is exercised.
vi.mock("../../lib/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/env.js")>();
  return {
    ...actual,
    env: { ...actual.env, EVOLUTION_PROCESS_GROUP_MESSAGES: true },
  };
});

import { handleEvolutionWebhook } from "./evolutionWebhook.js";
import {
  classifyWhatsappReportConversation,
  getWhatsappAgentActivityReport,
  getWhatsappMonitorConversation,
  isInternalWhatsappReportChat,
  listWhatsappMonitorConversations,
} from "./whatsappMonitorService.js";

function localTodayKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

describe("whatsapp activity report classification", () => {
  it("excludes internal groups and private company numbers from report calculations", () => {
    expect(isInternalWhatsappReportChat({
      remoteJid: "120363024388010129@g.us",
      name: "XP-comprovante",
    })).toBe(true);
    expect(isInternalWhatsappReportChat({
      remoteJid: "5511988366300@s.whatsapp.net",
      name: "XP interno",
    })).toBe(true);
  });

  it("keeps customer groups with XP suffixes counted as customer attendance", () => {
    expect(classifyWhatsappReportConversation({
      isGroup: true,
      remoteJid: "120363371542185615@g.us",
      name: "CL1049 - MINAS CELL / XP EXPOR TELAS",
    })).toBe("customer_group");
    expect(isInternalWhatsappReportChat({
      remoteJid: "120363371542185615@g.us",
      name: "CL1049 - MINAS CELL / XP EXPOR TELAS",
    })).toBe(false);
  });

  it("counts unblocked non-private groups as group attendance instead of private", () => {
    expect(classifyWhatsappReportConversation({
      isGroup: true,
      remoteJid: "120363303051942830@g.us",
      name: "Xp Cliente Cavalo Cell",
    })).toBe("other_group");
  });
});

describe("whatsapp conversation isolation", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.redisGet.mockReset();
    mocks.redisSet.mockReset();
    mocks.resolveMetadata.mockReset();
    mocks.createEventFromMessage.mockReset();
    mocks.resolveIdentity.mockReset();
    mocks.upsertAliases.mockReset();
    mocks.getAliases.mockReset();
    mocks.refreshRollups.mockReset();
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.resolveMetadata.mockResolvedValue({});
    mocks.createEventFromMessage.mockResolvedValue(undefined);
    mocks.resolveIdentity.mockImplementation((_instanceName, context) => ({
      canonicalJid: context.remoteJid,
      aliases: context.remoteJid ? [context.remoteJid] : [],
    }));
    mocks.getAliases.mockImplementation((_instanceName, remoteJid) => remoteJid ? [remoteJid] : []);
    mocks.upsertAliases.mockResolvedValue(undefined);
    mocks.refreshRollups.mockResolvedValue({ refreshed: true, deleted: 0, inserted: 1 });
  });

  it("refreshes empty activity rollups before returning the heatmap report", async () => {
    const today = localTodayKey();
    let rollupQueryCount = 0;

    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);

      if (sql.includes("FROM whatsapp_instances wi")) {
        return {
          rows: [
            {
              instance_id: "instance-amanda",
              instance_name: "amanda",
              display_label: "Amanda",
              phone_number: "+55 11 91234-5678",
              profile_picture_url: null,
              assigned_user_id: "user-amanda",
              assigned_user_name: "Amanda",
              user_id: "user-amanda",
              user_name: "Amanda",
            },
          ],
        };
      }

      if (sql.includes("FROM whatsapp_activity_rollups war")) {
        rollupQueryCount += 1;
        return rollupQueryCount === 1
          ? { rows: [] }
          : {
              rows: [
                {
                  agent_id: "user-amanda",
                  agent_name: "Amanda (Amanda)",
                  instance_name: "amanda",
                  display_label: "Amanda",
                  phone_number: "+55 11 91234-5678",
                  profile_picture_url: null,
                  remote_jid: "5511999998888@s.whatsapp.net",
                  chat_name: "Cliente Exemplo",
                  local_date: today,
                  local_hour: 13,
                  sent_messages: 2,
                  received_messages: 1,
                  response_count: 1,
                  response_seconds_total: 180,
                  last_message_at: `${today}T16:00:00.000Z`,
                },
              ],
            };
      }

      return { rows: [] };
    });

    const report = await getWhatsappAgentActivityReport({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    expect(mocks.refreshRollups).toHaveBeenCalledWith(14);
    expect(rollupQueryCount).toBe(2);
    expect(report.hourlyCells).toHaveLength(1);
    expect(report.hourlyCells[0]).toMatchObject({
      date: today,
      hour: 13,
      sentMessages: 2,
      receivedMessages: 1,
    });
  });

  it("filters captured conversation messages by the concrete instance only", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "deal-1",
            title: "Cliente",
            customer_display_name: "Cliente",
            whatsapp_jid: "5511999998888@s.whatsapp.net",
            instance_name: "amanda",
            instance_display_label: "Amanda",
            stage_name: "Contato Inicial",
            last_message_at: "2026-05-21T12:00:00.000Z",
            event_count: 0,
            inbound_count: 0,
            unread_after_read: 0,
            marked_unread: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getWhatsappMonitorConversation("deal-1", {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const incomingCall = mocks.query.mock.calls[3];
    expect(incomingCall).toBeDefined();
    const incomingQuery = String(incomingCall![0]);
    const incomingParams = incomingCall![1];

    expect(incomingParams).toEqual([["5511999998888@s.whatsapp.net"], ["5511999998888"], "amanda", 21]);
    expect(incomingQuery).toContain("wim_base.participant_jid = ANY($1::text[])");
    expect(incomingQuery).toContain("raw_payload #>> '{key,remoteJidPn}'");
    expect(incomingQuery).toContain("raw_payload ->> 'senderPn'");
    expect(incomingQuery).toContain("LOWER(COALESCE(wim_base.instance_name, '')) = LOWER($3)");
    expect(incomingQuery).not.toMatch(/OR\s+COALESCE\(wim_base\.instance_name,\s*''\)\s*=\s*''/);
  });

  it("only falls back to unassigned deals when the deal belongs to the instance owner", async () => {
    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);
      if (sql.includes("webhook_events")) {
        return { rowCount: 1, rows: [{ id: "mock-event-id" }] };
      }
      if (sql.includes("whatsapp_instances")) {
        return {
          rows: [
            {
              id: "instance-amanda",
              display_label: "Amanda",
              phone_number: "+55 11 91234-5678",
              assigned_user_id: "user-amanda",
              assigned_user_name: "Amanda",
            },
          ],
        };
      }
      if (sql.includes("pipeline_stages")) {
        return { rows: [{ id: "stage-1" }] };
      }
      return { rows: [] };
    });

    await handleEvolutionWebhook({
      event: "MESSAGES_UPSERT",
      instance: "amanda",
      data: {
        key: {
          remoteJid: "5511999998888@s.whatsapp.net",
          id: "msg-1",
          fromMe: false,
        },
        pushName: "Cliente",
        message: {
          conversation: "Oi",
        },
        messageTimestamp: 1779364800,
      },
    });

    const dealMatchCall = mocks.query.mock.calls.find(call => String(call[0]).includes("existing_message_deal"));
    expect(dealMatchCall).toBeDefined();
    const dealMatchQuery = String(dealMatchCall![0]);
    const dealMatchParams = dealMatchCall![1];

    expect(dealMatchParams).toEqual([
      "msg-1",
      "5511999998888@s.whatsapp.net",
      "instance-amanda",
      "user-amanda",
      "Amanda",
      ["5511999998888@s.whatsapp.net"],
      "amanda",
    ]);
    expect(dealMatchQuery).toContain("d.whatsapp_instance_id = $3::uuid");
    expect(dealMatchQuery).toContain("d.assigned_to = $4::uuid");
    expect(dealMatchQuery).toContain("LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($5)");
  });

  it("keeps private inbound messages from the customer on the inbound side when Evolution sender is the connection", async () => {
    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);
      if (sql.includes("webhook_events")) {
        return { rowCount: 1, rows: [{ id: "mock-event-id" }] };
      }
      if (sql.includes("whatsapp_instances")) {
        return {
          rows: [
            {
              id: "instance-amanda",
              display_label: "Amanda",
              phone_number: "+55 11 91234-5678",
              assigned_user_id: "user-amanda",
              assigned_user_name: "Amanda",
            },
          ],
        };
      }
      if (sql.includes("existing_message_deal") || sql.includes("remote_jid_deal")) {
        return {
          rows: [
            {
              id: "deal-1",
              whatsapp_instance_id: "instance-amanda",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await handleEvolutionWebhook({
      event: "MESSAGES_UPSERT",
      instance: "amanda",
      data: {
        key: {
          remoteJid: "5511999998888@s.whatsapp.net",
          id: "msg-private-in-1",
          fromMe: false,
        },
        senderJid: "5511912345678@s.whatsapp.net",
        pushName: "Cliente",
        message: {
          conversation: "Oi",
        },
        messageTimestamp: 1779364800,
      },
    });

    const incomingCall = mocks.query.mock.calls.find(call => String(call[0]).includes("INSERT INTO whatsapp_incoming_messages"));
    const activityCall = mocks.query.mock.calls.find(call => String(call[0]).includes("INSERT INTO deal_activities") || String(call[0]).includes("WITH inserted AS"));

    expect(incomingCall).toBeDefined();
    expect(activityCall).toBeDefined();

    const incomingInsertParams = incomingCall![1];
    const activityInsertParams = activityCall![1];

    expect(incomingInsertParams?.[11]).toBe(false);
    expect(activityInsertParams?.[1]).toBe("WHATSAPP_RECEIVED");
    expect(activityInsertParams?.[2]).toBeNull();
  });

  it("matches send webhooks to the existing CRM reply by message id before creating a LID conversation", async () => {
    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);
      if (sql.includes("webhook_events")) {
        return { rowCount: 1, rows: [{ id: "mock-event-id" }] };
      }
      if (sql.includes("whatsapp_instances")) {
        return {
          rows: [
            {
              id: "instance-suelen",
              display_label: "Suelen",
              phone_number: "+55 11 91234-5678",
              assigned_user_id: "user-suelen",
              assigned_user_name: "Suelen",
            },
          ],
        };
      }
      if (sql.includes("existing_message_deal") || sql.includes("remote_jid_deal")) {
        return {
          rows: [
            {
              id: "deal-leomar",
              whatsapp_instance_id: "instance-suelen",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await handleEvolutionWebhook({
      event: "SEND_MESSAGE",
      instance: "suelen",
      data: {
        key: {
          remoteJid: "269097182986462@lid",
          id: "reply-1",
          fromMe: true,
        },
        message: {
          conversation: "Sim, pode deixar",
        },
        messageTimestamp: 1779364800,
      },
    });

    const dealMatchCall = mocks.query.mock.calls.find(call => String(call[0]).includes("existing_message_deal"));
    expect(dealMatchCall).toBeDefined();
    const dealMatchQuery = String(dealMatchCall![0]);
    const dealMatchParams = dealMatchCall![1];

    expect(dealMatchParams).toEqual([
      "reply-1",
      "269097182986462@lid",
      "instance-suelen",
      "user-suelen",
      "Suelen",
      ["269097182986462@lid"],
      "suelen",
    ]);
    expect(dealMatchQuery).toContain("existing_message_deal");
    expect(dealMatchQuery).toContain("metadata ->> 'messageId' = $1");
    expect(dealMatchQuery).toContain("metadata ->> 'providerMessageId' = $1");
  });

  it("matches outbound fromMe LID upserts by the canonical phone alias", async () => {
    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);
      if (sql.includes("webhook_events")) {
        return { rowCount: 1, rows: [{ id: "mock-event-id" }] };
      }
      if (sql.includes("whatsapp_instances")) {
        return {
          rows: [
            {
              id: "instance-suelen",
              display_label: "Suelen",
              phone_number: "+55 11 91234-5678",
              assigned_user_id: "user-suelen",
              assigned_user_name: "Suelen",
            },
          ],
        };
      }
      if (sql.includes("existing_message_deal") || sql.includes("remote_jid_deal")) {
        return {
          rows: [
            {
              id: "deal-leomar",
              whatsapp_instance_id: "instance-suelen",
              whatsapp_jid: "5511998765432@s.whatsapp.net",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await handleEvolutionWebhook({
      event: "MESSAGES_UPSERT",
      instance: "suelen",
      data: {
        key: {
          remoteJid: "269097182986462@lid",
          id: "reply-phone-alias-1",
          fromMe: true,
          senderPn: "5511998765432@s.whatsapp.net",
        },
        message: {
          conversation: "Sim, pode deixar",
        },
        messageTimestamp: 1779364800,
      },
    });

    const incomingCall = mocks.query.mock.calls.find(call => String(call[0]).includes("INSERT INTO whatsapp_incoming_messages"));
    const dealMatchCall = mocks.query.mock.calls.find(call => String(call[0]).includes("existing_message_deal"));

    expect(incomingCall?.[1]?.[0]).toBe("5511998765432@s.whatsapp.net");
    expect(incomingCall?.[1]?.[11]).toBe(true);
    expect(dealMatchCall).toBeDefined();
    expect(dealMatchCall![1]).toEqual([
      "reply-phone-alias-1",
      "5511998765432@s.whatsapp.net",
      "instance-suelen",
      "user-suelen",
      "Suelen",
      ["5511998765432@s.whatsapp.net", "269097182986462@lid"],
      "suelen",
    ]);
  });

  it("uses raw Evolution fromMe=false to render previously misclassified private activity direction", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "deal-1",
            title: "Cliente",
            customer_display_name: "Cliente",
            whatsapp_jid: "5511999998888@s.whatsapp.net",
            instance_name: "amanda",
            instance_display_label: "Amanda",
            stage_name: "Contato Inicial",
            last_message_at: "2026-05-21T12:00:00.000Z",
            event_count: 1,
            inbound_count: 0,
            unread_after_read: 0,
            marked_unread: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "activity-1",
            deal_id: "deal-1",
            activity_type: "WHATSAPP_SENT",
            actor_name: "Amanda",
            content: "Oi",
            metadata: {
              messageId: "msg-private-in-1",
              remoteJid: "5511999998888@s.whatsapp.net",
              fromMe: true,
              capturedFromWhatsapp: true,
            },
            created_at: "2026-05-21T12:00:00.000Z",
            incoming_from_me: true,
            incoming_raw_payload: {
              key: {
                remoteJid: "5511999998888@s.whatsapp.net",
                id: "msg-private-in-1",
                fromMe: false,
              },
              senderJid: "5511912345678@s.whatsapp.net",
              pushName: "Cliente",
              message: {
                conversation: "Oi",
              },
            },
            participant_display_name: null,
            participant_profile_picture_url: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const conversation = await getWhatsappMonitorConversation("deal-1", {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.direction).toBe("INBOUND");
    expect(conversation.messages[0]?.senderJid).toBe("5511999998888@s.whatsapp.net");
  });

  it("paginates conversation list by deal activity before hydrating rows", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const result = await listWhatsappMonitorConversations({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("WITH candidate_deals"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);
    const listParams = listCall![1];

    expect(listSql).toContain("WITH candidate_deals");
    expect(listSql).toContain("COALESCE(d.last_activity_at, d.created_at) >= NOW() - (90 * INTERVAL '1 day')");
    expect(listSql).toContain("ORDER BY COALESCE(d.last_activity_at, d.created_at) DESC, d.id DESC");
    expect(listSql).toContain("WHERE d.id IN (SELECT id FROM candidate_deals)");
    expect(listSql).toContain("latest_whatsapp.activity_type = 'WHATSAPP_RECEIVED'");
    expect(listSql).not.toContain("incoming_profile.sender_profile_picture_url");
    expect(listSql).not.toContain("incoming_profile.sender_name");
    expect(listSql).not.toContain("DISTINCT ON");
    expect(listParams).toEqual(["admin-1", 26]);
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      nextCursor: null,
      limit: 25,
    });
  });

  it("deduplicates the same group message arriving from multiple Evolution instances", async () => {
    let webhookInsertCount = 0;
    let dealMatchCount = 0;
    let activityInsertCount = 0;
    let dealUpdateCount = 0;

    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);

      // Strong idempotency gate: only the first instance wins the INSERT.
      if (sql.includes("INSERT INTO webhook_events") && sql.includes("RETURNING id")) {
        webhookInsertCount += 1;
        return webhookInsertCount === 1
          ? { rowCount: 1, rows: [{ id: "evt-1" }] }
          : { rowCount: 0, rows: [] };
      }
      if (sql.includes("whatsapp_instances")) {
        return {
          rows: [
            {
              id: "instance-amanda",
              display_label: "Amanda",
              phone_number: "+55 11 91234-5678",
              assigned_user_id: "user-amanda",
              assigned_user_name: "Amanda",
            },
          ],
        };
      }
      if (sql.includes("existing_message_deal") || sql.includes("remote_jid_deal")) {
        dealMatchCount += 1;
        return { rows: [{ id: "deal-group", whatsapp_instance_id: "instance-amanda" }] };
      }
      if (sql.includes("INSERT INTO deal_activities")) {
        activityInsertCount += 1;
        return { rows: [] };
      }
      if (sql.includes("UPDATE deals SET last_activity_at")) {
        dealUpdateCount += 1;
        return { rows: [] };
      }
      if (sql.includes("pipeline_stages")) {
        return { rows: [{ id: "stage-1" }] };
      }
      return { rows: [] };
    });

    const groupMessageFrom = (instance: string) => ({
      event: "MESSAGES_UPSERT",
      instance,
      data: {
        key: {
          remoteJid: "120363409565036327@g.us",
          id: "ACBEA60BD6C30AAE8783B67819DFABB4",
          fromMe: false,
          participant: "5511993372917@s.whatsapp.net",
        },
        pushName: "Cliente",
        message: { conversation: "Ola grupo" },
        messageTimestamp: 1779364800,
      },
    });

    const first = await handleEvolutionWebhook(groupMessageFrom("amanda"));
    const second = await handleEvolutionWebhook(groupMessageFrom("pedro"));
    const third = await handleEvolutionWebhook(groupMessageFrom("Suelen"));

    // The first instance processes the message normally.
    expect(first).toEqual({ processed: true, processedCount: 1 });
    // The other two are short-circuited as duplicates.
    expect(second).toEqual({ duplicated: true });
    expect(third).toEqual({ duplicated: true });

    // All three hit the idempotency gate...
    expect(webhookInsertCount).toBe(3);
    // ...but the heavy work runs exactly once.
    expect(dealMatchCount).toBe(1);
    expect(activityInsertCount).toBe(1);
    expect(dealUpdateCount).toBe(1);
  });

  it("can restrict the conversation list to sent interactions from the selected WhatsApp user", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await listWhatsappMonitorConversations(
      {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "ADMIN",
      } as any,
      {
        instanceId: "00000000-0000-0000-0000-000000000001",
        period: "today",
        agentInteraction: "sent",
      },
    );

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("agent_interaction_activity"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);

    expect(listSql).toContain("agent_interaction_activity");
    expect(listSql).toContain("agent_interaction_instance.id = $2");
    expect(listSql).toContain("agent_interaction_activity.created_at >=");
    expect(listSql).toContain("agent_interaction_activity.activity_type = 'WHATSAPP_SENT'");
  });

  it("derives the group conversation preview from whatsapp_incoming_messages by JID, shared across every seller", async () => {
    const groupJid = "120363409565036327@g.us";
    // The list query is mocked, so we assert (a) the SQL sources the group
    // preview from the canonical incoming message by remote_jid (instance
    // agnostic) and (b) every seller row for that group surfaces the same
    // last message after mapping.
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "deal-amanda",
          title: "Grupo XP Cliente",
          customer_display_name: "Grupo XP Cliente",
          whatsapp_jid: groupJid,
          whatsapp_instance_id: "instance-amanda",
          instance_name: "amanda",
          instance_display_label: "Amanda",
          stage_name: "Atendimento",
          last_message_content: "Ola grupo",
          last_message_at: "2026-05-21T12:00:00.000Z",
          event_count: 1,
          inbound_count: 1,
          unread_after_read: 0,
          marked_unread: false,
        },
        {
          id: "deal-pedro",
          title: "Grupo XP Cliente",
          customer_display_name: "Grupo XP Cliente",
          whatsapp_jid: groupJid,
          whatsapp_instance_id: "instance-pedro",
          instance_name: "pedro",
          instance_display_label: "Pedro",
          stage_name: "Atendimento",
          // Pedro does NOT own the deal_activity (dedup attached it elsewhere),
          // yet the group preview is still populated from the shared message.
          last_message_content: "Ola grupo",
          last_message_at: "2026-05-21T12:00:00.000Z",
          event_count: 0,
          inbound_count: 0,
          unread_after_read: 0,
          marked_unread: false,
        },
      ],
    });

    const result = await listWhatsappMonitorConversations({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("group_latest_message"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);

    // Group preview/last message comes from the canonical incoming message by
    // remote_jid, regardless of which instance received it.
    expect(listSql).toContain("group_latest_message");
    expect(listSql).toContain("wim_group.remote_jid = d.whatsapp_jid");
    expect(listSql).toMatch(/d\.whatsapp_jid LIKE '%@g\.us'/);
    // Private (1:1) chats keep deriving the preview from their own deal_activities.
    expect(listSql).toContain("ELSE latest_whatsapp.content");

    // Every seller with a deal for the group surfaces the same last message,
    // even though the message is stored (and processed) only once.
    const amanda = result.conversations.find((c: { id: string }) => c.id === "deal-amanda");
    const pedro = result.conversations.find((c: { id: string }) => c.id === "deal-pedro");
    expect(amanda?.isGroup).toBe(true);
    expect(pedro?.isGroup).toBe(true);
    expect(amanda?.lastMessage).toBe("Ola grupo");
    expect(pedro?.lastMessage).toBe("Ola grupo");
  });
});

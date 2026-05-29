import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  resolveMetadata: vi.fn(),
  createEventFromMessage: vi.fn(),
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
  getWhatsappMonitorConversation,
  isInternalWhatsappReportChat,
  listWhatsappMonitorConversations,
} from "./whatsappMonitorService.js";

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
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.resolveMetadata.mockResolvedValue({});
    mocks.createEventFromMessage.mockResolvedValue(undefined);
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
      .mockResolvedValueOnce({ rows: [] });

    await getWhatsappMonitorConversation("deal-1", {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const incomingCall = mocks.query.mock.calls[2];
    expect(incomingCall).toBeDefined();
    const incomingQuery = String(incomingCall![0]);
    const incomingParams = incomingCall![1];

    expect(incomingParams).toEqual(["5511999998888@s.whatsapp.net", "amanda"]);
    expect(incomingQuery).toContain("LOWER(COALESCE(wim.instance_name, '')) = LOWER($2)");
    expect(incomingQuery).not.toMatch(/OR\s+COALESCE\(wim\.instance_name,\s*''\)\s*=\s*''/);
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

    const dealMatchCall = mocks.query.mock.calls[3];
    expect(dealMatchCall).toBeDefined();
    const dealMatchQuery = String(dealMatchCall![0]);
    const dealMatchParams = dealMatchCall![1];

    expect(dealMatchParams).toEqual([
      "msg-1",
      "5511999998888@s.whatsapp.net",
      "instance-amanda",
      "user-amanda",
      "Amanda",
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

    const incomingInsertParams = mocks.query.mock.calls[2]?.[1];
    const activityInsertParams = mocks.query.mock.calls[4]?.[1];

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

    const dealMatchCall = mocks.query.mock.calls[3];
    expect(dealMatchCall).toBeDefined();
    const dealMatchQuery = String(dealMatchCall![0]);
    const dealMatchParams = dealMatchCall![1];

    expect(dealMatchParams).toEqual([
      "reply-1",
      "269097182986462@lid",
      "instance-suelen",
      "user-suelen",
      "Suelen",
    ]);
    expect(dealMatchQuery).toContain("existing_message_deal");
    expect(dealMatchQuery).toContain("metadata ->> 'messageId' = $1");
    expect(dealMatchQuery).toContain("metadata ->> 'providerMessageId' = $1");
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

  it("deduplicates conversation list rows by instance and WhatsApp JID", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await listWhatsappMonitorConversations({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const listCall = mocks.query.mock.calls[1];
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);

    expect(listSql).toContain("DISTINCT ON");
    expect(listSql).toContain("conversation_rows.whatsapp_instance_id::text");
    expect(listSql).toContain("LOWER(COALESCE(conversation_rows.whatsapp_jid, ''))");
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
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

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

    const listCall = mocks.query.mock.calls[1];
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);

    expect(listSql).toContain("agent_interaction_activity");
    expect(listSql).toContain("agent_interaction_instance.id = $1");
    expect(listSql).toContain("agent_interaction_activity.created_at >=");
    expect(listSql).toContain("agent_interaction_activity.activity_type = 'WHATSAPP_SENT'");
  });
});

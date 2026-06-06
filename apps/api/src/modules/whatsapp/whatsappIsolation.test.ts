import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  monitorQuery: vi.fn(),
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
  whatsappMonitorPool: {
    query: (sql: unknown, params: unknown) => {
      const sqlStr = String(sql ?? "");
      mocks.monitorQuery(sql, params);
      if (sqlStr.includes("FROM whatsapp_monitor_messages") && !sqlStr.includes("deals")) {
        return Promise.resolve({ rows: [] });
      }
      return mocks.query(sql, params);
    },
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
  getWhatsappDailySummaryReport,
  getWhatsappMonitorConversation,
  isInternalWhatsappReportChat,
  listWhatsappMonitorConversations,
  setWhatsappConversationReadState,
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

function localDateKeyDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
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

  it("does not drop private customer chats only because the display name looks internal", () => {
    expect(isInternalWhatsappReportChat({
      isGroup: false,
      remoteJid: "557798074897@s.whatsapp.net",
      name: "XP Suelen",
    })).toBe(false);
  });
});

describe("whatsapp conversation isolation", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.monitorQuery.mockReset();
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

  it("schedules empty activity rollup refresh and uses direct fallback for the heatmap report", async () => {
    const today = localTodayKey();
    let rollupQueryCount = 0;
    let directQueryCount = 0;
    const currentRow = {
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
    };

    mocks.query.mockImplementation(async (sqlStr) => {
      const sql = String(sqlStr);

      if (sql.includes("monitor_rows") && sql.includes("FROM whatsapp_monitor_messages wmm")) {
        directQueryCount += 1;
        return { rows: [currentRow] };
      }

      if (sql.includes("FROM whatsapp_instances wi\n")) {
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
        return { rows: [] };
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
    expect(rollupQueryCount).toBe(1);
    expect(directQueryCount).toBe(1);
    expect(report.hourlyCells).toHaveLength(1);
    expect(report.hourlyCells[0]).toMatchObject({
      date: today,
      hour: 13,
      sentMessages: 2,
      receivedMessages: 1,
    });
  });

  it("returns stale rollups quickly while scheduling refresh when the end date has no activity", async () => {
    const today = localTodayKey();
    const yesterday = localDateKeyDaysAgo(1);
    let rollupQueryCount = 0;

    const staleRow = {
      agent_id: "user-amanda",
      agent_name: "Amanda (Amanda)",
      instance_name: "amanda",
      display_label: "Amanda",
      phone_number: "+55 11 91234-5678",
      profile_picture_url: null,
      remote_jid: "5511999997777@s.whatsapp.net",
      chat_name: "Cliente Ontem",
      local_date: yesterday,
      local_hour: 15,
      sent_messages: 4,
      received_messages: 1,
      response_count: 1,
      response_seconds_total: 240,
      last_message_at: `${yesterday}T18:00:00.000Z`,
    };

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
        return { rows: [staleRow] };
      }

      return { rows: [] };
    });

    const report = await getWhatsappAgentActivityReport({
      id: "admin-stale",
      name: "Admin Stale",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    expect(mocks.refreshRollups).toHaveBeenCalledWith(14);
    expect(rollupQueryCount).toBe(1);
    expect(report.hourlyCells.some((cell) => cell.date === yesterday && cell.sentMessages === 4)).toBe(true);
    expect(report.hourlyCells.some((cell) => cell.date === today && cell.sentMessages === 2)).toBe(false);
  });

  it("counts group attendances in the formatted daily WhatsApp summary", async () => {
    const date = localTodayKey();
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            activity_type: "WHATSAPP_RECEIVED",
            actor_user_id: null,
            actor_name: null,
            metadata: {
              remoteJid: "120363371542185615@g.us",
              chatDisplayName: "CL1049 - MINAS CELL / XP EXPOR TELAS",
              instance: "thais",
              fromMe: false,
            },
            created_at: `${date}T12:00:00.000Z`,
            incoming_raw_payload: null,
            incoming_from_me: false,
            metadata_instance: "thais",
            metadata_remote_jid: "120363371542185615@g.us",
            metadata_chat_display_name: "CL1049 - MINAS CELL / XP EXPOR TELAS",
            assigned_to: "user-thais",
            assigned_to_name: "Thais",
            whatsapp_instance_id: "instance-thais",
            whatsapp_jid: "120363371542185615@g.us",
            customer_display_name: null,
            title: "CL1049 - MINAS CELL / XP EXPOR TELAS",
            real_customer_name: null,
          },
          {
            activity_type: "WHATSAPP_SENT",
            actor_user_id: null,
            actor_name: "Thais",
            metadata: {
              remoteJid: "120363371542185615@g.us",
              chatDisplayName: "CL1049 - MINAS CELL / XP EXPOR TELAS",
              instance: "thais",
              fromMe: true,
            },
            created_at: `${date}T12:01:00.000Z`,
            incoming_raw_payload: null,
            incoming_from_me: true,
            metadata_instance: "thais",
            metadata_remote_jid: "120363371542185615@g.us",
            metadata_chat_display_name: "CL1049 - MINAS CELL / XP EXPOR TELAS",
            assigned_to: "user-thais",
            assigned_to_name: "Thais",
            whatsapp_instance_id: "instance-thais",
            whatsapp_jid: "120363371542185615@g.us",
            customer_display_name: null,
            title: "CL1049 - MINAS CELL / XP EXPOR TELAS",
            real_customer_name: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "user-thais", name: "Thais" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "instance-thais",
            instance_name: "thais",
            display_label: "Thais",
            assigned_user_id: "user-thais",
            assigned_user_name: "Thais",
          },
        ],
      });

    const summary = await getWhatsappDailySummaryReport({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any, date);

    const activitiesSql = String(mocks.query.mock.calls[3]?.[0] ?? "");
    expect(activitiesSql).toContain("FROM whatsapp_monitor_messages wmm");
    expect(summary.totalMessagesSent).toBe(1);
    expect(summary.totalMessagesReceived).toBe(1);
    expect(summary.agents[0]).toMatchObject({
      agentName: "Thais",
      groupChatsCount: 1,
    });
    expect(summary.formattedText).toContain("Atendimentos em Grupo: 1");
    expect(summary.formattedText).toContain("CL1049 - MINAS CELL / XP EXPOR TELAS (Grupo)");
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

    expect(incomingParams).toEqual([["5511999998888@s.whatsapp.net"], "amanda", 21]);
    expect(incomingQuery).toContain("wim_base.participant_jid = ANY($1::text[])");
    expect(incomingQuery).toContain("wim_base.remote_jid = ANY($1::text[])");
    expect(incomingQuery).toContain("LOWER(COALESCE(wim_base.instance_name, '')) = LOWER($2)");
    expect(incomingQuery).toContain("LIMIT $3");
    expect(Array.from(new Set([...incomingQuery.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))))).toEqual([1, 2, 3]);
    expect(incomingQuery).not.toMatch(/OR\s+COALESCE\(wim_base\.instance_name,\s*''\)\s*=\s*''/);
  });

  it("casts linked conversation parameters before querying equivalent WhatsApp deals", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "2d3f5448-1dcd-49f1-9a33-a66b3f3c2145",
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
      .mockResolvedValueOnce({ rows: [{ id: "2d3f5448-1dcd-49f1-9a33-a66b3f3c2145" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getWhatsappMonitorConversation("2d3f5448-1dcd-49f1-9a33-a66b3f3c2145", {
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const linkedDealCall = mocks.query.mock.calls[1];
    expect(linkedDealCall).toBeDefined();
    const linkedDealQuery = String(linkedDealCall![0]);
    const linkedDealParams = linkedDealCall![1];

    expect(linkedDealParams).toEqual([["5511999998888@s.whatsapp.net"], "amanda"]);
    expect(linkedDealQuery).toContain("SELECT unnest($1::text[]) AS jid");
    expect(linkedDealQuery).toContain("$2::text = ''");
    expect(linkedDealQuery).toContain("LOWER($2::text)");
    expect(linkedDealQuery).not.toContain("$3");
  });

  it("marks a conversation as read without reloading the full message history", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "2d3f5448-1dcd-49f1-9a33-a66b3f3c2145" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await setWhatsappConversationReadState(
      "2d3f5448-1dcd-49f1-9a33-a66b3f3c2145",
      {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "ADMIN",
      } as any,
      false,
    );

    expect(result).toMatchObject({
      id: "2d3f5448-1dcd-49f1-9a33-a66b3f3c2145",
      isUnread: false,
      unreadCount: 0,
      markedUnread: false,
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain("last_read_at");
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
    expect(listSql).toContain("latest_whatsapp.direction = 'INBOUND'");
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

  it("does not run per-deal instance matching for the admin all-agents conversation list", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await listWhatsappMonitorConversations({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("WITH candidate_deals"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);

    expect(listSql).not.toContain("wi_monitor");
    expect(listSql).not.toContain("conversationMatchesInstanceSql");
    expect(listSql).not.toMatch(/FROM whatsapp_incoming_messages wim_inst/);
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
      if (sql.includes("d.whatsapp_jid = $1") && sql.includes("pipeline_stages")) {
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

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("wmm_agent"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);

    expect(listSql).toContain("wmm_agent");
    expect(listSql).toContain("agent_interaction_instance.id = $2");
    expect(listSql).toContain("wmm_agent.created_at >=");
    expect(listSql).toContain("wmm_agent.direction = 'OUTBOUND'");
  });

  it("keeps selected private-agent filters tied to the owning instance before using message fallbacks", async () => {
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
      },
    );

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("WITH candidate_deals"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);
    expect(listSql).toContain("d.whatsapp_jid NOT LIKE '%@g.us'");
    expect(listSql).toContain("d.whatsapp_instance_id = $3::uuid");
    expect(listSql).toContain("d.whatsapp_instance_id IS NULL");
    expect(listSql).toContain("FROM whatsapp_monitor_messages wmm_inst");
    expect(listSql).toContain("LOWER(COALESCE(wmm_inst.instance_name, '')) = LOWER($4)");
  });

  it("passes the selected instance into conversation detail and scopes monitor reads", async () => {
    const selectedInstanceId = "00000000-0000-0000-0000-000000000001";

    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "deal-1",
            title: "Cliente",
            customer_display_name: "Cliente",
            whatsapp_jid: "5511999998888@s.whatsapp.net",
            whatsapp_instance_id: selectedInstanceId,
            instance_name: "tamires",
            instance_display_label: "Tamires",
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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getWhatsappMonitorConversation(
      "deal-1",
      {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "ADMIN",
      } as any,
      { instanceId: selectedInstanceId } as any,
    );

    const conversationCall = mocks.query.mock.calls[0];
    expect(conversationCall).toBeDefined();
    expect(conversationCall![1]).toContain(selectedInstanceId);
    expect(String(conversationCall![0])).toContain("selected_filter_instance");

    const fastReadCall = mocks.monitorQuery.mock.calls.find(call =>
      String(call[0]).includes("FROM whatsapp_monitor_messages wmm") &&
      String(call[0]).includes("wmm.message_id")
    );
    expect(fastReadCall).toBeDefined();
    expect(String(fastReadCall![0])).toContain("LOWER(COALESCE(wmm.instance_name, ''))");
    expect(String(fastReadCall![0])).toContain("wmm.remote_jid = ANY");
    expect(fastReadCall![1]).toContain(selectedInstanceId);
  });

  it("hydrates group display names from incoming messages before stale numeric chat profiles", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await listWhatsappMonitorConversations({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const listCall = mocks.query.mock.calls.find(call => String(call[0]).includes("WITH candidate_deals"));
    expect(listCall).toBeDefined();
    const listSql = String(listCall![0]);
    const sourceNameIndex = listSql.indexOf("NULLIF(wg.source_name, '')");
    const incomingNameIndex = listSql.indexOf("incoming_profile.chat_display_name");
    const chatProfileNameIndex = listSql.indexOf("chat_profile.display_name");

    expect(listSql).toContain("CASE WHEN d.whatsapp_jid LIKE '%@g.us'");
    expect(listSql).toContain("LEFT JOIN whatsapp_groups wg");
    expect(listSql).toContain("NULLIF(wg.source_name, '')");
    expect(sourceNameIndex).toBeGreaterThanOrEqual(0);
    expect(incomingNameIndex).toBeGreaterThanOrEqual(0);
    expect(chatProfileNameIndex).toBeGreaterThanOrEqual(0);
    expect(sourceNameIndex).toBeLessThan(incomingNameIndex);
    expect(incomingNameIndex).toBeLessThan(chatProfileNameIndex);
  });

  it("rejects group monitor rows whose raw provider remote belongs to a private chat", async () => {
    const selectedInstanceId = "00000000-0000-0000-0000-000000000001";
    const groupJid = "120363024604307554@g.us";

    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "deal-group",
            title: "218257369903149",
            customer_display_name: "218257369903149",
            whatsapp_jid: groupJid,
            whatsapp_instance_id: selectedInstanceId,
            instance_name: "tamires",
            instance_display_label: "Tamires",
            stage_name: "Contato Inicial",
            last_message_at: "2026-06-03T18:36:19.000Z",
            event_count: 0,
            inbound_count: 0,
            unread_after_read: 0,
            marked_unread: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getWhatsappMonitorConversation(
      "deal-group",
      {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "ADMIN",
      } as any,
      { instanceId: selectedInstanceId } as any,
    );

    const fastReadCall = mocks.monitorQuery.mock.calls.find(call =>
      String(call[0]).includes("FROM whatsapp_monitor_messages wmm") &&
      String(call[0]).includes("wmm.message_id")
    );
    expect(fastReadCall).toBeDefined();
    const fastSql = String(fastReadCall![0]);

    expect(fastSql).toContain("wmm.remote_jid = ANY");
    expect(fastSql).toContain("wmm.media_json #>> '{key,remoteJid}'");
    expect(fastSql).toContain("COALESCE(");
    expect(fastReadCall![1]).toContainEqual([groupJid]);
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveMetadata: vi.fn(),
  createEventFromMessage: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: {
    query: mocks.query,
  },
}));

vi.mock("./evolutionMetadataService.js", () => ({
  resolveWhatsappMessageMetadata: mocks.resolveMetadata,
}));

vi.mock("../events/eventsService.js", () => ({
  createEventFromMessage: mocks.createEventFromMessage,
}));

import { handleEvolutionWebhook } from "./evolutionWebhook.js";
import { getWhatsappMonitorConversation } from "./whatsappMonitorService.js";

describe("whatsapp conversation isolation", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.resolveMetadata.mockReset();
    mocks.createEventFromMessage.mockReset();
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
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "instance-amanda",
            display_label: "Amanda",
            phone_number: "+55 11 91234-5678",
            assigned_user_id: "user-amanda",
            assigned_user_name: "Amanda",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

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

    const dealMatchCall = mocks.query.mock.calls[2];
    expect(dealMatchCall).toBeDefined();
    const dealMatchQuery = String(dealMatchCall![0]);
    const dealMatchParams = dealMatchCall![1];

    expect(dealMatchParams).toEqual([
      "5511999998888@s.whatsapp.net",
      "instance-amanda",
      "user-amanda",
      "Amanda",
    ]);
    expect(dealMatchQuery).toContain("d.whatsapp_instance_id = $2::uuid");
    expect(dealMatchQuery).toContain("d.assigned_to = $3::uuid");
    expect(dealMatchQuery).toContain("LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($4)");
  });
});

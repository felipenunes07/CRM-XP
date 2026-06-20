import { describe, expect, it } from "vitest";
import { buildEventDeduplicationKey } from "./eventsService.js";

describe("message event deduplication", () => {
  it("uses the same key for the same group message replicated across seller instances", () => {
    const firstKey = buildEventDeduplicationKey({
      dealId: "deal-a",
      remoteJid: "120363000000000000@g.us",
      senderJid: "5511999999999@s.whatsapp.net",
      content: "Tem previsao do dia ou mes que vai chegar esses dois modelos de pecas?",
      createdAt: "2026-06-20T13:41:05.000Z",
      isGroup: true,
    });

    const replicatedKey = buildEventDeduplicationKey({
      dealId: "deal-b",
      remoteJid: "120363000000000000@g.us",
      senderJid: "5511999999999@s.whatsapp.net",
      content: "  Tem previsao do dia ou mes que vai chegar esses dois modelos de pecas?  ",
      createdAt: "2026-06-20T13:42:30.000Z",
      isGroup: true,
    });

    expect(replicatedKey).toBe(firstKey);
  });

  it("keeps private conversations and different group senders separated", () => {
    const groupKey = buildEventDeduplicationKey({
      dealId: "deal-a",
      remoteJid: "120363000000000000@g.us",
      senderJid: "5511999999999@s.whatsapp.net",
      content: "Falta estoque da tela do iPhone 11",
      createdAt: "2026-06-20T13:41:05.000Z",
      isGroup: true,
    });

    expect(buildEventDeduplicationKey({
      dealId: "deal-b",
      remoteJid: "120363000000000000@g.us",
      senderJid: "5511888888888@s.whatsapp.net",
      content: "Falta estoque da tela do iPhone 11",
      createdAt: "2026-06-20T13:41:40.000Z",
      isGroup: true,
    })).not.toBe(groupKey);

    expect(buildEventDeduplicationKey({
      dealId: "deal-b",
      remoteJid: "5511999999999@s.whatsapp.net",
      senderJid: "5511999999999@s.whatsapp.net",
      content: "Falta estoque da tela do iPhone 11",
      createdAt: "2026-06-20T13:41:40.000Z",
      isGroup: false,
    })).not.toBe(groupKey);
  });
});

import { describe, expect, it } from "vitest";
import type { WhatsappMonitorMessage } from "@olist-crm/shared";
import { buildEventChatMessages } from "./eventsChat";

const baseMonitorMessage: WhatsappMonitorMessage = {
  id: "msg-1",
  dealId: "deal-1",
  direction: "INBOUND",
  senderName: "Cliente",
  senderJid: "5511999999999@s.whatsapp.net",
  senderProfilePictureUrl: null,
  content: "Deu muito problema nessa tela",
  createdAt: "2026-06-20T12:00:00.000Z",
  remoteJid: "5511999999999@s.whatsapp.net",
  isGroup: false,
  metadata: {},
  risk: null,
};

describe("events chat helpers", () => {
  it("marks the exact message that generated a high or critical event", () => {
    const messages = buildEventChatMessages({
      seed: {
        dealId: "deal-1",
        messageId: "msg-1",
        eventId: "event-1",
        content: "Deu muito problema nessa tela",
        detectedAt: "2026-06-20T12:00:00.000Z",
        contactName: "Cliente",
        severity: "HIGH",
        label: "Feedback Negativo",
        reason: "Mensagem contem indicador explicito de problema.",
      },
      monitorMessages: [baseMonitorMessage],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.highlight).toMatchObject({
      severity: "HIGH",
      label: "Feedback Negativo",
      reason: "Mensagem contem indicador explicito de problema.",
    });
  });

  it("keeps a highlighted fallback when the monitor page does not include the captured message", () => {
    const messages = buildEventChatMessages({
      seed: {
        dealId: "deal-1",
        messageId: "missing-message",
        eventId: "event-1",
        content: "Cliente reclamando que esta faltando estoque",
        detectedAt: "2026-06-20T12:00:00.000Z",
        contactName: "Cliente",
        severity: "CRITICAL",
        label: "Falta de estoque",
      },
      monitorMessages: [],
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Cliente reclamando que esta faltando estoque");
    expect(messages[0]?.highlight?.severity).toBe("CRITICAL");
  });
});

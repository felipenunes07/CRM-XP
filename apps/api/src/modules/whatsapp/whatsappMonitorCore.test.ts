import { describe, expect, it } from "vitest";
import {
  computeWhatsappUnreadState,
  detectWhatsappMessageRisk,
  extractEvolutionMessageContext,
  formatWhatsappJidPhone,
  isWhatsappFallbackDisplayName,
  mapWhatsappActivityToMessage,
} from "./whatsappMonitorCore.js";

describe("whatsappMonitorCore", () => {
  it("formats individual and group WhatsApp JIDs for the monitoring UI", () => {
    expect(formatWhatsappJidPhone("5511998765432@s.whatsapp.net")).toBe("+55 (11) 99876-5432");
    expect(formatWhatsappJidPhone("120363371542185615@g.us")).toBe("Grupo 120363371542185615");
  });

  it("flags profanity as a moderate risk event", () => {
    const risk = detectWhatsappMessageRisk("Porra valeu, era isso mesmo que eu precisava!");

    expect(risk).toEqual({
      label: "Linguagem ofensiva",
      severity: "MODERATE",
      keyword: "porra",
    });
  });

  it("maps pipeline WhatsApp activities into chat messages with direction and risk", () => {
    const message = mapWhatsappActivityToMessage({
      id: "activity-1",
      dealId: "deal-1",
      activityType: "WHATSAPP_RECEIVED",
      actorName: "Amanda Carvalho",
      content: "Pode me mandar seu pix e senha?",
      metadata: { remoteJid: "5511998765432@s.whatsapp.net" },
      createdAt: "2026-05-07T12:33:00.000Z",
    });

    expect(message.direction).toBe("INBOUND");
    expect(message.senderName).toBe("Amanda Carvalho");
    expect(message.risk?.label).toBe("Dado sensivel");
    expect(message.remoteJid).toBe("5511998765432@s.whatsapp.net");
  });

  it("extracts group participant identity and chat metadata from Evolution messages", () => {
    const context = extractEvolutionMessageContext(
      {
        key: {
          remoteJid: "120363371542185615@g.us",
          fromMe: false,
          id: "msg-1",
          participant: "5511987654321@s.whatsapp.net",
        },
        pushName: "Amanda Carvalho",
        message: { conversation: "Oi, grupo!" },
        profilePictureUrl: "https://pps.whatsapp.net/member.jpg",
        messageTimestamp: 1778123580,
      },
      "comercial",
    );

    expect(context).toMatchObject({
      remoteJid: "120363371542185615@g.us",
      messageId: "msg-1",
      instanceName: "comercial",
      isGroup: true,
      fromMe: false,
      text: "Oi, grupo!",
      senderJid: "5511987654321@s.whatsapp.net",
      senderName: "Amanda Carvalho",
      senderProfilePictureUrl: "https://pps.whatsapp.net/member.jpg",
    });
    expect(context.createdAt).toBe("2026-05-07T03:13:00.000Z");
  });

  it("keeps group sender metadata when mapping stored activities to chat messages", () => {
    const message = mapWhatsappActivityToMessage({
      id: "activity-2",
      dealId: "deal-2",
      activityType: "WHATSAPP_RECEIVED",
      actorName: "Amanda Carvalho",
      content: "Mensagem dentro do grupo",
      metadata: {
        remoteJid: "120363371542185615@g.us",
        isGroup: true,
        senderJid: "5511987654321@s.whatsapp.net",
        senderName: "Amanda Carvalho",
        senderProfilePictureUrl: "https://pps.whatsapp.net/member.jpg",
        chatDisplayName: "Grupo Enterprise",
        chatProfilePictureUrl: "https://pps.whatsapp.net/group.jpg",
      },
      createdAt: "2026-05-07T12:33:00.000Z",
    });

    expect(message.isGroup).toBe(true);
    expect(message.senderJid).toBe("5511987654321@s.whatsapp.net");
    expect(message.senderName).toBe("Amanda Carvalho");
    expect(message.senderProfilePictureUrl).toBe("https://pps.whatsapp.net/member.jpg");
  });

  it("computes unread state with explicit marked-unread overrides", () => {
    expect(computeWhatsappUnreadState(0, false)).toEqual({ unreadCount: 0, isUnread: false });
    expect(computeWhatsappUnreadState(3, false)).toEqual({ unreadCount: 3, isUnread: true });
    expect(computeWhatsappUnreadState(0, true)).toEqual({ unreadCount: 1, isUnread: true });
  });

  it("detects numeric fallback names that should be refreshed from Evolution", () => {
    expect(isWhatsappFallbackDisplayName("Grupo 120363371542185615", "120363371542185615@g.us")).toBe(true);
    expect(isWhatsappFallbackDisplayName("[GRUPO] 12036337", "120363371542185615@g.us")).toBe(true);
    expect(isWhatsappFallbackDisplayName("Grupo Enterprise Comercial", "120363371542185615@g.us")).toBe(false);
    expect(isWhatsappFallbackDisplayName("+55 (11) 99876-5432", "5511998765432@s.whatsapp.net")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  computeWhatsappUnreadState,
  detectWhatsappMessageRisk,
  extractEvolutionMessageContext,
  extractEvolutionMessageMedia,
  extractEvolutionMessageText,
  formatEvolutionSendTextTarget,
  formatWhatsappPhoneJid,
  formatWhatsappJidPhone,
  getEvolutionMessageKey,
  isMonitorableWhatsappJid,
  isWhatsappFallbackDisplayName,
  mapWhatsappActivityToMessage,
  median,
} from "./whatsappMonitorCore.js";

describe("whatsappMonitorCore", () => {
  it("formats individual and group WhatsApp JIDs for the monitoring UI", () => {
    expect(formatWhatsappJidPhone("5511998765432@s.whatsapp.net")).toBe("+55 (11) 99876-5432");
    expect(formatWhatsappJidPhone("120363371542185615@g.us")).toBe("Grupo 120363371542185615");
  });

  it("rejects WhatsApp status broadcasts from the monitoring flow", () => {
    expect(isMonitorableWhatsappJid("5511998765432@s.whatsapp.net")).toBe(true);
    expect(isMonitorableWhatsappJid("120363371542185615@g.us")).toBe(true);
    expect(isMonitorableWhatsappJid("status@broadcast")).toBe(false);
    expect(isMonitorableWhatsappJid("1234567890@broadcast")).toBe(false);
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

  it("does not treat the customer JID as the sender for outbound direct messages", () => {
    const context = extractEvolutionMessageContext(
      {
        key: {
          remoteJid: "5511998765432@s.whatsapp.net",
          fromMe: true,
          id: "msg-out-1",
        },
        message: { conversation: "Mensagem respondida pelo celular" },
      },
      "comercial",
    );

    expect(context).toMatchObject({
      remoteJid: "5511998765432@s.whatsapp.net",
      fromMe: true,
      senderJid: null,
    });
  });

  it("normalizes Evolution string fromMe flags and participant phone JIDs", () => {
    const context = extractEvolutionMessageContext(
      {
        key: {
          remoteJid: "120363371542185615@g.us",
          fromMe: "true",
          id: "msg-out-group-1",
          participant: "278971715473575@lid",
          participantPn: "5511959502231@s.whatsapp.net",
        } as any,
        message: { conversation: "Resposta enviada pelo WhatsApp Web" },
      },
      "comercial",
    );

    expect(context).toMatchObject({
      remoteJid: "120363371542185615@g.us",
      fromMe: true,
      senderJid: "5511959502231@s.whatsapp.net",
    });
  });

  it("extracts Evolution media metadata for image and audio messages", () => {
    const imageMessage = {
      message: {
        base64: "abc123",
        imageMessage: {
          url: "https://media.example/image.jpg",
          mimetype: "image/jpeg",
          caption: "Foto do produto",
          fileName: "produto.jpg",
        },
      },
    };
    const audioMessage = {
      message: {
        base64: "zzz999",
        audioMessage: {
          url: "https://media.example/audio.ogg",
          mimetype: "audio/ogg",
        },
      },
    };

    expect(extractEvolutionMessageMedia(imageMessage)).toMatchObject({
      mediaType: "image",
      mediaUrl: "https://media.example/image.jpg",
      mediaBase64: "abc123",
      mimeType: "image/jpeg",
      caption: "Foto do produto",
      fileName: "produto.jpg",
    });
    expect(extractEvolutionMessageMedia(audioMessage)).toMatchObject({
      mediaType: "audio",
      mediaUrl: "https://media.example/audio.ogg",
      mediaBase64: "zzz999",
      mimeType: "audio/ogg",
    });
    expect(extractEvolutionMessageText(audioMessage)).toBe("[Áudio]");
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

  it("formats the Evolution send target without losing group JIDs", () => {
    expect(formatEvolutionSendTextTarget("5511998765432@s.whatsapp.net")).toBe("5511998765432");
    expect(formatEvolutionSendTextTarget("120363371542185615@g.us")).toBe("120363371542185615@g.us");
    expect(formatEvolutionSendTextTarget("+55 (11) 99876-5432")).toBe("5511998765432");
  });

  it("formats a connected WhatsApp phone as an owner JID", () => {
    expect(formatWhatsappPhoneJid("+55 (11) 91234-5678")).toBe("5511912345678@s.whatsapp.net");
    expect(formatWhatsappPhoneJid(null)).toBeNull();
  });

  it("extracts Evolution message keys from monitor messages", () => {
    const message = mapWhatsappActivityToMessage({
      id: "activity-3",
      dealId: "deal-3",
      activityType: "WHATSAPP_RECEIVED",
      actorName: "Amanda Carvalho",
      content: "Oi",
      metadata: {
        remoteJid: "5511998765432@s.whatsapp.net",
        messageId: "BAE594145F4C59B4",
      },
      createdAt: "2026-05-07T12:33:00.000Z",
    });

    expect(getEvolutionMessageKey(message)).toEqual({
      remoteJid: "5511998765432@s.whatsapp.net",
      fromMe: false,
      id: "BAE594145F4C59B4",
    });
  });

  it("computes median values for response-time indicators", () => {
    expect(median([12, 5, 20])).toBe(12);
    expect(median([12, 5, 20, 8])).toBe(10);
    expect(median([])).toBeNull();
  });
});

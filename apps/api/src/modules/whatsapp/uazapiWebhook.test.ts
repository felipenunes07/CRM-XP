import { describe, expect, it } from "vitest";
import { uazapiMessageToEvolution } from "./uazapiWebhook.js";
import {
  extractEvolutionMessageContext,
  extractEvolutionMessageMedia,
  extractEvolutionMessageContact,
} from "./whatsappMonitorCore.js";

describe("uazapiMessageToEvolution", () => {
  it("converts a private text message into Evolution context", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "ABC123",
      chatid: "5511999998888@s.whatsapp.net",
      sender: "5511999998888@s.whatsapp.net",
      senderName: "João Cliente",
      fromMe: false,
      isGroup: false,
      messageType: "text",
      text: "Olá, tudo bem?",
      messageTimestamp: 1748000000,
    });

    expect(ev).not.toBeNull();
    const ctx = extractEvolutionMessageContext(ev!, "minha-instancia");
    expect(ctx.remoteJid).toBe("5511999998888@s.whatsapp.net");
    expect(ctx.messageId).toBe("ABC123");
    expect(ctx.isGroup).toBe(false);
    expect(ctx.fromMe).toBe(false);
    expect(ctx.text).toBe("Olá, tudo bem?");
    expect(ctx.senderName).toBe("João Cliente");
  });

  it("normalizes bare phone numbers and legacy @c.us into s.whatsapp.net", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "ID1",
      chatid: "5511988887777@c.us",
      text: "oi",
    });
    const ctx = extractEvolutionMessageContext(ev!, null);
    expect(ctx.remoteJid).toBe("5511988887777@s.whatsapp.net");

    const ev2 = uazapiMessageToEvolution({ messageid: "ID2", chatid: "5511977776666", text: "oi" });
    const ctx2 = extractEvolutionMessageContext(ev2!, null);
    expect(ctx2.remoteJid).toBe("5511977776666@s.whatsapp.net");
  });

  it("converts a group message and exposes participant + group name", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "GRP1",
      chatid: "120363111222333@g.us",
      sender: "5511955554444@s.whatsapp.net",
      senderName: "Maria",
      groupName: "Clientes VIP",
      isGroup: true,
      messageType: "text",
      text: "mensagem no grupo",
    });
    const ctx = extractEvolutionMessageContext(ev!, "inst");
    expect(ctx.isGroup).toBe(true);
    expect(ctx.remoteJid).toBe("120363111222333@g.us");
    expect(ctx.senderJid).toBe("5511955554444@s.whatsapp.net");
    expect(ctx.chatDisplayName).toBe("Clientes VIP");
  });

  it("converts an image message into extractable media + caption", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "IMG1",
      chatid: "5511999998888@s.whatsapp.net",
      messageType: "image",
      fileURL: "https://cdn.uazapi.com/file/abc.jpg",
      mimetype: "image/jpeg",
      caption: "Olha essa foto",
    });
    const media = extractEvolutionMessageMedia(ev!);
    expect(media?.mediaType).toBe("image");
    expect(media?.mediaUrl).toBe("https://cdn.uazapi.com/file/abc.jpg");
    expect(media?.caption).toBe("Olha essa foto");

    const ctx = extractEvolutionMessageContext(ev!, null);
    expect(ctx.text).toBe("Olha essa foto");
  });

  it("converts an audio message and yields a placeholder text", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "AUD1",
      chatid: "5511999998888@s.whatsapp.net",
      messageType: "audio",
      fileURL: "https://cdn.uazapi.com/file/voice.ogg",
      mimetype: "audio/ogg",
    });
    const media = extractEvolutionMessageMedia(ev!);
    expect(media?.mediaType).toBe("audio");
    const ctx = extractEvolutionMessageContext(ev!, null);
    expect(ctx.text).toBe("[Áudio]");
  });

  it("converts a contact message", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "CON1",
      chatid: "5511999998888@s.whatsapp.net",
      messageType: "contact",
      displayName: "Fornecedor X",
      vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:Fornecedor X\nTEL;waid=5511944443333:+55 11 94444-3333\nEND:VCARD",
    });
    const contact = extractEvolutionMessageContact(ev!);
    expect(contact?.displayName).toBe("Fornecedor X");
    expect(contact?.phoneNumber).toBe("5511944443333");
  });

  it("detects fromMe outbound messages", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "OUT1",
      chatid: "5511999998888@s.whatsapp.net",
      fromMe: true,
      messageType: "text",
      text: "resposta do atendente",
    });
    const ctx = extractEvolutionMessageContext(ev!, null);
    expect(ctx.fromMe).toBe(true);
  });

  it("converts millisecond timestamps to seconds-based ISO", () => {
    const ev = uazapiMessageToEvolution({
      messageid: "TS1",
      chatid: "5511999998888@s.whatsapp.net",
      text: "oi",
      messageTimestamp: 1748000000000,
    });
    const ctx = extractEvolutionMessageContext(ev!, null);
    expect(new Date(ctx.createdAt).getUTCFullYear()).toBe(2025);
  });

  it("returns null when chat id or message id is missing", () => {
    expect(uazapiMessageToEvolution({ text: "no ids" })).toBeNull();
    expect(uazapiMessageToEvolution({ chatid: "5511999998888@s.whatsapp.net" })).toBeNull();
  });

  it("unwraps a nested message envelope", () => {
    const ev = uazapiMessageToEvolution({
      message: {
        messageid: "NEST1",
        chatid: "5511999998888@s.whatsapp.net",
        text: "dentro do envelope",
      },
    });
    const ctx = extractEvolutionMessageContext(ev!, null);
    expect(ctx.messageId).toBe("NEST1");
    expect(ctx.text).toBe("dentro do envelope");
  });
});

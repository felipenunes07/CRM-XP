import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { handleEvolutionWebhook } from "./evolutionWebhook.js";
import type { EvolutionMessageLike } from "./whatsappMonitorCore.js";

/**
 * uazapi (uazapiGO v2) inbound webhook adapter.
 *
 * The CRM's message/communication pipeline is built around the Evolution API
 * payload shape (Baileys-style `key` + `message`). uazapi delivers its webhook
 * with a different, flatter structure. Rather than duplicate the whole
 * deal-matching / media / group / monitor pipeline, this adapter TRANSLATES a
 * uazapi message into the Evolution shape and delegates to
 * `handleEvolutionWebhook`, so uazapi instances get exactly the same behaviour
 * as Evolution ones (private chats, groups, images, audio, contacts, etc.).
 *
 * The adapter is intentionally defensive about field names because uazapi has
 * shipped slightly different payloads across versions. The full raw payload is
 * always logged so the exact incoming shape can be confirmed in production.
 */

type AnyRecord = Record<string, unknown>;

interface UazapiWebhookPayload {
  EventType?: string;
  event?: string;
  type?: string;
  instance?: string;
  instanceName?: string;
  instance_name?: string;
  session?: string;
  owner?: string;
  token?: string;
  message?: unknown;
  messages?: unknown;
  data?: unknown;
  chat?: unknown;
  [key: string]: unknown;
}

function asRecord(value: unknown): AnyRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AnyRecord;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function pick(source: AnyRecord | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = readString(source[key]);
    if (value) return value;
  }
  return null;
}

function readBool(source: AnyRecord | null, keys: string[]): boolean | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    if (typeof value === "string") {
      const n = value.trim().toLowerCase();
      if (["true", "1", "yes", "sim"].includes(n)) return true;
      if (["false", "0", "no", "nao", "não"].includes(n)) return false;
    }
  }
  return null;
}

/**
 * Normalizes a uazapi chat/sender id into a canonical WhatsApp JID.
 * Handles bare phone numbers and the legacy "@c.us" server suffix that some
 * uazapi versions emit instead of "@s.whatsapp.net".
 */
function normalizeUazapiJid(value: string | null): string | null {
  if (!value) return null;
  let jid = value.trim();
  if (!jid) return null;

  if (jid.includes("@")) {
    const [rawId = "", server = ""] = jid.split("@");
    const lowerServer = server.toLowerCase();
    if (lowerServer === "c.us" || lowerServer === "s.whatsapp.net") {
      const digits = rawId.replace(/\D/g, "");
      return digits ? `${digits}@s.whatsapp.net` : jid;
    }
    if (lowerServer === "g.us") {
      // group id may contain a dash (e.g. 12036...-16091...@g.us); keep it intact
      return `${rawId}@g.us`;
    }
    if (lowerServer === "lid") {
      const digits = rawId.replace(/\D/g, "");
      return digits ? `${digits}@lid` : jid;
    }
    return jid;
  }

  // bare value: a long numeric with a dash is a group id, otherwise a phone
  const digits = jid.replace(/\D/g, "");
  if (jid.includes("-")) {
    return `${jid}@g.us`;
  }
  return digits ? `${digits}@s.whatsapp.net` : jid;
}

const MEDIA_TYPE_MAP: Array<{ match: RegExp; key: string }> = [
  { match: /image|imagem/i, key: "imageMessage" },
  { match: /video|vídeo/i, key: "videoMessage" },
  { match: /audio|áudio|voice|ptt/i, key: "audioMessage" },
  { match: /sticker|figurinha/i, key: "stickerMessage" },
  { match: /document|documento|file|arquivo/i, key: "documentMessage" },
];

function resolveMediaKey(typeHint: string | null): string | null {
  if (!typeHint) return null;
  for (const { match, key } of MEDIA_TYPE_MAP) {
    if (match.test(typeHint)) return key;
  }
  return null;
}

/**
 * Builds a Baileys-style `message` content object from a flat uazapi message so
 * the existing Evolution text/media/contact extractors can read it unchanged.
 */
function buildEvolutionMessageContent(
  msg: AnyRecord,
  text: string | null,
): { content: AnyRecord | undefined; base64: string | null } {
  const typeHint =
    pick(msg, ["messageType", "type", "mediaType", "mimetype", "mimeType"]) ?? null;

  // Contact / vcard
  const vcard = pick(msg, ["vcard", "vCard"]);
  if (vcard || /contact|contato/i.test(typeHint ?? "")) {
    const contactRecord = asRecord(msg.contact) ?? asRecord(msg.contactMessage);
    return {
      content: {
        contactMessage: {
          displayName:
            pick(msg, ["displayName", "contactName", "name", "senderName"]) ??
            pick(contactRecord, ["displayName", "fullName", "name"]),
          vcard: vcard ?? pick(contactRecord, ["vcard", "vCard"]),
        },
      },
      base64: null,
    };
  }

  const mediaKey = resolveMediaKey(typeHint);
  const mediaUrl = pick(msg, ["fileURL", "fileUrl", "mediaUrl", "url", "file", "downloadUrl"]);
  const base64 = pick(msg, ["base64", "fileBase64", "mediaBase64", "data"]);
  const looksLikeMedia = Boolean(mediaKey && (mediaUrl || base64 || typeHint));

  if (looksLikeMedia && mediaKey) {
    const caption = pick(msg, ["caption", "text", "body"]);
    return {
      content: {
        [mediaKey]: {
          url: mediaUrl,
          caption: caption,
          mimetype: pick(msg, ["mimetype", "mimeType"]),
          fileName: pick(msg, ["fileName", "filename", "documentName"]),
        },
      },
      base64,
    };
  }

  if (text) {
    return { content: { conversation: text }, base64: null };
  }

  // Unknown type without text — let downstream placeholder logic handle it.
  if (mediaKey) {
    return { content: { [mediaKey]: {} }, base64: null };
  }

  return { content: undefined, base64: null };
}

/**
 * Converts a single uazapi message object into an Evolution-shaped message.
 */
export function uazapiMessageToEvolution(raw: unknown): EvolutionMessageLike | null {
  const msg = asRecord(raw);
  if (!msg) return null;

  // uazapi may nest the real message under `message` (envelope already unwrapped
  // by the caller, but handle defensively).
  const inner = asRecord(msg.message);
  const m = inner && (inner.chatid || inner.key || inner.messageid || inner.text) ? inner : msg;

  const key = asRecord(m.key);

  const chatJid = normalizeUazapiJid(
    pick(m, ["chatid", "chatId", "chat", "remoteJid", "jid", "from", "to"]) ??
      pick(key, ["remoteJid"]),
  );
  const messageId =
    pick(m, ["messageid", "messageId", "id", "stanzaId"]) ?? pick(key, ["id"]);

  if (!chatJid || !messageId) {
    return null;
  }

  const fromMe =
    readBool(m, ["fromMe", "fromme", "isOutbound", "wasSentByApi"]) ??
    readBool(key, ["fromMe"]) ??
    false;

  const isGroup =
    readBool(m, ["isGroup", "isGroupMsg", "isgroup"]) ??
    chatJid.endsWith("@g.us");

  const senderJid = normalizeUazapiJid(
    pick(m, ["sender", "senderJid", "participant", "author", "participantJid"]) ??
      pick(key, ["participant"]),
  );

  const senderName = pick(m, [
    "senderName",
    "pushName",
    "notifyName",
    "participantName",
    "name",
    "verifiedBizName",
  ]);

  const groupName = pick(m, ["groupName", "chatName", "groupSubject", "subject"]);

  const text =
    pick(m, ["text", "body", "caption", "conversation"]) ??
    (typeof m.content === "string" ? readString(m.content) : null);

  const { content, base64 } = buildEvolutionMessageContent(m, text);

  const tsRaw =
    pick(m, ["messageTimestamp", "timestamp", "momment", "moment", "t", "date"]) ?? null;
  let messageTimestamp: number | string | undefined;
  if (tsRaw) {
    const num = Number(tsRaw);
    if (Number.isFinite(num)) {
      // uazapi may send milliseconds; Evolution expects seconds.
      messageTimestamp = num > 1e12 ? Math.floor(num / 1000) : num;
    } else {
      messageTimestamp = tsRaw;
    }
  }

  const evolution: EvolutionMessageLike & AnyRecord = {
    key: {
      remoteJid: chatJid,
      fromMe,
      id: messageId,
      ...(isGroup && senderJid ? { participant: senderJid } : {}),
    },
    ...(content ? { message: content } : {}),
    // top-level fallbacks used by the Evolution extractors
    pushName: senderName ?? undefined,
    senderName: senderName ?? undefined,
    remoteJid: chatJid,
    ...(senderJid ? { senderJid, participant: isGroup ? senderJid : undefined } : {}),
    ...(groupName ? { chatName: groupName, groupSubject: groupName } : {}),
    ...(text ? { text } : {}),
    ...(base64 ? { base64 } : {}),
    fromMe,
    ...(messageTimestamp !== undefined ? { messageTimestamp } : {}),
    profilePictureUrl:
      pick(m, ["senderProfilePictureUrl", "profilePictureUrl", "profilePicUrl", "imgUrl"]) ??
      undefined,
  };

  return evolution;
}

/**
 * Resolves the registered CRM instance_name for an incoming uazapi webhook.
 * Tries, in order: explicit instance field, instance token, owner phone, and
 * finally falls back to the single active UAZAPI instance if only one exists.
 */
async function resolveUazapiInstanceName(payload: UazapiWebhookPayload): Promise<string | null> {
  const explicit =
    readString(payload.instance) ??
    readString(payload.instanceName) ??
    readString(payload.instance_name) ??
    readString(payload.session);

  if (explicit) {
    const byName = await pool.query(
      `SELECT instance_name FROM whatsapp_instances
       WHERE LOWER(instance_name) = LOWER($1) LIMIT 1`,
      [explicit],
    );
    if (byName.rows[0]) return String(byName.rows[0].instance_name);
  }

  const token = readString(payload.token);
  if (token) {
    const byToken = await pool.query(
      `SELECT instance_name FROM whatsapp_instances
       WHERE provider = 'UAZAPI' AND uazapi_token = $1 LIMIT 1`,
      [token],
    );
    if (byToken.rows[0]) return String(byToken.rows[0].instance_name);
  }

  const owner = readString(payload.owner);
  if (owner) {
    const ownerDigits = owner.replace(/\D/g, "");
    if (ownerDigits) {
      const byPhone = await pool.query(
        `SELECT instance_name FROM whatsapp_instances
         WHERE provider = 'UAZAPI'
           AND regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = $1
         LIMIT 1`,
        [ownerDigits],
      );
      if (byPhone.rows[0]) return String(byPhone.rows[0].instance_name);
    }
  }

  // Fall back to the sole UAZAPI instance, if there is exactly one.
  const single = await pool.query(
    `SELECT instance_name FROM whatsapp_instances WHERE provider = 'UAZAPI' LIMIT 2`,
  );
  if (single.rows.length === 1) {
    return String(single.rows[0].instance_name);
  }

  return explicit ?? null;
}

const MESSAGE_EVENT_HINTS = /message|mensagem|messages|webhookreceived|receive/i;

export async function handleUazapiWebhook(payload: UazapiWebhookPayload) {
  const rawStr = JSON.stringify(payload ?? {});
  const eventType = readString(payload?.EventType) ?? readString(payload?.event) ?? readString(payload?.type);

  logger.info("uazapi webhook raw event received", {
    eventType,
    payloadSize: rawStr.length,
    payloadPreview: rawStr.slice(0, 800),
  });

  if (!payload || typeof payload !== "object") {
    return { processed: false, reason: "empty payload" };
  }

  // Only message events feed the communication inbox. Accept when the event type
  // looks like a message event, or when no event type is provided but a message
  // body is present.
  const hasMessageBody = Boolean(payload.message ?? payload.messages ?? payload.data);
  if (eventType && !MESSAGE_EVENT_HINTS.test(eventType) && !hasMessageBody) {
    logger.info("uazapi webhook ignored non-message event", { eventType });
    return { processed: false, event: eventType };
  }

  const instanceName = await resolveUazapiInstanceName(payload);
  if (!instanceName) {
    logger.warn("uazapi webhook could not resolve instance", {
      owner: payload.owner,
      hasToken: Boolean(payload.token),
      session: payload.session,
    });
  }

  // Collect candidate message objects from the various envelope shapes.
  const rawMessages: unknown[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) rawMessages.push(...v);
    else if (v) rawMessages.push(v);
  };
  push(payload.message);
  push(payload.messages);
  if (rawMessages.length === 0) push(payload.data);
  // Some uazapi versions put the message fields at the top level of the payload.
  if (rawMessages.length === 0 && (payload.chatid || payload.messageid || payload.text)) {
    rawMessages.push(payload);
  }

  const converted: EvolutionMessageLike[] = [];
  for (const rm of rawMessages) {
    const ev = uazapiMessageToEvolution(rm);
    if (ev) converted.push(ev);
    else logger.info("uazapi webhook skipped unconvertible message", { preview: JSON.stringify(rm).slice(0, 300) });
  }

  if (converted.length === 0) {
    return { processed: false, reason: "no convertible messages", event: eventType };
  }

  return handleEvolutionWebhook(
    {
      event: "messages.upsert",
      instance: instanceName ?? "unknown",
      data: converted,
    },
    "uazapi",
  );
}

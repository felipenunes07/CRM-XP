import type {
  DealActivity,
  WhatsappMessageRisk,
  WhatsappMonitorMessage,
  WhatsappMonitorMessageDirection,
} from "@olist-crm/shared";

const OFFENSIVE_KEYWORDS = ["porra", "caralho", "merda", "puta", "fdp"];
const SENSITIVE_KEYWORDS = ["senha", "pix", "cpf", "cnpj", "cartao", "cartao de credito", "token"];
const PRESSURE_KEYWORDS = ["urgente", "processo", "reclamacao", "procon", "cancelar"];

interface EvolutionMessageKeyLike {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
  participant?: string;
}

export interface EvolutionMessageLike {
  key?: EvolutionMessageKeyLike;
  message?: Record<string, unknown>;
  pushName?: string;
  participant?: string;
  sender?: string;
  senderJid?: string;
  participantJid?: string;
  participantName?: string;
  messageTimestamp?: number | string;
  profilePictureUrl?: string;
  profilePicUrl?: string;
  pictureUrl?: string;
  picture?: string;
  imgUrl?: string;
  avatar?: string;
  chatName?: string;
  groupSubject?: string;
  subject?: string;
  name?: string;
}

export interface EvolutionMessageContext {
  remoteJid: string | null;
  messageId: string | null;
  instanceName: string | null;
  isGroup: boolean;
  fromMe: boolean;
  text: string | null;
  senderJid: string | null;
  senderName: string | null;
  senderProfilePictureUrl: string | null;
  chatDisplayName: string | null;
  chatProfilePictureUrl: string | null;
  createdAt: string;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function firstKeyword(text: string, keywords: string[]) {
  return keywords.find((keyword) => text.includes(keyword)) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickString(source: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = readString(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractNestedString(source: Record<string, unknown> | null, path: string[]): string | null {
  let current: unknown = source;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record) {
      return null;
    }
    current = record[segment];
  }

  return readString(current);
}

function evolutionTimestampToIso(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return new Date().toISOString();
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return new Date().toISOString();
  }

  const timestampMs = numeric < 100000000000 ? numeric * 1000 : numeric;
  return new Date(timestampMs).toISOString();
}

export function extractEvolutionMessageText(message: EvolutionMessageLike): string | null {
  const rawMessage = asRecord(message.message);

  return (
    extractNestedString(rawMessage, ["conversation"]) ??
    extractNestedString(rawMessage, ["extendedTextMessage", "text"]) ??
    extractNestedString(rawMessage, ["imageMessage", "caption"]) ??
    extractNestedString(rawMessage, ["videoMessage", "caption"]) ??
    extractNestedString(rawMessage, ["documentMessage", "caption"]) ??
    extractNestedString(rawMessage, ["documentMessage", "fileName"]) ??
    null
  );
}

export function extractEvolutionMessageContext(
  message: EvolutionMessageLike,
  instanceName?: string | null,
): EvolutionMessageContext {
  const rawMessage = message as Record<string, unknown>;
  const key = message.key ?? {};
  const remoteJid = readString(key.remoteJid) ?? pickString(rawMessage, ["remoteJid", "chatId", "jid"]);
  const isGroup = Boolean(remoteJid?.endsWith("@g.us"));
  const fromMe = Boolean(key.fromMe);
  const senderJid =
    readString(key.participant) ??
    pickString(rawMessage, ["participant", "senderJid", "participantJid", "sender"]) ??
    (isGroup || fromMe ? null : remoteJid);
  const senderName =
    readString(message.pushName) ??
    pickString(rawMessage, ["participantName", "senderName", "notifyName", "verifiedBizName", "name"]);

  return {
    remoteJid,
    messageId: readString(key.id) ?? pickString(rawMessage, ["id", "messageId"]),
    instanceName: instanceName ?? null,
    isGroup,
    fromMe,
    text: extractEvolutionMessageText(message),
    senderJid,
    senderName,
    senderProfilePictureUrl: pickString(rawMessage, [
      "profilePictureUrl",
      "profilePicUrl",
      "senderProfilePictureUrl",
      "participantProfilePictureUrl",
      "avatar",
      "imgUrl",
    ]),
    chatDisplayName: pickString(rawMessage, ["chatDisplayName", "chatName", "groupSubject", "subject"]),
    chatProfilePictureUrl: pickString(rawMessage, ["chatProfilePictureUrl", "chatPictureUrl", "pictureUrl"]),
    createdAt: evolutionTimestampToIso(message.messageTimestamp),
  };
}

export function computeWhatsappUnreadState(inboundCountAfterRead: number, markedUnread: boolean) {
  const normalizedCount = Math.max(0, Math.floor(inboundCountAfterRead));
  const unreadCount = markedUnread && normalizedCount === 0 ? 1 : normalizedCount;

  return {
    unreadCount,
    isUnread: unreadCount > 0 || markedUnread,
  };
}

export function isMonitorableWhatsappJid(jid: string | null | undefined) {
  if (!jid) {
    return false;
  }

  const normalized = jid.trim().toLocaleLowerCase("pt-BR");
  return normalized !== "status@broadcast" && !normalized.endsWith("@broadcast");
}

export function formatWhatsappJidPhone(jid: string | null | undefined) {
  if (!jid) {
    return "Sem telefone";
  }

  const [rawId = jid] = jid.split("@");
  const digits = rawId.replace(/\D/g, "");

  if (jid.endsWith("@g.us")) {
    return `Grupo ${digits || rawId}`;
  }

  if (digits.startsWith("55") && digits.length >= 12) {
    const area = digits.slice(2, 4);
    const number = digits.slice(4);
    const prefix = number.length > 8 ? number.slice(0, 5) : number.slice(0, 4);
    const suffix = number.length > 8 ? number.slice(5) : number.slice(4);
    return `+55 (${area}) ${prefix}-${suffix}`;
  }

  return digits || rawId;
}

export function formatEvolutionSendTextTarget(destination: string) {
  const trimmed = destination.trim();
  if (trimmed.endsWith("@g.us")) {
    return trimmed;
  }

  const [rawId = trimmed] = trimmed.split("@");
  const digits = rawId.replace(/\D/g, "");
  return digits || rawId;
}

export function formatWhatsappPhoneJid(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

export function isWhatsappFallbackDisplayName(name: string | null | undefined, remoteJid: string | null | undefined) {
  if (!name || !remoteJid) {
    return true;
  }

  const normalized = normalizeText(name).replace(/\s+/g, " ").trim();
  const [rawId = remoteJid] = remoteJid.split("@");
  const digits = rawId.replace(/\D/g, "");

  if (!normalized) {
    return true;
  }

  if (normalized === normalizeText(remoteJid) || normalized === normalizeText(rawId)) {
    return true;
  }

  if (remoteJid.endsWith("@g.us")) {
    return normalized === `grupo ${digits}` || normalized.startsWith(`[grupo] ${digits.slice(0, 8)}`);
  }

  const formattedPhone = normalizeText(formatWhatsappJidPhone(remoteJid));
  return normalized === formattedPhone || normalized === digits;
}

export function detectWhatsappMessageRisk(content: string | null | undefined): WhatsappMessageRisk | null {
  if (!content) {
    return null;
  }

  const normalized = normalizeText(content);
  const sensitiveKeyword = firstKeyword(normalized, SENSITIVE_KEYWORDS);
  if (sensitiveKeyword) {
    return {
      label: "Dado sensivel",
      severity: "HIGH",
      keyword: sensitiveKeyword,
    };
  }

  const offensiveKeyword = firstKeyword(normalized, OFFENSIVE_KEYWORDS);
  if (offensiveKeyword) {
    return {
      label: "Linguagem ofensiva",
      severity: "MODERATE",
      keyword: offensiveKeyword,
    };
  }

  const pressureKeyword = firstKeyword(normalized, PRESSURE_KEYWORDS);
  if (pressureKeyword) {
    return {
      label: "Atendimento sensivel",
      severity: "LOW",
      keyword: pressureKeyword,
    };
  }

  return null;
}

export function getEvolutionMessageKey(message: WhatsappMonitorMessage) {
  const messageId =
    typeof message.metadata.messageId === "string"
      ? message.metadata.messageId
      : typeof message.metadata.providerMessageId === "string"
        ? message.metadata.providerMessageId
        : null;

  if (!message.remoteJid || !messageId) {
    return null;
  }

  return {
    remoteJid: message.remoteJid,
    fromMe: message.direction === "OUTBOUND",
    id: messageId,
  };
}

export function median(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!finiteValues.length) {
    return null;
  }

  const midpoint = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2) {
    return finiteValues[midpoint] ?? null;
  }

  const left = finiteValues[midpoint - 1] ?? 0;
  const right = finiteValues[midpoint] ?? 0;
  return (left + right) / 2;
}

export function whatsappActivityDirection(activityType: DealActivity["activityType"]): WhatsappMonitorMessageDirection {
  if (activityType === "WHATSAPP_RECEIVED") {
    return "INBOUND";
  }

  if (activityType === "WHATSAPP_SENT") {
    return "OUTBOUND";
  }

  return "SYSTEM";
}

export function mapWhatsappActivityToMessage(activity: DealActivity): WhatsappMonitorMessage {
  const content = activity.content ?? "";
  const remoteJid = typeof activity.metadata.remoteJid === "string" ? activity.metadata.remoteJid : null;
  const senderName = typeof activity.metadata.senderName === "string" ? activity.metadata.senderName : activity.actorName;
  const senderJid = typeof activity.metadata.senderJid === "string" ? activity.metadata.senderJid : null;
  const senderProfilePictureUrl =
    typeof activity.metadata.senderProfilePictureUrl === "string" ? activity.metadata.senderProfilePictureUrl : null;
  const isGroup =
    typeof activity.metadata.isGroup === "boolean"
      ? activity.metadata.isGroup
      : Boolean(remoteJid?.endsWith("@g.us"));

  return {
    id: activity.id,
    dealId: activity.dealId,
    direction: whatsappActivityDirection(activity.activityType),
    senderName,
    senderJid,
    senderProfilePictureUrl,
    content,
    createdAt: activity.createdAt,
    remoteJid,
    isGroup,
    metadata: activity.metadata,
    risk: detectWhatsappMessageRisk(content),
  };
}

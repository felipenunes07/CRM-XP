import type {
  WhatsappCampaignRecipientStatus,
  WhatsappCampaignStatus,
  WhatsappGroupClassification,
  WhatsappGroupMappingStatus,
  WhatsappGroupMatchMethod,
} from "@olist-crm/shared";

export const WHATSAPP_GROUP_CLASSIFICATIONS = ["WITH_ORDER", "NO_ORDER_EXCEL", "OTHER"] as const;
export const WHATSAPP_GROUP_MAPPING_STATUSES = [
  "AUTO_MAPPED",
  "MANUAL_MAPPED",
  "PENDING_REVIEW",
  "CONFIRMED_UNMATCHED",
  "IGNORED",
] as const;
export const WHATSAPP_GROUP_MATCH_METHODS = ["CODE", "NAME", "MANUAL", "CONFIRMED_NONE", "IGNORED"] as const;
export const WHATSAPP_CAMPAIGN_STATUSES = ["QUEUED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const WHATSAPP_RECIPIENT_STATUSES = [
  "PENDING",
  "BLOCKED_RECENT",
  "SENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
] as const;

const SOURCE_CODE_REGEX = /\b(CL\d+|KH\d+|LJ\d+)\b/i;

export function normalizeWhatsappJid(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim().toLowerCase();
  if (!cleaned) {
    return "";
  }

  if (cleaned.includes("@")) {
    return cleaned;
  }

  const digits = cleaned.replace(/[^\d]/g, "");
  return digits ? `${digits}@g.us` : cleaned;
}

export function extractWhatsappSourceCode(sourceName: string | null | undefined) {
  const matched = String(sourceName ?? "").match(SOURCE_CODE_REGEX);
  return matched ? matched[1]!.toUpperCase() : null;
}

export function normalizeWhatsappMatchName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^cliente\s+/i, "")
    .replace(/\s*\/\s*xp\s+expor.*$/i, "")
    .replace(/\s*xp\s+display.*$/i, "")
    .replace(/\s*xp\s+factory.*$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyWhatsappGroup(sourceName: string | null | undefined): WhatsappGroupClassification {
  const normalizedName = String(sourceName ?? "").trim();
  const sourceCode = extractWhatsappSourceCode(normalizedName);

  if (sourceCode?.startsWith("CL") || sourceCode?.startsWith("KH") || sourceCode?.startsWith("LJ")) {
    return "WITH_ORDER";
  }

  if (/^cliente\b/i.test(normalizedName)) {
    return "NO_ORDER_EXCEL";
  }

  return "OTHER";
}

export function toNullableText(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned : null;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function computeRecentBlock(lastContactAt: string | null, blockDays: number, now = new Date()) {
  if (!lastContactAt) {
    return {
      isBlocked: false,
      recentBlockUntil: null,
    };
  }

  const parsed = new Date(lastContactAt);
  if (Number.isNaN(parsed.getTime())) {
    return {
      isBlocked: false,
      recentBlockUntil: null,
    };
  }

  const recentBlockUntil = addDays(parsed, blockDays);

  return {
    isBlocked: recentBlockUntil.getTime() > now.getTime(),
    recentBlockUntil: recentBlockUntil.toISOString(),
  };
}

export function randomDelaySeconds(minDelaySeconds: number, maxDelaySeconds: number) {
  const safeMin = Math.max(1, Math.floor(minDelaySeconds));
  const safeMax = Math.max(safeMin, Math.floor(maxDelaySeconds));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

export function isWhatsappCampaignStatus(value: string): value is WhatsappCampaignStatus {
  return (WHATSAPP_CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

export function isWhatsappRecipientStatus(value: string): value is WhatsappCampaignRecipientStatus {
  return (WHATSAPP_RECIPIENT_STATUSES as readonly string[]).includes(value);
}

export function isWhatsappGroupClassification(value: string): value is WhatsappGroupClassification {
  return (WHATSAPP_GROUP_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function isWhatsappGroupMappingStatus(value: string): value is WhatsappGroupMappingStatus {
  return (WHATSAPP_GROUP_MAPPING_STATUSES as readonly string[]).includes(value);
}

export function isWhatsappGroupMatchMethod(value: string): value is WhatsappGroupMatchMethod {
  return (WHATSAPP_GROUP_MATCH_METHODS as readonly string[]).includes(value);
}

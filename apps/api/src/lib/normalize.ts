import crypto from "node:crypto";

export function normalizeText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCode(value: string | null | undefined) {
  return normalizeText(value).toUpperCase();
}

export function normalizeName(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

export function safeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const text = normalizeText(String(value));
  if (!text) {
    return 0;
  }

  // Remove currency symbols and other non-numeric characters except comma, dot, and minus
  const cleaned = text.replace(/[^\d,.\-]/g, "");
  if (!cleaned) {
    return 0;
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;

  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      normalized = parts.join("");
    } else {
      const [, decimalPart = ""] = parts;
      normalized = decimalPart.length === 3 ? parts.join("") : cleaned;
    }
  }

  const maybe = Number(normalized);
  return Number.isFinite(maybe) ? maybe : 0;
}

export function toIsoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = normalizeText(String(value ?? ""));
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  throw new Error(`Invalid date: ${text}`);
}

export function sha256(parts: Array<string | number | null | undefined>) {
  const hash = crypto.createHash("sha256");
  hash.update(parts.map((part) => normalizeText(String(part ?? ""))).join("|"));
  return hash.digest("hex");
}

export function extractDisplayName(customerLabel: string, customerCode: string) {
  const normalized = normalizeText(customerLabel);
  const prefixed = `${normalizeCode(customerCode)} - `;
  if (normalized.startsWith(prefixed)) {
    return normalized.slice(prefixed.length).trim();
  }

  return normalized;
}

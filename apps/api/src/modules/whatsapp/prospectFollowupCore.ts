import { areWhatsappJidsEqual } from "./whatsappMonitorCore.js";
import { normalizeWhatsappMatchName } from "./whatsappCore.js";

export const DEFAULT_PROSPECT_MESSAGE = "Bom dia {cliente} ☀️🙏🏻🤩\n\nGostou dos nossos preços?\n\nQualquer coisa é só avisar a gente que deixamos tudo separado e prontinho pra vc! 📦🤝☺️";

export function getProspectFollowupSchedule(now = new Date(), daysAfterCreation = 2) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const created = new Date(`${date}T12:00:00Z`);
  created.setUTCDate(created.getUTCDate() - daysAfterCreation);
  return { date, createdDate: created.toISOString().slice(0, 10), due: Number(parts.hour) === 9 && Number(parts.minute) < 15 };
}

function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

export function pickProspectCustomer(participants: unknown, teamIdentities: string[]): { phone: string | null; reason: string | null } {
  if (!Array.isArray(participants)) return { phone: null, reason: "missing_participants" };
  const phones = new Set<string>();
  for (const item of participants) {
    if (!item || typeof item !== "object") return { phone: null, reason: "unresolved_participant" };
    const participant = item as Record<string, unknown>;
    const id = String(participant.id ?? participant.jid ?? "");
    const rawPhone = String(participant.phoneNumber ?? participant.phone ?? (id.endsWith("@s.whatsapp.net") || id.endsWith("@c.us") ? id : ""));
    if (teamIdentities.some((team) => (id && areWhatsappJidsEqual(id, team)) || (rawPhone && areWhatsappJidsEqual(rawPhone, team)))) continue;
    if (!rawPhone || rawPhone.endsWith("@lid")) return { phone: null, reason: "unresolved_customer_phone" };
    const phone = phoneDigits(rawPhone.split("@")[0]!);
    if (!/^\d{10,15}$/.test(phone)) return { phone: null, reason: "invalid_customer_phone" };
    phones.add(phone);
  }
  if (phones.size !== 1) return { phone: null, reason: phones.size ? "multiple_customers" : "no_customer_in_group" };
  return { phone: [...phones][0]!, reason: null };
}

export interface ProspectCustomerRecord {
  id: string;
  customerCode: string | null;
  name: string;
  phone: string | null;
  hasPurchase: boolean;
}

export function prospectConversionReason(name: string, phone: string, linkedIds: string[], customers: ProspectCustomerRecord[]) {
  const normalizedName = normalizeWhatsappMatchName(name);
  const matches = customers.filter((customer) => linkedIds.includes(customer.id)
    || (customer.phone && areWhatsappJidsEqual(phone, phoneDigits(customer.phone)))
    || (normalizedName && normalizeWhatsappMatchName(customer.name) === normalizedName));
  if (matches.some((customer) => customer.hasPurchase)) return "already_purchased";
  if (matches.some((customer) => customer.customerCode || linkedIds.includes(customer.id))) return "already_customer";
  return null;
}

export function buildProspectFollowupText(phone: string, template = DEFAULT_PROSPECT_MESSAGE) {
  return template.replaceAll("{cliente}", `@${phone}`);
}

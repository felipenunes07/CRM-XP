import type { AutomationActivityItem, AutomationActivityStatus, MessageAutomation } from "@olist-crm/shared";

export const ACTIVITY_STATUS: Record<AutomationActivityStatus, { label: string; tone: string }> = {
  SENT: { label: "Enviada", tone: "sent" }, PENDING: { label: "Na fila", tone: "waiting" },
  SENDING: { label: "Enviando", tone: "waiting" }, PAUSED: { label: "Pausada", tone: "waiting" },
  FAILED: { label: "Falha no envio", tone: "failed" }, SKIPPED: { label: "Não enviada", tone: "skipped" },
  BLOCKED_RECENT: { label: "Contato recente", tone: "skipped" }, PENDING_APPROVAL: { label: "Aguardando aprovação", tone: "approval" },
};
const REASONS: Record<string, string> = {
  already_customer_code: "O grupo já tem código de cliente.", already_customer: "O grupo já está vinculado a um cliente.",
  already_purchased: "O cliente já comprou.", ignored_group: "Grupo marcado para não receber mensagens.",
  internal_or_community: "Grupo interno ou comunidade.",
};
export function activityReason(value: string | null) { return value ? REASONS[value] ?? value : null; }
export function activityMessageLabel(item: Pick<AutomationActivityItem, "status">) {
  return item.status === "SENT" ? "Mensagem enviada" : "Mensagem preparada";
}
export function isCustomAutomation(automation: Pick<MessageAutomation, "flowDefinition">) {
  return automation.flowDefinition.reactivationPreset !== "lili-inactivity-v1";
}
export function activityDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

import type { EventsAiBatchStatus } from "@olist-crm/shared";

function formatProvider(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("cerebras")) return "Cerebras";
  if (normalized.includes("gemini")) return "Gemini";
  if (normalized === "auto") return "Auto";
  return value || "IA";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "sem horario registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPeriod(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  return `${formatTime(from)} ate ${formatTime(to)}`;
}

function blockedReasonText(reason: string | null | undefined) {
  switch (reason) {
    case "disabled":
      return "IA desligada.";
    case "missing_api_key":
      return "Chave da IA nao configurada.";
    case "outside_business_hours":
      return "O lote automatico aguarda horario comercial.";
    case "cadence_wait":
      return "O lote automatico ainda esta dentro do intervalo configurado.";
    case "daily_request_cap":
      return "Limite diario de chamadas atingido.";
    case "daily_token_cap":
      return "Limite diario de tokens atingido.";
    default:
      return "Pode rodar manualmente agora.";
  }
}

export function buildAiBatchDisplay(status: EventsAiBatchStatus | null | undefined) {
  const latest = status?.latestBatch;

  if (!status?.enabled) {
    return {
      sourceLabel: "Desligada",
      statusLabel: "Inativa",
      headline: "A IA em lote esta desligada.",
      details: "Ative a chave e a rotina para gerar leituras gerenciais.",
      actionHint: blockedReasonText("disabled"),
    };
  }

  if (!latest) {
    return {
      sourceLabel: "Sem lote",
      statusLabel: "Aguardando",
      headline: "Nenhuma leitura de IA foi executada ainda.",
      details: `${formatProvider(status.provider)} / ${status.model || "modelo nao definido"}`,
      actionHint: blockedReasonText(status.manualBlockedReason),
    };
  }

  const sourceLabel = latest.runSource === "manual" ? "Manual" : "Automatico";
  const modelLabel = `${formatProvider(latest.provider)} / ${latest.model}`;
  const periodLabel = formatPeriod(latest.periodFrom, latest.periodTo);
  const detailLabel = [modelLabel, periodLabel, formatTime(latest.finishedAt)].filter(Boolean).join(" - ");

  if (latest.status === "SKIPPED") {
    const noEvents = latest.reason === "no_events";
    return {
      sourceLabel,
      statusLabel: "Ignorado",
      headline: noEvents
        ? "A IA rodou, mas nao havia eventos relevantes no lote."
        : "A IA tentou rodar, mas o lote foi ignorado por uma regra de seguranca.",
      details: detailLabel,
      actionHint: blockedReasonText(status.manualBlockedReason),
    };
  }

  if (latest.status === "FAILED") {
    return {
      sourceLabel,
      statusLabel: "Falhou",
      headline: "A IA tentou analisar o lote, mas o provedor retornou erro.",
      details: latest.errorMessage || detailLabel,
      actionHint: blockedReasonText(status.manualBlockedReason),
    };
  }

  return {
    sourceLabel,
    statusLabel: "Concluido",
    headline: `${latest.eventCount} eventos foram analisados pela IA.`,
    details: detailLabel,
    actionHint: blockedReasonText(status.manualBlockedReason),
  };
}

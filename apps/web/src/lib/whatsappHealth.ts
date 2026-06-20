// Deriva a "bolinha" de saúde da conexão WhatsApp a partir do health check
// periódico (watchdog grava last_health_status a cada ~10 min). Compartilhado
// entre a página de Usuários e a aba de Mensagens para o sinal ser idêntico.

export type HealthTone = "green" | "red" | "yellow" | "gray";

export interface HealthInfo {
  tone: HealthTone;
  label: string;
  title: string;
  /** Quando true, a conexão caiu e faz sentido oferecer o "Reconectar". */
  down: boolean;
}

interface HealthSource {
  lastHealthStatus: string | null;
  lastHealthCheckAt: string | null;
}

export function relativeTime(iso: string | null): string {
  if (!iso) {
    return "ainda não verificado";
  }
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "agora";
  }
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "há instantes";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}

export function healthInfo(source: HealthSource): HealthInfo {
  const checked = relativeTime(source.lastHealthCheckAt);
  const raw = source.lastHealthStatus;

  if (raw === "OK") {
    return { tone: "green", label: "Conectado", title: `Conectado · verificado ${checked}`, down: false };
  }
  if (raw && raw.startsWith("DOWN")) {
    return {
      tone: "red",
      label: "Caiu — reconecte",
      title: `WhatsApp desconectado da Evolution · verificado ${checked}. Reconecte lendo o QR.`,
      down: true,
    };
  }
  if (raw === "CHECK_FAILED") {
    return {
      tone: "yellow",
      label: "Sem resposta",
      title: `Não foi possível falar com a Evolution · ${checked}`,
      down: true,
    };
  }
  return {
    tone: "gray",
    label: "Não verificado",
    title: `Status de conexão ainda não verificado (${checked})`,
    down: false,
  };
}

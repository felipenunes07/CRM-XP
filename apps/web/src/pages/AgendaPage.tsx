import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircleMore } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, statusLabel } from "../lib/format";

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

export function AgendaPage() {
  const { token } = useAuth();
  const agendaQuery = useQuery({
    queryKey: ["agenda"],
    queryFn: () => api.agenda(token!),
    enabled: Boolean(token),
  });

  if (agendaQuery.isLoading) {
    return <div className="page-loading">Montando agenda diaria...</div>;
  }

  if (agendaQuery.isError || !agendaQuery.data) {
    return <div className="page-error">Nao foi possivel montar a agenda.</div>;
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Agenda de contato</p>
            <h2>Prioridade automatica do dia</h2>
          </div>
        </div>

        <div className="stack-list">
          {agendaQuery.data.map((item) => {
            const defaultMessage = `Ola, ${item.displayName}! Passando para retomar nosso contato comercial.`;
            return (
              <article key={item.id} className="agenda-card">
                <div className="agenda-card-copy">
                  <div className="agenda-title">
                    <strong>{item.displayName}</strong>
                    <span className={`status-badge status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
                  </div>
                  <p>
                    <strong>Motivo do contato:</strong> {item.reason}
                  </p>
                  <small>
                    Ultima compra: {formatDate(item.lastPurchaseAt)} | {formatDaysSince(item.daysSinceLastPurchase)} |
                    Total: {formatCurrency(item.totalSpent)}
                  </small>
                  <small>Acao sugerida: {item.suggestedAction}</small>
                </div>

                <div className="agenda-actions">
                  <span className="score-pill">{item.priorityScore.toFixed(1)}</span>
                  <button className="ghost-button" type="button" onClick={() => copyText(defaultMessage)}>
                    <Copy size={16} />
                    Copiar mensagem
                  </button>
                  <a
                    className="ghost-button"
                    href={`https://wa.me/?text=${encodeURIComponent(defaultMessage)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircleMore size={16} />
                    Abrir WhatsApp
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

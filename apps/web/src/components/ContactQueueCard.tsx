import type { AgendaItem } from "@olist-crm/shared";
import { ArrowUpRight, Copy, MessageCircleMore } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatDaysSince, statusLabel } from "../lib/format";

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

function buildDefaultMessage(displayName: string) {
  return `Ola, ${displayName}! Passando para retomar nosso contato comercial.`;
}

export function ContactQueueCard({ item, compact = false }: { item: AgendaItem; compact?: boolean }) {
  const defaultMessage = buildDefaultMessage(item.displayName);
  const avgDaysBetweenOrders =
    item.avgDaysBetweenOrders === null || item.avgDaysBetweenOrders === undefined
      ? null
      : Math.round(item.avgDaysBetweenOrders);
  const hasPrediction = Boolean(item.predictedNextPurchaseAt);

  return (
    <article className={`queue-card ${compact ? "compact" : ""}`}>
      <div className="queue-card-main">
        <div className="queue-card-top">
          <div className="queue-card-heading">
            <div className="agenda-title">
              <strong>{item.displayName}</strong>
              <span className={`status-badge status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
            </div>
            <p>
              <strong>Motivo do contato:</strong> {item.reason}
            </p>
          </div>

          <div className="queue-card-score">
            <span className="score-pill">
              <ArrowUpRight size={16} />
              {item.priorityScore.toFixed(1)}
            </span>
            <small>{item.lastAttendant ? `Ultima atendente: ${item.lastAttendant}` : "Sem atendente recente"}</small>
          </div>
        </div>

        <div className="queue-card-meta">
          <span>Ultima compra: {formatDate(item.lastPurchaseAt)}</span>
          <span>Recencia: {formatDaysSince(item.daysSinceLastPurchase)}</span>
          <span>Total gasto: {formatCurrency(item.totalSpent)}</span>
          {hasPrediction ? <span>Proxima compra media: {formatDate(item.predictedNextPurchaseAt)}</span> : null}
        </div>

        <p className="queue-card-note">
          <strong>Acao sugerida:</strong> {item.suggestedAction}
        </p>
        {hasPrediction && avgDaysBetweenOrders !== null ? (
          <p className="queue-card-note">
            <strong>Como calculamos:</strong> media de {avgDaysBetweenOrders} dias entre pedidos, somada a ultima compra.
          </p>
        ) : null}
      </div>

      <div className="queue-card-actions">
        <Link className="ghost-button" to={`/clientes/${item.id}`}>
          Ver cliente
        </Link>
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
}

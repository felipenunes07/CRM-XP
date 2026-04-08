import type { AgendaItem } from "@olist-crm/shared";
import { ArrowUpRight, Copy, MessageCircleMore, User, CalendarDays, Clock, Target, Info, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatDaysSince, statusLabel } from "../lib/format";

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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#22c55e"; // Emerald
    if (score >= 50) return "#eab308"; // Yellow
    return "#3b82f6"; // Blue
  };

  return (
    <article style={{ background: "white", borderRadius: "20px", padding: "1.5rem", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: "1.25rem", transition: "transform 0.2s ease", cursor: "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "linear-gradient(135deg, var(--bg-soft) 0%, var(--bg) 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
            <User size={24} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text)" }}>{item.displayName}</h3>
              <span className={`status-badge status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Clock size={14} /> Ultimo atendente: {item.lastAttendant || "Nenhum recente"}
            </p>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: `${getScoreColor(item.priorityScore)}15`, color: getScoreColor(item.priorityScore), padding: "0.35rem 0.75rem", borderRadius: "999px", fontWeight: 700, fontSize: "1.1rem", border: `1px solid ${getScoreColor(item.priorityScore)}30` }}>
            <ArrowUpRight size={18} />
            {item.priorityScore.toFixed(1)}
          </div>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Priority Score</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-soft)", padding: "0.5rem 0.75rem", borderRadius: "8px", fontSize: "0.85rem", color: "var(--text)" }}>
          <CalendarDays size={16} color="var(--muted)" />
          <span style={{ color: "var(--muted)" }}>Ultima Compra:</span> <strong>{formatDate(item.lastPurchaseAt)}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--bg-soft)", padding: "0.5rem 0.75rem", borderRadius: "8px", fontSize: "0.85rem", color: "var(--text)" }}>
          <TrendingUp size={16} color="var(--muted)" />
          <span style={{ color: "var(--muted)" }}>Recencia:</span> <strong>{formatDaysSince(item.daysSinceLastPurchase)}</strong>
        </div>
        {hasPrediction && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(41, 86, 215, 0.08)", border: "1px solid rgba(41, 86, 215, 0.15)", padding: "0.5rem 0.75rem", borderRadius: "8px", fontSize: "0.85rem", color: "var(--accent)" }}>
            <Target size={16} />
            <span>Prev. Prox. Compra:</span> <strong>{formatDate(item.predictedNextPurchaseAt)}</strong>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Info size={16} color="var(--muted)" /> Motivo do Contato
          </p>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
            {item.reason}
          </p>
          {hasPrediction && avgDaysBetweenOrders !== null && (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--muted)", opacity: 0.8 }}>
              Ciclo medio: {avgDaysBetweenOrders} dias.
            </p>
          )}
        </div>
        <div style={{ background: "rgba(47, 157, 103, 0.06)", border: "1px solid rgba(47, 157, 103, 0.2)", borderRadius: "12px", padding: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, fontSize: "0.9rem", color: "#2f9d67", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Sparkles size={16} /> Acao Sugerida
          </p>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#247c47", lineHeight: 1.5 }}>
            {item.suggestedAction}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem", borderTop: "1px solid var(--line)", paddingTop: "1.25rem" }}>
        <Link to={`/clientes/${item.id}`} style={{ padding: "0.75rem 1.25rem", borderRadius: "999px", fontSize: "0.9rem", fontWeight: 600, background: "var(--bg-soft)", color: "var(--text)", textDecoration: "none", transition: "background 0.2s" }}>
          Ver ficha completa
        </Link>
        <button type="button" onClick={() => copyText(defaultMessage)} style={{ padding: "0.75rem 1.25rem", borderRadius: "999px", fontSize: "0.9rem", fontWeight: 600, background: "white", border: "1px solid var(--line)", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", transition: "background 0.2s" }}>
          <Copy size={16} /> Copiar texto
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(defaultMessage)}`} target="_blank" rel="noreferrer" style={{ padding: "0.75rem 1.25rem", borderRadius: "999px", fontSize: "0.9rem", fontWeight: 600, background: "#25D366", color: "white", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto", transition: "transform 0.2s", boxShadow: "0 4px 12px rgba(37, 211, 102, 0.2)" }}>
          <MessageCircleMore size={18} /> Chamar no WhatsApp
        </a>
      </div>
    </article>
  );
}

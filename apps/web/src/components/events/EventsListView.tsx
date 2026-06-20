import type { CSSProperties } from "react";
import type { EventSeverity, EventType, MessageEvent } from "@olist-crm/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Smartphone,
} from "lucide-react";

interface EventsListViewProps {
  events: MessageEvent[];
  onResolve: (event: MessageEvent) => void;
  onViewConversation: (event: MessageEvent) => void;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  RISK: "Risco de atendimento",
  COMPLAINT: "Reclamacao",
  PRAISE: "Elogio",
  POSITIVE_FEEDBACK: "Feedback positivo",
  NEGATIVE_FEEDBACK: "Feedback negativo",
  QUESTION: "Duvida",
  ESCALATION: "Escalacao",
  GREETING: "Saudacao",
  NEUTRAL: "Mensagem neutra",
  CHURN_RISK: "Risco de churn",
  SALES_OPPORTUNITY: "Oportunidade comercial",
};

const SEVERITY_LABELS: Record<EventSeverity, string> = {
  CRITICAL: "Critico",
  HIGH: "Alto",
  MODERATE: "Moderado",
  LOW: "Baixo",
};

const SEVERITY_CLASS: Record<EventSeverity, string> = {
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readStringMetadata(event: MessageEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumberMetadata(event: MessageEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDuplicateCount(event: MessageEvent) {
  const numericValue = readNumberMetadata(event, "duplicateCount");
  if (numericValue && numericValue > 1) return numericValue;

  const value = event.metadata?.duplicateCount;
  if (typeof value === "string" && /^\d+$/.test(value) && Number(value) > 1) {
    return Number(value);
  }

  return 1;
}

function isActionRequired(event: MessageEvent) {
  const value = event.metadata?.actionRequired;
  if (typeof value === "boolean") return value;
  return ["RISK", "ESCALATION", "COMPLAINT", "NEGATIVE_FEEDBACK", "CHURN_RISK", "SALES_OPPORTUNITY", "QUESTION"].includes(event.eventType);
}

export function EventsListView({ events, onResolve, onViewConversation }: EventsListViewProps) {
  if (!events.length) {
    return (
      <div className="wa-empty-list-full">
        <MessageSquare size={48} style={{ opacity: 0.2 }} />
        <p>Nenhum evento encontrado para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="wa-events-list">
      <div className="wa-list-header events" style={{ gridTemplateColumns: "minmax(0, 1.6fr) 1fr 0.85fr 0.9fr 96px" }}>
        <div>Evento</div>
        <div>Cliente / agente</div>
        <div>Data</div>
        <div>Status</div>
        <div>Acoes</div>
      </div>
      <div className="wa-list-body" style={{ "--event-columns": "minmax(0, 1.6fr) 1fr 0.85fr 0.9fr 96px" } as CSSProperties}>
        {events.map((event) => {
          const reason = readStringMetadata(event, "classificationReason");
          const confidence = readNumberMetadata(event, "classificationConfidence");
          const requiresAction = isActionRequired(event);
          const duplicateCount = readDuplicateCount(event);

          return (
            <div key={event.id} className="wa-event-row" style={{ gridTemplateColumns: "var(--event-columns)" }}>
              <div>
                <div className="wa-event-meta-row">
                  <span className="wa-event-type-badge">
                    {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                  </span>
                  <span className={`wa-severity-chip ${SEVERITY_CLASS[event.severity]}`}>
                    {event.severity === "CRITICAL" && <AlertTriangle size={12} />}
                    {SEVERITY_LABELS[event.severity]}
                  </span>
                  <span className="wa-origin-chip">
                    {event.conversationContext?.isGroup ? "Grupo" : "Privado"}
                  </span>
                  {duplicateCount > 1 && (
                    <span className="wa-duplicate-chip">
                      {duplicateCount} webhooks unidos
                    </span>
                  )}
                </div>
                <p className="wa-event-content-preview">{event.content}</p>
                {(reason || confidence !== null || requiresAction) && (
                  <div className="wa-event-reason">
                    {reason && <span>{reason}</span>}
                    {confidence !== null && <small>{Math.round(confidence * 100)}% confianca</small>}
                    {requiresAction && <small>Acao pendente</small>}
                  </div>
                )}
              </div>

              <div>
                <div className="wa-customer-info">
                  <strong>{event.conversationContext?.contactName || "Cliente desconhecido"}</strong>
                  <span>{event.conversationContext?.agentName || "Sem agente"}</span>
                </div>
              </div>

              <div className="wa-event-date">
                <span className="wa-date-text">{formatDateTime(event.detectedAt)}</span>
              </div>

              <div>
                {event.resolvedAt ? (
                  <span className="wa-status-pill success">
                    <CheckCircle2 size={14} />
                    Resolvido
                  </span>
                ) : (
                  <span className="wa-status-pill warning">
                    <Clock size={14} />
                    Pendente
                  </span>
                )}
              </div>

              <div className="wa-event-actions">
                <button
                  type="button"
                  className="wa-action-btn primary"
                  onClick={() => onViewConversation(event)}
                  title="Abrir celular"
                >
                  <Smartphone size={18} />
                </button>
                {!event.resolvedAt && (
                  <button
                    type="button"
                    className="wa-action-btn success"
                    onClick={() => onResolve(event)}
                    title="Resolver"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

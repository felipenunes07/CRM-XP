import type { EventSeverity, EventType, MessageEvent } from "@olist-crm/shared";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  MessageSquare,
} from "lucide-react";

interface EventsListViewProps {
  events: MessageEvent[];
  onResolve: (event: MessageEvent) => void;
  onViewConversation: (dealId: string) => void;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  RISK: "Risco Atendimento",
  COMPLAINT: "Reclamacao",
  PRAISE: "Elogio",
  POSITIVE_FEEDBACK: "Feedback Positivo",
  NEGATIVE_FEEDBACK: "Feedback Negativo",
  QUESTION: "Duvida",
  ESCALATION: "Escalacao",
  GREETING: "Saudacao",
  NEUTRAL: "Mensagem Neutra",
  CHURN_RISK: "Risco de Churn",
  SALES_OPPORTUNITY: "Oportunidade Comercial",
};

const SEVERITY_LABELS: Record<EventSeverity, string> = {
  CRITICAL: "Critico",
  HIGH: "Alto",
  MODERATE: "Moderado",
  LOW: "Baixo",
};

const CATEGORY_LABELS: Record<string, string> = {
  risk: "Risco",
  opportunity: "Comercial",
  complaint: "Atencao",
  feedback: "Feedback",
  question: "Duvida",
  noise: "Informativo",
};

const ACTIONABLE_TYPES = new Set<EventType>([
  "RISK",
  "ESCALATION",
  "COMPLAINT",
  "NEGATIVE_FEEDBACK",
  "CHURN_RISK",
  "SALES_OPPORTUNITY",
  "QUESTION",
]);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTextMetadata(event: MessageEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumberMetadata(event: MessageEvent, key: string) {
  const value = event.metadata?.[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getBooleanMetadata(event: MessageEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function categoryFromEventType(eventType: EventType) {
  if (eventType === "RISK" || eventType === "ESCALATION") return "risk";
  if (eventType === "SALES_OPPORTUNITY") return "opportunity";
  if (eventType === "COMPLAINT" || eventType === "NEGATIVE_FEEDBACK" || eventType === "CHURN_RISK") return "complaint";
  if (eventType === "QUESTION") return "question";
  if (eventType === "GREETING" || eventType === "NEUTRAL") return "noise";
  return "feedback";
}

function readClassification(event: MessageEvent) {
  const category = getTextMetadata(event, "classificationCategory") ?? categoryFromEventType(event.eventType);
  const confidence = getNumberMetadata(event, "classificationConfidence");
  const actionRequired = getBooleanMetadata(event, "actionRequired") ?? ACTIONABLE_TYPES.has(event.eventType);

  return {
    category,
    confidence,
    actionRequired,
    reason: getTextMetadata(event, "classificationReason"),
  };
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
      <div className="wa-list-header">
        <div>Evento</div>
        <div>Cliente / Agente</div>
        <div>Data/Hora</div>
        <div>Status</div>
        <div>Acoes</div>
      </div>
      <div className="wa-list-body">
        {events.map((event) => {
          const classification = readClassification(event);
          const isResolved = Boolean(event.resolvedAt);
          const severityClass = event.severity.toLowerCase();

          return (
            <div key={event.id} className="wa-event-row">
              <div className="wa-event-main">
                <div className={`wa-event-type-badge type-${event.eventType.toLowerCase()}`}>
                  {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                </div>
                <p className="wa-event-content-preview">{event.content}</p>
                <div className="wa-event-meta-row">
                  <span className={`wa-category-chip ${classification.category}`}>
                    {CATEGORY_LABELS[classification.category] ?? classification.category}
                  </span>
                  {classification.confidence !== null && (
                    <span className="wa-confidence-chip">
                      {Math.round(classification.confidence * 100)}% confianca
                    </span>
                  )}
                </div>
                {classification.reason && (
                  <p className="wa-event-reason">{classification.reason}</p>
                )}
              </div>
              <div>
                <div className="wa-customer-info">
                  <strong>{event.conversationContext?.contactName || "Cliente Desconhecido"}</strong>
                  <span>{event.conversationContext?.agentName || "Sem agente"}</span>
                </div>
              </div>
              <div className="wa-event-time-cell">
                <span className="wa-date-text">{formatDateTime(event.detectedAt)}</span>
                <span className={`wa-severity-chip ${severityClass}`}>
                  {event.severity === "CRITICAL" && <AlertTriangle size={12} />}
                  {SEVERITY_LABELS[event.severity]}
                </span>
              </div>
              <div>
                {isResolved ? (
                  <span className="wa-status-pill success">
                    <CheckCircle2 size={14} />
                    Resolvido
                  </span>
                ) : classification.actionRequired ? (
                  <span className="wa-status-pill warning">
                    <Clock size={14} />
                    Pendente
                  </span>
                ) : (
                  <span className="wa-status-pill info">
                    <Circle size={14} />
                    Informativo
                  </span>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="wa-action-btn primary"
                  onClick={() => onViewConversation(event.dealId)}
                  title="Ver conversa"
                >
                  <ExternalLink size={18} />
                </button>
                {!isResolved && classification.actionRequired && (
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

import { MessageEvent, EventType, EventSeverity } from "@olist-crm/shared";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MessageSquare, 
  User, 
  ChevronRight,
  ExternalLink
} from "lucide-react";

interface EventsListViewProps {
  events: MessageEvent[];
  onResolve: (event: MessageEvent) => void;
  onViewConversation: (dealId: string) => void;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  RISK: "Risco Atendimento",
  COMPLAINT: "Reclamação",
  PRAISE: "Elogio",
  POSITIVE_FEEDBACK: "Feedback Positivo",
  NEGATIVE_FEEDBACK: "Feedback Negativo",
  QUESTION: "Dúvida",
  ESCALATION: "Escalação",
  GREETING: "Saudação",
  NEUTRAL: "Mensagem Neutra",
  CHURN_RISK: "Risco de Churn",
  SALES_OPPORTUNITY: "Oportunidade Comercial",
};

const SEVERITY_LABELS: Record<EventSeverity, string> = {
  CRITICAL: "Crítico",
  HIGH: "Alto",
  MODERATE: "Moderado",
  LOW: "Baixo",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
        <div>Severidade</div>
        <div>Data/Hora</div>
        <div>Status</div>
        <div>Ações</div>
      </div>
      <div className="wa-list-body">
        {events.map((event) => (
          <div key={event.id} className="wa-event-row">
            <div>
              <div className="wa-event-type-badge">
                {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
              </div>
              <p className="wa-event-content-preview">{event.content}</p>
            </div>
            <div>
              <div className="wa-customer-info">
                <strong>{event.conversationContext?.contactName || "Cliente Desconhecido"}</strong>
                <span>{event.conversationContext?.agentName || "Sem agente"}</span>
              </div>
            </div>
            <div>
              <span className={`wa-severity-chip ${event.severity.toLowerCase()}`}>
                <AlertTriangle size={12} />
                {SEVERITY_LABELS[event.severity]}
              </span>
            </div>
            <div>
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
            <div>
              <button 
                type="button" 
                className="wa-action-btn primary"
                onClick={() => onViewConversation(event.dealId)}
                title="Ver conversa"
              >
                <ExternalLink size={18} />
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
        ))}
      </div>
    </div>
  );
}

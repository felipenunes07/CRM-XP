import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, ExternalLink } from "lucide-react";
const EVENT_TYPE_LABELS = {
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
const SEVERITY_LABELS = {
    CRITICAL: "Crítico",
    HIGH: "Alto",
    MODERATE: "Moderado",
    LOW: "Baixo",
};
function formatDateTime(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
export function EventsListView({ events, onResolve, onViewConversation }) {
    if (!events.length) {
        return (_jsxs("div", { className: "wa-empty-list-full", children: [_jsx(MessageSquare, { size: 48, style: { opacity: 0.2 } }), _jsx("p", { children: "Nenhum evento encontrado para os filtros selecionados." })] }));
    }
    return (_jsxs("div", { className: "wa-events-list", children: [_jsxs("div", { className: "wa-list-header", style: { gridTemplateColumns: '1.5fr 1fr 1fr 1fr 0.5fr' }, children: [_jsx("div", { children: "Evento" }), _jsx("div", { children: "Cliente / Agente" }), _jsx("div", { children: "Data/Hora" }), _jsx("div", { children: "Status" }), _jsx("div", { children: "A\u00E7\u00F5es" })] }), _jsx("div", { className: "wa-list-body", style: { '--event-columns': '1.5fr 1fr 1fr 1fr 0.5fr' }, children: events.map((event) => (_jsxs("div", { className: "wa-event-row", style: { gridTemplateColumns: 'var(--event-columns)' }, children: [_jsxs("div", { children: [_jsx("div", { className: "wa-event-type-badge", children: EVENT_TYPE_LABELS[event.eventType] || event.eventType }), _jsx("p", { className: "wa-event-content-preview", children: event.content })] }), _jsx("div", { children: _jsxs("div", { className: "wa-customer-info", children: [_jsx("strong", { children: event.conversationContext?.contactName || "Cliente Desconhecido" }), _jsx("span", { children: event.conversationContext?.agentName || "Sem agente" })] }) }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '4px' }, children: [_jsx("span", { className: "wa-date-text", children: formatDateTime(event.detectedAt) }), event.severity === "CRITICAL" && (_jsxs("span", { className: "wa-severity-chip critical", style: { alignSelf: "flex-start", marginTop: "4px" }, children: [_jsx(AlertTriangle, { size: 12 }), "Urgente"] }))] }), _jsx("div", { children: event.resolvedAt ? (_jsxs("span", { className: "wa-status-pill success", children: [_jsx(CheckCircle2, { size: 14 }), "Resolvido"] })) : (_jsxs("span", { className: "wa-status-pill warning", children: [_jsx(Clock, { size: 14 }), "Pendente"] })) }), _jsxs("div", { children: [_jsx("button", { type: "button", className: "wa-action-btn primary", onClick: () => onViewConversation(event.dealId), title: "Ver conversa", children: _jsx(ExternalLink, { size: 18 }) }), !event.resolvedAt && (_jsx("button", { type: "button", className: "wa-action-btn success", onClick: () => onResolve(event), title: "Resolver", children: _jsx(CheckCircle2, { size: 18 }) }))] })] }, event.id))) })] }));
}

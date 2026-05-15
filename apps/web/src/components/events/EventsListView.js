import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2, Circle, Clock, ExternalLink, MessageSquare, } from "lucide-react";
const EVENT_TYPE_LABELS = {
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
const SEVERITY_LABELS = {
    CRITICAL: "Critico",
    HIGH: "Alto",
    MODERATE: "Moderado",
    LOW: "Baixo",
};
const CATEGORY_LABELS = {
    risk: "Risco",
    opportunity: "Comercial",
    complaint: "Atencao",
    feedback: "Feedback",
    question: "Duvida",
    noise: "Informativo",
};
const ACTIONABLE_TYPES = new Set([
    "RISK",
    "ESCALATION",
    "COMPLAINT",
    "NEGATIVE_FEEDBACK",
    "CHURN_RISK",
    "SALES_OPPORTUNITY",
    "QUESTION",
]);
function formatDateTime(value) {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
function getTextMetadata(event, key) {
    const value = event.metadata?.[key];
    return typeof value === "string" && value.trim() ? value : null;
}
function getNumberMetadata(event, key) {
    const value = event.metadata?.[key];
    if (typeof value === "number")
        return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function getBooleanMetadata(event, key) {
    const value = event.metadata?.[key];
    return typeof value === "boolean" ? value : null;
}
function categoryFromEventType(eventType) {
    if (eventType === "RISK" || eventType === "ESCALATION")
        return "risk";
    if (eventType === "SALES_OPPORTUNITY")
        return "opportunity";
    if (eventType === "COMPLAINT" || eventType === "NEGATIVE_FEEDBACK" || eventType === "CHURN_RISK")
        return "complaint";
    if (eventType === "QUESTION")
        return "question";
    if (eventType === "GREETING" || eventType === "NEUTRAL")
        return "noise";
    return "feedback";
}
function readClassification(event) {
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
export function EventsListView({ events, onResolve, onViewConversation }) {
    if (!events.length) {
        return (_jsxs("div", { className: "wa-empty-list-full", children: [_jsx(MessageSquare, { size: 48, style: { opacity: 0.2 } }), _jsx("p", { children: "Nenhum evento encontrado para os filtros selecionados." })] }));
    }
    return (_jsxs("div", { className: "wa-events-list", children: [_jsxs("div", { className: "wa-list-header", children: [_jsx("div", { children: "Evento" }), _jsx("div", { children: "Cliente / Agente" }), _jsx("div", { children: "Data/Hora" }), _jsx("div", { children: "Status" }), _jsx("div", { children: "Acoes" })] }), _jsx("div", { className: "wa-list-body", children: events.map((event) => {
                    const classification = readClassification(event);
                    const isResolved = Boolean(event.resolvedAt);
                    const severityClass = event.severity.toLowerCase();
                    return (_jsxs("div", { className: "wa-event-row", children: [_jsxs("div", { className: "wa-event-main", children: [_jsx("div", { className: `wa-event-type-badge type-${event.eventType.toLowerCase()}`, children: EVENT_TYPE_LABELS[event.eventType] || event.eventType }), _jsx("p", { className: "wa-event-content-preview", children: event.content }), _jsxs("div", { className: "wa-event-meta-row", children: [_jsx("span", { className: `wa-category-chip ${classification.category}`, children: CATEGORY_LABELS[classification.category] ?? classification.category }), classification.confidence !== null && (_jsxs("span", { className: "wa-confidence-chip", children: [Math.round(classification.confidence * 100), "% confianca"] }))] }), classification.reason && (_jsx("p", { className: "wa-event-reason", children: classification.reason }))] }), _jsx("div", { children: _jsxs("div", { className: "wa-customer-info", children: [_jsx("strong", { children: event.conversationContext?.contactName || "Cliente Desconhecido" }), _jsx("span", { children: event.conversationContext?.agentName || "Sem agente" })] }) }), _jsxs("div", { className: "wa-event-time-cell", children: [_jsx("span", { className: "wa-date-text", children: formatDateTime(event.detectedAt) }), _jsxs("span", { className: `wa-severity-chip ${severityClass}`, children: [event.severity === "CRITICAL" && _jsx(AlertTriangle, { size: 12 }), SEVERITY_LABELS[event.severity]] })] }), _jsx("div", { children: isResolved ? (_jsxs("span", { className: "wa-status-pill success", children: [_jsx(CheckCircle2, { size: 14 }), "Resolvido"] })) : classification.actionRequired ? (_jsxs("span", { className: "wa-status-pill warning", children: [_jsx(Clock, { size: 14 }), "Pendente"] })) : (_jsxs("span", { className: "wa-status-pill info", children: [_jsx(Circle, { size: 14 }), "Informativo"] })) }), _jsxs("div", { children: [_jsx("button", { type: "button", className: "wa-action-btn primary", onClick: () => onViewConversation(event.dealId), title: "Ver conversa", children: _jsx(ExternalLink, { size: 18 }) }), !isResolved && classification.actionRequired && (_jsx("button", { type: "button", className: "wa-action-btn success", onClick: () => onResolve(event), title: "Resolver", children: _jsx(CheckCircle2, { size: 18 }) }))] })] }, event.id));
                }) })] }));
}

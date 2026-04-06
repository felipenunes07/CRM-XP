import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowUpRight, Copy, MessageCircleMore } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatDaysSince, statusLabel } from "../lib/format";
function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => undefined);
}
function buildDefaultMessage(displayName) {
    return `Ola, ${displayName}! Passando para retomar nosso contato comercial.`;
}
export function ContactQueueCard({ item, compact = false }) {
    const defaultMessage = buildDefaultMessage(item.displayName);
    const avgDaysBetweenOrders = item.avgDaysBetweenOrders === null || item.avgDaysBetweenOrders === undefined
        ? null
        : Math.round(item.avgDaysBetweenOrders);
    const hasPrediction = Boolean(item.predictedNextPurchaseAt);
    return (_jsxs("article", { className: `queue-card ${compact ? "compact" : ""}`, children: [_jsxs("div", { className: "queue-card-main", children: [_jsxs("div", { className: "queue-card-top", children: [_jsxs("div", { className: "queue-card-heading", children: [_jsxs("div", { className: "agenda-title", children: [_jsx("strong", { children: item.displayName }), _jsx("span", { className: `status-badge status-${item.status.toLowerCase()}`, children: statusLabel(item.status) })] }), _jsxs("p", { children: [_jsx("strong", { children: "Motivo do contato:" }), " ", item.reason] })] }), _jsxs("div", { className: "queue-card-score", children: [_jsxs("span", { className: "score-pill", children: [_jsx(ArrowUpRight, { size: 16 }), item.priorityScore.toFixed(1)] }), _jsx("small", { children: item.lastAttendant ? `Ultima atendente: ${item.lastAttendant}` : "Sem atendente recente" })] })] }), _jsxs("div", { className: "queue-card-meta", children: [_jsxs("span", { children: ["Ultima compra: ", formatDate(item.lastPurchaseAt)] }), _jsxs("span", { children: ["Recencia: ", formatDaysSince(item.daysSinceLastPurchase)] }), _jsxs("span", { children: ["Total gasto: ", formatCurrency(item.totalSpent)] }), hasPrediction ? _jsxs("span", { children: ["Proxima compra media: ", formatDate(item.predictedNextPurchaseAt)] }) : null] }), _jsxs("p", { className: "queue-card-note", children: [_jsx("strong", { children: "Acao sugerida:" }), " ", item.suggestedAction] }), hasPrediction && avgDaysBetweenOrders !== null ? (_jsxs("p", { className: "queue-card-note", children: [_jsx("strong", { children: "Como calculamos:" }), " media de ", avgDaysBetweenOrders, " dias entre pedidos, somada a ultima compra."] })) : null] }), _jsxs("div", { className: "queue-card-actions", children: [_jsx(Link, { className: "ghost-button", to: `/clientes/${item.id}`, children: "Ver cliente" }), _jsxs("button", { className: "ghost-button", type: "button", onClick: () => copyText(defaultMessage), children: [_jsx(Copy, { size: 16 }), "Copiar mensagem"] }), _jsxs("a", { className: "ghost-button", href: `https://wa.me/?text=${encodeURIComponent(defaultMessage)}`, target: "_blank", rel: "noreferrer", children: [_jsx(MessageCircleMore, { size: 16 }), "Abrir WhatsApp"] })] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircleMore } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, statusLabel } from "../lib/format";
function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => undefined);
}
export function AgendaPage() {
    const { token } = useAuth();
    const agendaQuery = useQuery({
        queryKey: ["agenda"],
        queryFn: () => api.agenda(token),
        enabled: Boolean(token),
    });
    if (agendaQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Montando agenda diaria..." });
    }
    if (agendaQuery.isError || !agendaQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel montar a agenda." });
    }
    return (_jsx("div", { className: "page-stack", children: _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Agenda de contato" }), _jsx("h2", { children: "Prioridade automatica do dia" })] }) }), _jsx("div", { className: "stack-list", children: agendaQuery.data.map((item) => {
                        const defaultMessage = `Ola, ${item.displayName}! Passando para retomar nosso contato comercial.`;
                        return (_jsxs("article", { className: "agenda-card", children: [_jsxs("div", { className: "agenda-card-copy", children: [_jsxs("div", { className: "agenda-title", children: [_jsx("strong", { children: item.displayName }), _jsx("span", { className: `status-badge status-${item.status.toLowerCase()}`, children: statusLabel(item.status) })] }), _jsxs("p", { children: [_jsx("strong", { children: "Motivo do contato:" }), " ", item.reason] }), _jsxs("small", { children: ["Ultima compra: ", formatDate(item.lastPurchaseAt), " | ", formatDaysSince(item.daysSinceLastPurchase), " | Total: ", formatCurrency(item.totalSpent)] }), _jsxs("small", { children: ["Acao sugerida: ", item.suggestedAction] })] }), _jsxs("div", { className: "agenda-actions", children: [_jsx("span", { className: "score-pill", children: item.priorityScore.toFixed(1) }), _jsxs("button", { className: "ghost-button", type: "button", onClick: () => copyText(defaultMessage), children: [_jsx(Copy, { size: 16 }), "Copiar mensagem"] }), _jsxs("a", { className: "ghost-button", href: `https://wa.me/?text=${encodeURIComponent(defaultMessage)}`, target: "_blank", rel: "noreferrer", children: [_jsx(MessageCircleMore, { size: 16 }), "Abrir WhatsApp"] })] })] }, item.id));
                    }) })] }) }));
}

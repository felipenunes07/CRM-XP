import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { formatNumber } from "../lib/format";
function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
export function ReactivationLeaderboardPanel({ leaderboard, isLoading }) {
    const [expandedAttendant, setExpandedAttendant] = useState(null);
    if (isLoading) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Reativa\u00E7\u00E3o do m\u00EAs" }), _jsx("h3", { children: "Ranking de recupera\u00E7\u00E3o" })] }) }), _jsx("div", { className: "page-loading", children: "Carregando ranking..." })] }));
    }
    if (!leaderboard.length) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Reativa\u00E7\u00E3o do m\u00EAs" }), _jsx("h3", { children: "Ranking de recupera\u00E7\u00E3o" })] }) }), _jsx("div", { className: "empty-state", children: "Nenhuma reativa\u00E7\u00E3o registrada neste m\u00EAs." })] }));
    }
    return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Reativa\u00E7\u00E3o do m\u00EAs" }), _jsxs("h3", { children: ["Top ", leaderboard.length, " atendentes"] }), _jsx("p", { className: "panel-subcopy", children: "Clientes inativos (90+ dias) que voltaram a comprar este m\u00EAs." })] }) }), _jsx("div", { className: "leaderboard-list", children: leaderboard.map((entry, index) => (_jsxs("div", { className: "leaderboard-entry", children: [_jsxs("div", { className: "leaderboard-entry-header", children: [_jsxs("div", { className: "leaderboard-rank", children: ["#", index + 1] }), _jsxs("div", { className: "leaderboard-info", children: [_jsx("strong", { children: entry.attendant }), _jsxs("div", { className: "leaderboard-metrics", children: [_jsxs("span", { children: [formatNumber(entry.recoveredCustomers), " clientes"] }), _jsx("span", { className: "separator", children: "\u2022" }), _jsx("span", { children: formatCurrency(entry.recoveredRevenue) })] })] }), entry.recoveredClients.length > 0 && (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => setExpandedAttendant(expandedAttendant === entry.attendant ? null : entry.attendant), "aria-expanded": expandedAttendant === entry.attendant, children: expandedAttendant === entry.attendant ? "Ocultar" : "Ver detalhes" }))] }), expandedAttendant === entry.attendant && entry.recoveredClients.length > 0 && (_jsx("div", { className: "leaderboard-details", children: entry.recoveredClients.map((client) => (_jsxs("div", { className: "recovered-client", children: [_jsxs("div", { className: "recovered-client-info", children: [_jsx("strong", { children: client.displayName }), client.customerCode && _jsx("span", { className: "customer-code", children: client.customerCode })] }), _jsxs("div", { className: "recovered-client-stats", children: [_jsxs("span", { children: [client.daysInactiveBeforeReturn, " dias inativo"] }), _jsx("span", { className: "separator", children: "\u2022" }), _jsx("span", { children: formatCurrency(client.reactivatedOrderAmount) })] })] }, client.customerId))) }))] }, entry.attendant))) })] }));
}

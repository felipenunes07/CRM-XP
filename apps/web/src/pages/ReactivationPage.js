import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";
function statusClass(status) {
    if (status === "ACTIVE") {
        return "status-active";
    }
    if (status === "ATTENTION") {
        return "status-attention";
    }
    return "status-inactive";
}
function formatPriority(value) {
    return value.toFixed(1).replace(".", ",");
}
export function ReactivationPage() {
    const { token } = useAuth();
    const dashboardQuery = useQuery({
        queryKey: ["reactivation-dashboard"],
        queryFn: () => api.dashboard(token),
        enabled: Boolean(token),
    });
    if (dashboardQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando ranking de reativacao..." });
    }
    if (dashboardQuery.isError || !dashboardQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar o ranking de reativacao." });
    }
    const leaderboard = dashboardQuery.data.reactivationLeaderboard;
    const totalRecoveredCustomers = leaderboard.reduce((sum, entry) => sum + entry.recoveredCustomers, 0);
    const totalRecoveredRevenue = leaderboard.reduce((sum, entry) => sum + entry.recoveredRevenue, 0);
    const monthLabel = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
    }).format(new Date());
    return (_jsxs("div", { className: "page-stack", children: [_jsx("section", { className: "hero-panel", children: _jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Ranking de reativacao" }), _jsx("h2", { children: "Recuperadoras de Ouro" }), _jsx("p", { children: "Veja quem mais trouxe clientes inativos de volta neste mes. O ranking considera a primeira volta do cliente no mes, quando o novo pedido aconteceu apos pelo menos 90 dias sem comprar." })] }) }), _jsxs("section", { className: "stats-grid", children: [_jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Mes analisado" }), _jsx("strong", { children: monthLabel }), _jsx("span", { children: "Primeira reativacao do cliente no mes" })] }), _jsxs("article", { className: "stat-card tone-success", children: [_jsx("p", { className: "eyebrow", children: "Clientes recuperados" }), _jsx("strong", { children: formatNumber(totalRecoveredCustomers) }), _jsx("span", { children: "Total somado do ranking" })] }), _jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Faturamento reativado" }), _jsx("strong", { children: formatCurrency(totalRecoveredRevenue) }), _jsx("span", { children: "Soma dos pedidos de retorno" })] }), _jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Atendentes no ranking" }), _jsx("strong", { children: formatNumber(leaderboard.length) }), _jsx("span", { children: "Quem ja reativou clientes neste mes" })] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Placar do mes" }), _jsx("h3", { children: "Quem esta trazendo clientes mortos de volta" }), _jsx("p", { className: "panel-subcopy", children: "Abaixo voce ve nao so o ranking, mas tambem quais clientes cada vendedora reativou, quando voltaram e quanto tempo ficaram sem comprar." })] }) }), leaderboard.length ? (_jsx("div", { className: "leaderboard-list", children: leaderboard.map((entry, index) => (_jsxs("article", { className: `leaderboard-card ${index === 0 ? "is-leader" : ""}`, children: [_jsxs("div", { className: "leaderboard-card-header", children: [_jsxs("div", { className: "leaderboard-rank", children: ["#", index + 1] }), _jsxs("div", { className: "leaderboard-copy", children: [_jsx("strong", { children: entry.attendant }), _jsxs("span", { children: [formatNumber(entry.recoveredCustomers), " clientes recuperados"] })] }), _jsxs("div", { className: "leaderboard-metric", children: [_jsx("span", { children: "Faturamento reativado" }), _jsx("strong", { children: formatCurrency(entry.recoveredRevenue) })] })] }), _jsx("div", { className: "reactivation-client-list", children: entry.recoveredClients.map((client) => (_jsxs("article", { className: "reactivation-client-card", children: [_jsxs("div", { className: "reactivation-client-main", children: [_jsxs("div", { className: "reactivation-client-copy", children: [_jsx("strong", { children: client.displayName }), _jsxs("span", { children: [client.customerCode || "Sem codigo", " \u2022 voltou em ", formatDate(client.reactivationOrderDate)] })] }), _jsx("span", { className: `status-badge ${statusClass(client.status)}`, children: statusLabel(client.status) })] }), _jsxs("div", { className: "reactivation-client-metrics", children: [_jsxs("span", { children: ["Ficou ", formatNumber(client.daysInactiveBeforeReturn), " dias sem comprar"] }), _jsxs("span", { children: ["Pedido de retorno: ", formatCurrency(client.reactivatedOrderAmount)] }), _jsxs("span", { children: ["Compra anterior: ", formatDate(client.previousOrderDate)] }), _jsxs("span", { children: ["Prioridade atual: ", formatPriority(client.priorityScore)] })] }), _jsx("div", { className: "reactivation-client-actions", children: _jsx(Link, { className: "ghost-button", to: `/clientes/${client.customerId}`, children: "Abrir cliente" }) })] }, `${entry.attendant}-${client.customerId}`))) })] }, `${entry.attendant}-${index}`))) })) : (_jsx("div", { className: "empty-state", children: "Ainda nao houve reativacao registrada neste mes." }))] })] }));
}

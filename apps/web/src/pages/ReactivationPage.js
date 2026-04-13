import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
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
    return (_jsxs("div", { className: "page-stack", children: [_jsx("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }, children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: '0.2rem' }, children: "Ranking de reativacao" }), _jsx("h2", { style: { margin: 0, fontSize: '1.5rem' }, children: "Recuperadoras de Ouro" })] }) }), _jsxs("div", { className: "stats-grid", children: [_jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Mes analisado" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: monthLabel }), _jsx("p", { className: "stat-card-helper", children: "Primeira reativacao no mes" })] })] }), _jsxs("div", { className: "stat-card tone-success", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Clientes recuperados" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(totalRecoveredCustomers) }), _jsx("p", { className: "stat-card-helper", children: "Soma total do ranking" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Faturamento reativado" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { style: { color: 'var(--success)' }, children: formatCurrency(totalRecoveredRevenue) }), _jsx("p", { className: "stat-card-helper", children: "Soma de pedidos de retorno" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Equipe ativa" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(leaderboard.length) }), _jsx("p", { className: "stat-card-helper", children: "Atendentes com reativacao" })] })] })] }), _jsxs("section", { className: "panel", style: { padding: '0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }, children: [_jsx("div", { className: "panel-header", style: { padding: '1.25rem 1.25rem 1rem 1.25rem', borderBottom: '1px solid var(--line)', background: 'transparent' }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: '1.2rem', margin: 0 }, children: "Placar Consolidado" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: '0.3rem' }, children: "Detalhamento da conversao por consultor e seus respectivos clientes reativados." })] }) }), leaderboard.length ? (_jsx("div", { className: "leaderboard-list", style: { padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }, children: leaderboard.map((entry, index) => (_jsxs("article", { className: "leaderboard-card", children: [_jsxs("div", { className: "leaderboard-card-header", children: [_jsxs("div", { className: "leaderboard-rank", children: ["#", index + 1] }), _jsxs("div", { className: "leaderboard-copy", children: [_jsx("strong", { style: index === 0 ? { color: 'var(--accent)' } : {}, children: entry.attendant }), _jsxs("span", { children: [formatNumber(entry.recoveredCustomers), " clientes recuperados"] })] }), _jsxs("div", { className: "leaderboard-metric", children: [_jsx("span", { children: "Faturamento gerado" }), _jsx("strong", { style: { color: 'var(--success)' }, children: formatCurrency(entry.recoveredRevenue) })] })] }), _jsx("div", { style: { marginTop: '0.5rem', borderTop: '1px solid var(--line)', paddingTop: '0.5rem' }, children: _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: 'var(--muted)' }, children: [_jsx("th", { style: { width: '45%', textAlign: 'left', padding: '0.4rem 0.5rem', fontWeight: 600 }, children: "Cliente" }), _jsx("th", { style: { width: '20%', textAlign: 'center', padding: '0.4rem 0.5rem', fontWeight: 600 }, children: "Inativo por" }), _jsx("th", { style: { width: '25%', textAlign: 'right', padding: '0.4rem 0.5rem', fontWeight: 600 }, children: "Pedido Retorno" }), _jsx("th", { style: { width: '10%', minWidth: '60px' } })] }) }), _jsx("tbody", { children: entry.recoveredClients.map((client) => (_jsxs("tr", { style: { borderBottom: '1px solid rgba(41,86,215,0.05)' }, children: [_jsx("td", { style: { padding: '0.6rem 0.5rem', overflow: 'hidden', textOverflow: 'ellipsis' }, children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column' }, children: [_jsx("strong", { style: { color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: client.displayName }), _jsx("span", { style: { fontSize: '0.7rem', color: 'var(--muted)' }, children: client.customerCode || "Sem codigo" })] }) }), _jsxs("td", { style: { textAlign: 'center', padding: '0.6rem 0.5rem', color: 'var(--text)', whiteSpace: 'nowrap' }, children: [formatNumber(client.daysInactiveBeforeReturn), " dias"] }), _jsx("td", { style: { textAlign: 'right', padding: '0.6rem 0.5rem', fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap' }, children: formatCurrency(client.reactivatedOrderAmount) }), _jsx("td", { style: { textAlign: 'right', padding: '0.6rem 0.5rem' }, children: _jsx(Link, { to: `/clientes/${client.customerId}`, style: { fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, padding: '0.2rem 0.4rem', border: '1px solid rgba(41,86,215,0.15)', borderRadius: '4px' }, children: "Abrir" }) })] }, `${entry.attendant}-${client.customerId}`))) })] }) })] }, `${entry.attendant}-${index}`))) })) : (_jsx("div", { className: "empty-state", style: { padding: '3rem' }, children: "Ainda nao houve reativacao registrada neste mes." }))] })] }));
}

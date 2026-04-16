import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, formatShortDate } from "../lib/format";
function formatMonthLabel(value) {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    const year = match?.[1];
    const month = match?.[2];
    if (!year || !month) {
        return value;
    }
    return `${month}/${year.slice(2)}`;
}
function DailyTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: formatDate(label) }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: formatNumber(payload[0]?.value ?? 0) }), _jsx("span", { children: "clientes na primeira compra" })] })] }));
}
function MonthlyTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: formatNumber(payload[0]?.value ?? 0) }), _jsx("span", { children: "clientes novos no mes" })] })] }));
}
function ReactivationGoldPage() {
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
    return (_jsxs("div", { className: "page-stack", children: [_jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }, children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: "0.2rem" }, children: "Ranking de reativacao" }), _jsx("h2", { style: { margin: 0, fontSize: "1.5rem" }, children: "Recuperadoras de Ouro" })] }) }), _jsxs("div", { className: "stats-grid", children: [_jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Mes analisado" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: monthLabel }), _jsx("p", { className: "stat-card-helper", children: "Primeira reativacao no mes" })] })] }), _jsxs("div", { className: "stat-card tone-success", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Clientes recuperados" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(totalRecoveredCustomers) }), _jsx("p", { className: "stat-card-helper", children: "Soma total do ranking" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Faturamento reativado" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { style: { color: "var(--success)" }, children: formatCurrency(totalRecoveredRevenue) }), _jsx("p", { className: "stat-card-helper", children: "Soma de pedidos de retorno" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Equipe ativa" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(leaderboard.length) }), _jsx("p", { className: "stat-card-helper", children: "Atendentes com reativacao" })] })] })] }), _jsxs("section", { className: "panel", style: { padding: "0", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [_jsx("div", { className: "panel-header", style: { padding: "1.25rem 1.25rem 1rem 1.25rem", borderBottom: "1px solid var(--line)", background: "transparent" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.2rem", margin: 0 }, children: "Placar Consolidado" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Detalhamento da conversao por consultor e seus respectivos clientes reativados." })] }) }), leaderboard.length ? (_jsx("div", { className: "leaderboard-list", style: { padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }, children: leaderboard.map((entry, index) => (_jsxs("article", { className: "leaderboard-card", children: [_jsxs("div", { className: "leaderboard-card-header", children: [_jsxs("div", { className: "leaderboard-rank", children: ["#", index + 1] }), _jsxs("div", { className: "leaderboard-copy", children: [_jsx("strong", { style: index === 0 ? { color: "var(--accent)" } : {}, children: entry.attendant }), _jsxs("span", { children: [formatNumber(entry.recoveredCustomers), " clientes recuperados"] })] }), _jsxs("div", { className: "leaderboard-metric", children: [_jsx("span", { children: "Faturamento gerado" }), _jsx("strong", { style: { color: "var(--success)" }, children: formatCurrency(entry.recoveredRevenue) })] })] }), _jsx("div", { style: { marginTop: "0.5rem", borderTop: "1px solid var(--line)", paddingTop: "0.5rem" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", tableLayout: "fixed" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { color: "var(--muted)" }, children: [_jsx("th", { style: { width: "45%", textAlign: "left", padding: "0.4rem 0.5rem", fontWeight: 600 }, children: "Cliente" }), _jsx("th", { style: { width: "20%", textAlign: "center", padding: "0.4rem 0.5rem", fontWeight: 600 }, children: "Inativo por" }), _jsx("th", { style: { width: "25%", textAlign: "right", padding: "0.4rem 0.5rem", fontWeight: 600 }, children: "Pedido Retorno" }), _jsx("th", { style: { width: "10%", minWidth: "60px" } })] }) }), _jsx("tbody", { children: entry.recoveredClients.map((client) => (_jsxs("tr", { style: { borderBottom: "1px solid rgba(41,86,215,0.05)" }, children: [_jsx("td", { style: { padding: "0.6rem 0.5rem", overflow: "hidden", textOverflow: "ellipsis" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("strong", { style: { color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: client.displayName }), _jsx("span", { style: { fontSize: "0.7rem", color: "var(--muted)" }, children: client.customerCode || "Sem codigo" })] }) }), _jsxs("td", { style: { textAlign: "center", padding: "0.6rem 0.5rem", color: "var(--text)", whiteSpace: "nowrap" }, children: [formatNumber(client.daysInactiveBeforeReturn), " dias"] }), _jsx("td", { style: {
                                                                textAlign: "right",
                                                                padding: "0.6rem 0.5rem",
                                                                fontWeight: 600,
                                                                color: "var(--success)",
                                                                whiteSpace: "nowrap",
                                                            }, children: formatCurrency(client.reactivatedOrderAmount) }), _jsx("td", { style: { textAlign: "right", padding: "0.6rem 0.5rem" }, children: _jsx(Link, { to: `/clientes/${client.customerId}`, style: {
                                                                    fontSize: "0.75rem",
                                                                    color: "var(--accent)",
                                                                    textDecoration: "none",
                                                                    fontWeight: 600,
                                                                    padding: "0.2rem 0.4rem",
                                                                    border: "1px solid rgba(41,86,215,0.15)",
                                                                    borderRadius: "4px",
                                                                }, children: "Abrir" }) })] }, `${entry.attendant}-${client.customerId}`))) })] }) })] }, `${entry.attendant}-${index}`))) })) : (_jsx("div", { className: "empty-state", style: { padding: "3rem" }, children: "Ainda nao houve reativacao registrada neste mes." }))] })] }));
}
function NewCustomersPage() {
    const { token } = useAuth();
    const acquisitionQuery = useQuery({
        queryKey: ["acquisition-dashboard"],
        queryFn: () => api.acquisition(token),
        enabled: Boolean(token),
    });
    if (acquisitionQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando clientes novos..." });
    }
    if (acquisitionQuery.isError || !acquisitionQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os dados de clientes novos." });
    }
    const data = acquisitionQuery.data;
    return (_jsxs("div", { className: "page-stack", children: [_jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }, children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: "0.2rem" }, children: "Aquisi\u00E7\u00E3o por primeira compra" }), _jsx("h2", { style: { margin: 0, fontSize: "1.5rem" }, children: "Clientes novos" })] }) }), _jsxs("div", { className: "stats-grid", children: [_jsxs("div", { className: "stat-card tone-success", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Novos hoje" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.today) }), _jsx("p", { className: "stat-card-helper", children: "Primeira compra registrada hoje" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Novos ontem" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.yesterday) }), _jsx("p", { className: "stat-card-helper", children: "Comparativo imediato" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Novos no mes" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.currentMonth) }), _jsxs("p", { className: "stat-card-helper", children: ["Contra ", formatNumber(data.summary.previousMonth), " no mes anterior"] })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Total historico" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.historicalTotal) }), _jsx("p", { className: "stat-card-helper", children: "Clientes contados uma unica vez" })] })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: "1rem" }, children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", style: { marginBottom: "1rem" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.15rem", margin: 0 }, children: "Clientes novos por dia" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Leitura diaria dos ultimos 30 dias para acompanhar a aquisicao recente." })] }) }), _jsx("div", { style: { width: "100%", height: "260px" }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { data: data.dailySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false }), _jsx(YAxis, { allowDecimals: false, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false }), _jsx(Tooltip, { content: _jsx(DailyTooltip, {}) }), _jsx(Line, { type: "monotone", dataKey: "newCustomers", stroke: "#2956d7", strokeWidth: 3, dot: { r: 3, strokeWidth: 0, fill: "#2956d7" }, activeDot: { r: 5 } })] }) }) })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", style: { marginBottom: "1rem" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.15rem", margin: 0 }, children: "Clientes novos do mes" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Lista atual de aquisicao para abrir o cadastro e revisar origem." })] }) }), data.recentCustomers.length ? (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: data.recentCustomers.map((customer) => (_jsxs("article", { style: {
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0, 1fr) auto",
                                        gap: "0.75rem",
                                        padding: "0.9rem 1rem",
                                        border: "1px solid var(--line)",
                                        borderRadius: "16px",
                                        background: "rgba(249, 251, 255, 0.9)",
                                    }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("strong", { style: { display: "block", marginBottom: "0.2rem" }, children: customer.displayName }), _jsxs("span", { style: { display: "block", color: "var(--muted)", fontSize: "0.82rem" }, children: [customer.customerCode || "Sem codigo", " | 1a compra em ", formatDate(customer.firstOrderDate)] }), _jsxs("span", { style: { display: "block", color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.25rem" }, children: [customer.firstAttendant ? `Atendente: ${customer.firstAttendant}` : "Atendente nao informado", " |", " ", formatCurrency(customer.firstOrderAmount)] })] }), _jsx("div", { style: { display: "flex", alignItems: "center" }, children: _jsx(Link, { to: `/clientes/${customer.customerId}`, style: {
                                                    fontSize: "0.8rem",
                                                    color: "var(--accent)",
                                                    textDecoration: "none",
                                                    fontWeight: 700,
                                                    padding: "0.5rem 0.8rem",
                                                    border: "1px solid rgba(41,86,215,0.15)",
                                                    borderRadius: "999px",
                                                    whiteSpace: "nowrap",
                                                }, children: "Abrir cliente" }) })] }, customer.customerId))) })) : (_jsx("div", { className: "empty-state", style: { padding: "2rem 1rem" }, children: "Ainda nao houve cliente novo neste mes." }))] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", style: { marginBottom: "1rem" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.15rem", margin: 0 }, children: "Historico mensal" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Evolucao da aquisicao desde o primeiro mes com pedidos no CRM." })] }) }), _jsx("div", { style: { width: "100%", height: "250px", marginBottom: "1rem" }, children: _jsx(ResponsiveContainer, { children: _jsxs(BarChart, { data: data.monthlySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "month", tickFormatter: formatMonthLabel, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false, interval: "preserveStartEnd" }), _jsx(YAxis, { allowDecimals: false, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false }), _jsx(Tooltip, { content: _jsx(MonthlyTooltip, {}) }), _jsx(Bar, { dataKey: "newCustomers", fill: "#2f9d67", radius: [8, 8, 0, 0] })] }) }) }), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: "640px" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--muted)" }, children: [_jsx("th", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: "Mes" }), _jsx("th", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: "Clientes novos" })] }) }), _jsx("tbody", { children: data.monthlySeries
                                        .slice()
                                        .reverse()
                                        .map((entry) => (_jsxs("tr", { style: { borderTop: "1px solid var(--line)" }, children: [_jsx("td", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: formatMonthLabel(entry.month) }), _jsx("td", { style: { padding: "0.75rem 0.5rem" }, children: formatNumber(entry.newCustomers) })] }, entry.month))) })] }) })] })] }));
}
export function ReactivationPage() {
    const [activeTab, setActiveTab] = useState("reactivation");
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("div", { className: "whatsapp-segmented-control", style: { alignSelf: "flex-start", marginBottom: "0.5rem" }, children: [_jsx("button", { type: "button", className: activeTab === "reactivation" ? "active" : "", onClick: () => setActiveTab("reactivation"), children: "Reativacao" }), _jsx("button", { type: "button", className: activeTab === "acquisition" ? "active" : "", onClick: () => setActiveTab("acquisition"), children: "Clientes novos" })] }), activeTab === "reactivation" ? _jsx(ReactivationGoldPage, {}) : _jsx(NewCustomersPage, {})] }));
}

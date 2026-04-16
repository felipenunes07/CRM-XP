import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
function buildMonthlyTicks(months) {
    if (months.length <= 8) {
        return months.map((entry) => entry.month);
    }
    const step = Math.ceil(months.length / 8);
    const ticks = months.filter((_, index) => index % step === 0).map((entry) => entry.month);
    const lastMonth = months.at(-1)?.month;
    if (lastMonth && ticks.at(-1) !== lastMonth) {
        ticks.push(lastMonth);
    }
    return ticks;
}
function formatCac(value) {
    return value === null ? "Sem base" : formatCurrency(value);
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
    const newCustomers = payload.find((entry) => entry.dataKey === "newCustomers")?.value ?? 0;
    const spend = payload.find((entry) => entry.dataKey === "spend")?.value ?? 0;
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: formatNumber(newCustomers) }), _jsx("span", { children: "clientes novos no mes" })] }), _jsxs("div", { className: "chart-tooltip-count", style: { marginTop: "0.35rem" }, children: [_jsx("strong", { children: formatCurrency(spend) }), _jsx("span", { children: "gasto em anuncios" })] })] }));
}
function CacTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: formatCac(payload[0]?.value ?? null) }), _jsx("span", { children: "custo por cliente adquirido" })] })] }));
}
export function NewCustomersPage() {
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
    const monthlyTicks = buildMonthlyTicks(data.monthlySeries);
    return (_jsxs("div", { className: "page-stack", children: [_jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }, children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: "0.2rem" }, children: "Aquisicao por primeira compra" }), _jsx("h2", { style: { margin: 0, fontSize: "1.5rem" }, children: "Clientes novos" })] }) }), _jsxs("div", { className: "stats-grid", children: [_jsxs("div", { className: "stat-card tone-success", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Novos hoje" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.today) }), _jsx("p", { className: "stat-card-helper", children: "Primeira compra registrada hoje" })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Novos no mes" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.currentMonth) }), _jsxs("p", { className: "stat-card-helper", children: ["Contra ", formatNumber(data.summary.previousMonth), " no mes anterior"] })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Gasto no mes" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatCurrency(data.summary.currentMonthSpend) }), _jsxs("p", { className: "stat-card-helper", children: ["Contra ", formatCurrency(data.summary.previousMonthSpend), " no mes anterior"] })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "CAC no mes" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatCac(data.summary.currentMonthCac) }), _jsxs("p", { className: "stat-card-helper", children: ["Mes anterior: ", formatCac(data.summary.previousMonthCac)] })] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: "Total historico" }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatNumber(data.summary.historicalTotal) }), _jsx("p", { className: "stat-card-helper", children: "Clientes contados uma unica vez" })] })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: "1rem" }, children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", style: { marginBottom: "1rem" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.15rem", margin: 0 }, children: "Clientes novos por dia" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Leitura diaria dos ultimos 30 dias para acompanhar a aquisicao recente." })] }) }), _jsx("div", { style: { width: "100%", height: "260px" }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { data: data.dailySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false }), _jsx(YAxis, { allowDecimals: false, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false }), _jsx(Tooltip, { content: _jsx(DailyTooltip, {}) }), _jsx(Line, { type: "monotone", dataKey: "newCustomers", stroke: "#2956d7", strokeWidth: 3, dot: { r: 3, strokeWidth: 0, fill: "#2956d7" }, activeDot: { r: 5 } })] }) }) })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", style: { marginBottom: "1rem" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.15rem", margin: 0 }, children: "Clientes novos do mes" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Lista atual de aquisicao para abrir o cadastro e revisar origem." })] }) }), data.recentCustomers.length ? (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem" }, children: data.recentCustomers.map((customer) => (_jsxs("article", { style: {
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
                                                }, children: "Abrir cliente" }) })] }, customer.customerId))) })) : (_jsx("div", { className: "empty-state", style: { padding: "2rem 1rem" }, children: "Ainda nao houve cliente novo neste mes." }))] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", style: { marginBottom: "1rem" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.15rem", margin: 0 }, children: "Historico mensal" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Evolucao da aquisicao desde o primeiro mes com pedidos no CRM." })] }) }), _jsx("div", { style: { width: "100%", height: "250px", marginBottom: "1rem" }, children: _jsx(ResponsiveContainer, { children: _jsxs(ComposedChart, { syncId: "acquisition-history", syncMethod: "value", data: data.monthlySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "month", ticks: monthlyTicks, tickFormatter: formatMonthLabel, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false, interval: 0 }), _jsx(YAxis, { yAxisId: "customers", allowDecimals: false, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false, width: 48 }), _jsx(YAxis, { yAxisId: "spend", orientation: "right", tickFormatter: (value) => formatCurrency(value), tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false, width: 90 }), _jsx(Tooltip, { content: _jsx(MonthlyTooltip, {}), cursor: { stroke: "rgba(41, 86, 215, 0.35)", strokeWidth: 2, strokeDasharray: "4 4" } }), _jsx(Bar, { yAxisId: "customers", dataKey: "newCustomers", fill: "#2f9d67", radius: [8, 8, 0, 0] }), _jsx(Line, { yAxisId: "spend", type: "monotone", dataKey: "spend", stroke: "#2956d7", strokeWidth: 3, dot: { r: 2, strokeWidth: 0, fill: "#2956d7" }, activeDot: { r: 6, strokeWidth: 2, stroke: "#ffffff", fill: "#2956d7" } })] }) }) }), _jsxs("div", { style: { marginBottom: "0.9rem" }, children: [_jsx("h4", { style: { margin: 0, fontSize: "1rem" }, children: "Grafico de CAC" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.25rem" }, children: "Evolucao mensal do custo por cliente novo com base no gasto do Meta Ads." })] }), _jsx("div", { style: { width: "100%", height: "220px", marginBottom: "1rem" }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { syncId: "acquisition-history", syncMethod: "value", data: data.monthlySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "month", ticks: monthlyTicks, tickFormatter: formatMonthLabel, tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false, interval: 0 }), _jsx(YAxis, { yAxisId: "spacer", tick: false, tickLine: false, axisLine: false, width: 48 }), _jsx(YAxis, { yAxisId: "cac", orientation: "right", tickFormatter: (value) => formatCurrency(value), tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false, axisLine: false, width: 90 }), _jsx(Tooltip, { content: _jsx(CacTooltip, {}), cursor: { stroke: "rgba(217, 119, 6, 0.35)", strokeWidth: 2, strokeDasharray: "4 4" } }), _jsx(Line, { yAxisId: "cac", type: "monotone", dataKey: "cac", stroke: "#d97706", strokeWidth: 3, dot: { r: 2, strokeWidth: 0, fill: "#d97706" }, activeDot: { r: 6, strokeWidth: 2, stroke: "#ffffff", fill: "#d97706" }, connectNulls: false })] }) }) }), _jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: "640px" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: "left", color: "var(--muted)" }, children: [_jsx("th", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: "Mes" }), _jsx("th", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: "Clientes novos" }), _jsx("th", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: "Gasto" }), _jsx("th", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: "CAC" })] }) }), _jsx("tbody", { children: data.monthlySeries
                                        .slice()
                                        .reverse()
                                        .map((entry) => (_jsxs("tr", { style: { borderTop: "1px solid var(--line)" }, children: [_jsx("td", { style: { padding: "0.75rem 0.5rem", fontWeight: 600 }, children: formatMonthLabel(entry.month) }), _jsx("td", { style: { padding: "0.75rem 0.5rem" }, children: formatNumber(entry.newCustomers) }), _jsx("td", { style: { padding: "0.75rem 0.5rem" }, children: formatCurrency(entry.spend) }), _jsx("td", { style: { padding: "0.75rem 0.5rem" }, children: formatCac(entry.cac) })] }, entry.month))) })] }) })] })] }));
}

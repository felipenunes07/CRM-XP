import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { Link } from "react-router-dom";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
const bucketFilters = {
    "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
    "15-29": { minDaysInactive: 15, maxDaysInactive: 29 },
    "30-59": { minDaysInactive: 30, maxDaysInactive: 59 },
    "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
    "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
    "180+": { minDaysInactive: 180 },
};
const chartViewCopy = {
    inactivity: {
        eyebrow: "Faixas de inatividade",
        title: "Onde esta o risco de parada",
        description: "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.",
        toggleLabel: "Risco de parada",
        toggleHelper: "Veja as faixas de dias sem compra e filtre a lista.",
    },
    trend: {
        eyebrow: "Tendencia da carteira",
        title: "Evolucao diaria da base",
        description: "Acompanhe dia a dia quantos clientes estao ativos, em atencao, inativos e como o total da base evoluiu nos ultimos 90 dias.",
        toggleLabel: "Evolucao da base",
        toggleHelper: "Compare as linhas de status com o crescimento da carteira.",
    },
};
const shortMonthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const longMonthNames = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
];
function extractTrendParts(value) {
    const monthlyMatch = value.match(/^(\d{4})-(\d{2})$/);
    if (monthlyMatch) {
        return {
            year: monthlyMatch[1],
            month: Number(monthlyMatch[2]),
            day: null,
        };
    }
    const dailyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dailyMatch) {
        return null;
    }
    return {
        year: dailyMatch[1],
        month: Number(dailyMatch[2]),
        day: Number(dailyMatch[3]),
    };
}
function formatTrendAxisLabel(value, granularity) {
    const parts = extractTrendParts(value);
    if (!parts) {
        return "--";
    }
    const safeYear = parts.year ?? "0000";
    const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));
    if (granularity === "monthly") {
        return `${shortMonthNames[safeMonth - 1]}/${safeYear.slice(2)}`;
    }
    return `${String(parts.day ?? 0).padStart(2, "0")}/${String(safeMonth).padStart(2, "0")}`;
}
function formatTrendTooltipLabel(value, granularity) {
    const parts = extractTrendParts(value);
    if (!parts) {
        return "--";
    }
    const safeYear = parts.year ?? "0000";
    const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));
    if (granularity === "monthly") {
        return `Fechamento de ${longMonthNames[safeMonth - 1]} de ${safeYear}`;
    }
    return formatDate(value);
}
function groupTrendByMonth(points) {
    const grouped = new Map();
    for (const point of points) {
        grouped.set(point.date.slice(0, 7), point);
    }
    return Array.from(grouped.entries()).map(([monthKey, point]) => ({
        ...point,
        date: monthKey,
    }));
}
function bucketColor(label, selected) {
    if (selected) {
        return "#5f8cff";
    }
    if (label === "0-14" || label === "15-29") {
        return "#a8c1ff";
    }
    if (label === "30-59" || label === "60-89") {
        return "#5f8cff";
    }
    return "#2956d7";
}
function getAgendaPreviewItems(items) {
    return (items ?? []).slice(0, 6);
}
function bucketTooltipNote(label) {
    if (label === "0-14") {
        return "Todos nesta faixa seguem no status Ativo.";
    }
    if (label === "15-29") {
        return "Todos nesta faixa seguem no status Ativo.";
    }
    if (label === "30-59") {
        return "Faixa de transicao: no dia 30 ainda pode estar Ativo; de 31 a 59 entra em Atencao.";
    }
    if (label === "60-89") {
        return "Todos nesta faixa ja estao em Atencao.";
    }
    return "Todos nesta faixa ja estao Inativos.";
}
function InactivityTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsxs("strong", { children: [label, " dias sem compra"] }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: formatNumber(payload[0]?.value ?? 0) }), _jsx("span", { children: "clientes nessa faixa" })] }), _jsx("p", { children: bucketTooltipNote(label) })] }));
}
function TrendTooltip({ active, payload, label, granularity, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    const lines = [
        { key: "activeCount", label: "Ativos" },
        { key: "attentionCount", label: "Atencao" },
        { key: "inactiveCount", label: "Inativos" },
        { key: "totalCustomers", label: "Total da base" },
    ];
    return (_jsxs("div", { className: "chart-tooltip trend-tooltip", children: [_jsx("strong", { children: formatTrendTooltipLabel(label, granularity) }), _jsx("div", { className: "trend-tooltip-list", children: lines.map((line) => {
                    const point = payload.find((entry) => entry.dataKey === line.key);
                    return (_jsxs("div", { className: "trend-tooltip-item", children: [_jsx("span", { children: line.label }), _jsx("strong", { children: formatNumber(point?.value ?? 0) })] }, line.key));
                }) })] }));
}
function formatShare(value, total) {
    if (!total) {
        return "0% da base";
    }
    return `${((value / total) * 100).toFixed(1).replace(".", ",")}% da base`;
}
export function DashboardPage() {
    const { token } = useAuth();
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [chartView, setChartView] = useState("inactivity");
    const [trendGranularity, setTrendGranularity] = useState("daily");
    const [isSyncing, setIsSyncing] = useState(false);
    const dashboardQuery = useQuery({
        queryKey: ["dashboard"],
        queryFn: () => api.dashboard(token),
        enabled: Boolean(token),
    });
    const agendaQuery = useQuery({
        queryKey: ["dashboard-agenda-preview"],
        queryFn: () => api.agenda(token, 6, 0),
        enabled: Boolean(token),
    });
    const filteredCustomersQuery = useQuery({
        queryKey: ["dashboard-bucket-customers", selectedBucket],
        queryFn: () => api.customers(token, {
            ...(selectedBucket ? bucketFilters[selectedBucket] : {}),
            sortBy: "priority",
            limit: 120,
        }),
        enabled: Boolean(token && selectedBucket),
    });
    const priorityCustomersQuery = useQuery({
        queryKey: ["dashboard-priority-customers"],
        queryFn: () => api.customers(token, {
            sortBy: "priority",
            limit: 120,
        }),
        enabled: Boolean(token && !selectedBucket),
    });
    if (dashboardQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando dashboard..." });
    }
    if (dashboardQuery.isError || !dashboardQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar o dashboard." });
    }
    const metrics = dashboardQuery.data;
    const activeChartCopy = chartViewCopy[chartView];
    const trendData = trendGranularity === "monthly" ? groupTrendByMonth(metrics.portfolioTrend) : metrics.portfolioTrend;
    const chartDescription = chartView === "trend" && trendGranularity === "monthly"
        ? "Veja o fechamento consolidado de cada mes para comparar a direcao da carteira sem o ruido do dia a dia."
        : activeChartCopy.description;
    const agendaItems = getAgendaPreviewItems(agendaQuery.data?.items);
    const tableCustomers = selectedBucket ? (filteredCustomersQuery.data ?? []) : (priorityCustomersQuery.data ?? []);
    const tableQueryLoading = selectedBucket ? filteredCustomersQuery.isLoading : priorityCustomersQuery.isLoading;
    const tableQueryError = selectedBucket ? filteredCustomersQuery.isError : priorityCustomersQuery.isError;
    async function handleSync() {
        try {
            setIsSyncing(true);
            await api.syncData(token, "direct");
            window.location.reload();
        }
        catch (err) {
            alert("Falha na sincronizacao: " + String(err));
        }
        finally {
            setIsSyncing(false);
        }
    }
    function handleChangeChartView(nextView) {
        setChartView(nextView);
        if (nextView === "trend") {
            setSelectedBucket(null);
        }
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "hero-panel dashboard-hero", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Operacao comercial" }), _jsx("h2", { children: "Prioridades de contato e saude da carteira" }), _jsx("p", { children: "Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada." }), _jsxs("div", { className: "hero-actions", children: [_jsx(Link, { className: "primary-button", to: "/agenda", children: "Abrir agenda do dia" }), _jsx("button", { className: "ghost-button", type: "button", disabled: isSyncing, onClick: handleSync, children: isSyncing ? "Sincronizando..." : "Sincronizar Agora" })] })] }), _jsxs("div", { className: "hero-meta", children: [_jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Ultima sincronizacao" }), _jsx("strong", { children: metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString("pt-BR") : "Sincronizacao pendente" })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Frequencia media" }), _jsxs("strong", { children: [metrics.averageFrequencyDays.toFixed(1), " dias"] })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Agenda acionavel" }), _jsxs("strong", { children: [formatNumber(metrics.agendaEligibleCount), " clientes"] })] })] })] }), _jsxs("section", { className: "stats-grid", children: [_jsx(StatCard, { title: "Total de clientes", value: formatNumber(metrics.totalCustomers), helper: "Base comercial consolidada" }), _jsx(StatCard, { title: "Clientes ativos", value: formatNumber(metrics.statusCounts.ACTIVE), badge: formatShare(metrics.statusCounts.ACTIVE, metrics.totalCustomers), helper: "Clientes dentro da zona ativa", tone: "success" }), _jsx(StatCard, { title: "Clientes em atencao", value: formatNumber(metrics.statusCounts.ATTENTION), badge: formatShare(metrics.statusCounts.ATTENTION, metrics.totalCustomers), helper: "Clientes pedindo monitoramento", tone: "warning" }), _jsx(StatCard, { title: "Clientes inativos", value: formatNumber(metrics.statusCounts.INACTIVE), badge: formatShare(metrics.statusCounts.INACTIVE, metrics.totalCustomers), helper: "Clientes fora da zona ativa", tone: "danger" }), _jsx(StatCard, { title: "Frequencia media", value: `${metrics.averageFrequencyDays.toFixed(1)} dias`, helper: "Intervalo medio entre pedidos" })] }), _jsxs("section", { className: "grid-two dashboard-grid", children: [_jsxs("article", { className: "panel chart-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: activeChartCopy.eyebrow }), chartView === "inactivity" ? (_jsxs("h3", { className: "header-with-info", children: [activeChartCopy.title, _jsx(InfoHint, { text: "As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias." })] })) : (_jsx("h3", { children: activeChartCopy.title }))] }) }), _jsx("p", { className: "panel-subcopy", children: chartDescription }), _jsx("div", { className: "chart-switcher", role: "tablist", "aria-label": "Alternar visualizacao dos graficos do dashboard", children: Object.entries(chartViewCopy).map(([view, copy]) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": chartView === view, "aria-pressed": chartView === view, className: `chart-switch-button ${chartView === view ? "active" : ""}`, onClick: () => handleChangeChartView(view), children: [_jsx("strong", { children: copy.toggleLabel }), _jsx("span", { children: copy.toggleHelper })] }, view))) }), chartView === "inactivity" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "status-guide-grid", children: [_jsxs("div", { className: "status-guide-card is-active", children: [_jsx("strong", { children: "Ativo" }), _jsx("span", { children: "Ate 30 dias sem comprar" })] }), _jsxs("div", { className: "status-guide-card is-attention", children: [_jsx("strong", { children: "Atencao" }), _jsx("span", { children: "De 31 a 89 dias sem comprar" })] }), _jsxs("div", { className: "status-guide-card is-inactive", children: [_jsx("strong", { children: "Inativo" }), _jsx("span", { children: "90 dias ou mais sem comprar" })] })] }), _jsx("div", { className: "chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 280, children: _jsxs(BarChart, { data: metrics.inactivityBuckets, onClick: (state) => {
                                                    const label = state?.activeLabel;
                                                    if (!label || !(label in bucketFilters)) {
                                                        return;
                                                    }
                                                    setSelectedBucket((current) => (current === label ? null : label));
                                                }, margin: { top: 12, right: 8, left: 0, bottom: 0 }, children: [_jsx(XAxis, { dataKey: "label", stroke: "#5f6f95" }), _jsx(Tooltip, { content: _jsx(InactivityTooltip, {}), cursor: { fill: "rgba(41, 86, 215, 0.04)" } }), _jsx(Bar, { dataKey: "count", radius: [8, 8, 0, 0], cursor: "pointer", children: metrics.inactivityBuckets.map((bucket) => (_jsx(Cell, { fill: bucketColor(bucket.label, selectedBucket === bucket.label) }, bucket.label))) })] }) }) }), selectedBucket ? (_jsxs("div", { className: "inline-actions", children: [_jsxs("span", { className: "tag", children: ["Filtro ativo: ", selectedBucket] }), _jsx("button", { className: "ghost-button", type: "button", onClick: () => setSelectedBucket(null), children: "Limpar filtro" })] })) : null] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "trend-toolbar", children: [_jsxs("div", { className: "trend-toolbar-copy", children: [_jsx("strong", { children: trendGranularity === "daily" ? "Leitura diaria" : "Fechamento mensal" }), _jsx("span", { children: trendGranularity === "daily"
                                                            ? "Ideal para acompanhar viradas recentes de status e pequenas oscilacoes da base."
                                                            : "Ideal para ver a direcao geral do mes e comparar a carteira com menos ruido." })] }), _jsxs("div", { className: "trend-granularity-toggle", role: "tablist", "aria-label": "Alternar periodo do grafico de evolucao", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": trendGranularity === "daily", className: `trend-granularity-button ${trendGranularity === "daily" ? "active" : ""}`, onClick: () => setTrendGranularity("daily"), children: "Dia" }), _jsx("button", { type: "button", role: "tab", "aria-selected": trendGranularity === "monthly", className: `trend-granularity-button ${trendGranularity === "monthly" ? "active" : ""}`, onClick: () => setTrendGranularity("monthly"), children: "Mes" })] })] }), _jsx("div", { className: "trend-chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 320, children: _jsxs(LineChart, { data: trendData, margin: { top: 12, right: 8, left: -12, bottom: 4 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "date", tickFormatter: (value) => formatTrendAxisLabel(String(value), trendGranularity), stroke: "#5f6f95", minTickGap: trendGranularity === "monthly" ? 0 : 24 }), _jsx(YAxis, { stroke: "#5f6f95" }), _jsx(Tooltip, { content: _jsx(TrendTooltip, { granularity: trendGranularity }) }), _jsx(Legend, {}), _jsx(Line, { type: "monotone", dataKey: "activeCount", name: "Ativos", stroke: "#2f9d67", strokeWidth: 2.4, dot: false }), _jsx(Line, { type: "monotone", dataKey: "attentionCount", name: "Atencao", stroke: "#d09a29", strokeWidth: 2.4, dot: false }), _jsx(Line, { type: "monotone", dataKey: "inactiveCount", name: "Inativos", stroke: "#d9534f", strokeWidth: 2.4, dot: false }), _jsx(Line, { type: "monotone", dataKey: "totalCustomers", name: "Total da base", stroke: "#2956d7", strokeWidth: 2.2, strokeDasharray: "5 5", dot: false })] }) }) })] }))] }), _jsxs("article", { className: "panel insight-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Agenda de hoje" }), _jsxs("h3", { children: [formatNumber(metrics.agendaEligibleCount), " clientes pedem contato agora"] }), _jsx("p", { className: "panel-subcopy", children: "Fila pronta para a vendedora agir sem sair da tela inicial." })] }), _jsx(Link, { className: "ghost-button", to: "/agenda", children: "Ver agenda completa" })] }), agendaQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Montando fila de contato..." }) : null, agendaQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar a agenda de hoje." }) : null, !agendaQuery.isLoading && !agendaQuery.isError ? (agendaItems.length ? (_jsx("div", { className: "stack-list agenda-scroll-list", children: agendaItems.map((customer) => (_jsx(ContactQueueCard, { item: customer, compact: true }, customer.id))) })) : (_jsx("div", { className: "empty-state", children: "Nenhum cliente precisa de contato imediato neste momento." }))) : null] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: selectedBucket ? "Clientes filtrados pelo grafico" : "Fila por prioridade" }), _jsx("h3", { children: selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes para o time abordar agora" }), _jsx("p", { className: "panel-subcopy", children: selectedBucket
                                        ? "A selecao do grafico mostra apenas clientes da faixa escolhida."
                                        : "Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras." })] }) }), tableQueryLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes priorizados..." }) : null, tableQueryError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar essa lista de clientes." }) : null, !tableQueryLoading && !tableQueryError ? _jsx(CustomerTable, { customers: tableCustomers }) : null] })] }));
}

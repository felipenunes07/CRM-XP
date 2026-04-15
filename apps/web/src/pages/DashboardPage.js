import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { Link } from "react-router-dom";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { PeriodSelector } from "../components/PeriodSelector";
import { SalesPerformancePanel } from "../components/SalesPerformancePanel";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
const periodOptions = [
    { value: '90d', label: '90 dias', days: 90 },
    { value: '6m', label: '6 meses', days: 180 },
    { value: '1y', label: '1 ano', days: 365 },
    { value: 'max', label: 'Período Máximo', days: 730 },
];
const bucketFilters = {
    "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
    "15-30": { minDaysInactive: 15, maxDaysInactive: 30 },
    "31-59": { minDaysInactive: 31, maxDaysInactive: 59 },
    "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
    "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
    "180+": { minDaysInactive: 180 },
};
const trendSeries = [
    {
        shareKey: "activeShare",
        countKey: "activeCount",
        label: "Ativos",
        emoji: "🟢",
        color: "#2f9d67",
        gradientId: "trend-active-fill",
        fillOpacityStart: 0.14,
        fillOpacityEnd: 0.03,
    },
    {
        shareKey: "attentionShare",
        countKey: "attentionCount",
        label: "Atencao",
        emoji: "🟡",
        color: "#d09a29",
        gradientId: "trend-attention-fill",
        fillOpacityStart: 0.12,
        fillOpacityEnd: 0.025,
    },
    {
        shareKey: "inactiveShare",
        countKey: "inactiveCount",
        label: "Inativos",
        emoji: "🔴",
        color: "#d9534f",
        gradientId: "trend-inactive-fill",
        fillOpacityStart: 0.045,
        fillOpacityEnd: 0.008,
    },
];
const chartViewCopy = {
    inactivity: {
        eyebrow: "Faixas de inatividade",
        title: "Onde esta o risco de parada",
        description: "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.",
        toggleLabel: "Risco de parada",
        toggleHelper: "Veja as faixas de dias sem compra e filtre a lista.",
    },
    trend: {
        eyebrow: "Composicao da carteira",
        title: "Composicao diaria da base",
        description: "Cada dia soma 100% da carteira para mostrar, em percentual, se a base esta ganhando ativos ou acumulando inativos.",
        toggleLabel: "Evolucao da base",
        toggleHelper: "Compare a participacao diaria de ativos, atencao e inativos.",
    },
};
function extractTrendParts(value) {
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
function formatTrendAxisLabel(value) {
    const parts = extractTrendParts(value);
    if (!parts) {
        return "--";
    }
    const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));
    return `${String(parts.day ?? 0).padStart(2, "0")}/${String(safeMonth).padStart(2, "0")}`;
}
function formatTrendTooltipLabel(value) {
    const parts = extractTrendParts(value);
    if (!parts) {
        return "--";
    }
    return formatDate(value);
}
function formatDecimal(value, fractionDigits = 1) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value);
}
function formatTrendPercent(value, fractionDigits = 1) {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    return `${formatDecimal(safeValue, fractionDigits)}%`;
}
function normalizeTrendPoint(point) {
    const totalFromStatuses = point.activeCount + point.attentionCount + point.inactiveCount;
    const total = totalFromStatuses || point.totalCustomers;
    if (!total) {
        return {
            ...point,
            activeShare: 0,
            attentionShare: 0,
            inactiveShare: 0,
        };
    }
    return {
        ...point,
        activeShare: (point.activeCount / total) * 100,
        attentionShare: (point.attentionCount / total) * 100,
        inactiveShare: (point.inactiveCount / total) * 100,
    };
}
function bucketColor(label, selected) {
    if (selected) {
        return "#5f8cff";
    }
    if (label === "0-14" || label === "15-30") {
        return "#a8c1ff";
    }
    if (label === "31-59" || label === "60-89") {
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
    if (label === "15-30") {
        return "Todos nesta faixa seguem no status Ativo.";
    }
    if (label === "31-59") {
        return "Todos nesta faixa ja estao em Atencao.";
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
function TrendTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    const point = payload[0]?.payload;
    return (_jsxs("div", { className: "chart-tooltip trend-tooltip", children: [_jsx("strong", { children: formatTrendTooltipLabel(label) }), point ? (_jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: formatNumber(point.totalCustomers) }), _jsx("span", { children: "clientes na base nesse dia" })] })) : null, _jsx("div", { className: "trend-tooltip-list", children: trendSeries.map((line) => {
                    const entry = payload.find((payloadItem) => payloadItem.dataKey === line.shareKey);
                    return (_jsxs("div", { className: "trend-tooltip-item", children: [_jsxs("span", { className: "trend-tooltip-label", children: [_jsx("span", { className: "trend-tooltip-emoji", style: { fontSize: "1.1rem", marginRight: "0.25rem" }, children: line.emoji }), line.label] }), _jsxs("div", { className: "trend-tooltip-metric", children: [_jsx("strong", { children: formatTrendPercent(entry?.value ?? 0) }), _jsxs("span", { children: [formatNumber(point?.[line.countKey] ?? 0), " clientes"] })] })] }, line.shareKey));
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
    const [isSyncing, setIsSyncing] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState(() => {
        const stored = sessionStorage.getItem('dashboard-trend-period');
        return (stored === '90d' || stored === '6m' || stored === '1y') ? stored : '90d';
    });
    useEffect(() => {
        sessionStorage.setItem('dashboard-trend-period', selectedPeriod);
    }, [selectedPeriod]);
    const trendDays = periodOptions.find(opt => opt.value === selectedPeriod)?.days ?? 90;
    const dashboardQuery = useQuery({
        queryKey: ["dashboard", trendDays],
        queryFn: () => api.dashboard(token, trendDays),
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
    const trendData = metrics.portfolioTrend.map(normalizeTrendPoint);
    const latestTrendPoint = trendData[trendData.length - 1];
    const chartDescription = activeChartCopy.description;
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
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "dashboard-hero-premium", children: [_jsx("div", { className: "hero-premium-bg", children: _jsx("div", { className: "hero-premium-gradient" }) }), _jsxs("div", { className: "hero-premium-content", children: [_jsxs("div", { className: "hero-premium-copy", children: [_jsx("div", { className: "premium-badge", children: "Operacao comercial" }), _jsx("h2", { className: "premium-title", children: "Prioridades de contato e saude da carteira" }), _jsx("p", { className: "premium-subtitle", children: "Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada." }), _jsxs("div", { className: "premium-actions", children: [_jsx(Link, { className: "premium-button primary", to: "/agenda", children: "Abrir agenda do dia" }), _jsx("button", { className: "premium-button ghost", type: "button", disabled: isSyncing, onClick: handleSync, children: isSyncing ? "Sincronizando..." : "Sincronizar Agora" })] })] }), _jsxs("div", { className: "hero-premium-stats", children: [_jsxs("div", { className: "premium-stat-card", children: [_jsx("div", { className: "premium-stat-icon", children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsxs("div", { className: "premium-stat-info", children: [_jsx("span", { children: "Ultima sincronizacao" }), _jsx("strong", { children: metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString("pt-BR") : "Pendente..." })] })] }), _jsxs("div", { className: "premium-stat-card", children: [_jsx("div", { className: "premium-stat-icon accent-blue", children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M13 10V3L4 14H11V21L20 10H13Z", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsxs("div", { className: "premium-stat-info", children: [_jsx("span", { children: "Frequencia media" }), _jsxs("strong", { children: [metrics.averageFrequencyDays.toFixed(1), " dias"] })] })] }), _jsxs("div", { className: "premium-stat-card", children: [_jsx("div", { className: "premium-stat-icon accent-purple", children: _jsx("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8581 3.35163 17.6184 3.85186 18.1614 4.55231C18.7044 5.25277 18.9993 6.11373 19 7C18.9993 7.88627 18.7044 8.74723 18.1614 9.44769C17.6184 10.1481 16.8581 10.6484 16 10.87M9 11C11.2091 11 13 9.20914 13 7C13 4.79086 11.2091 3 9 3C6.79086 3 5 4.79086 5 7C5 9.20914 6.79086 11 9 11Z", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsxs("div", { className: "premium-stat-info", children: [_jsx("span", { children: "Agenda acionavel" }), _jsxs("strong", { children: [formatNumber(metrics.agendaEligibleCount), " ", _jsx("small", { children: "clientes" })] })] })] })] })] })] }), _jsxs("section", { className: "stats-grid", children: [_jsx(StatCard, { title: "Total de clientes", value: formatNumber(metrics.totalCustomers), helper: "Base comercial consolidada" }), _jsx(StatCard, { title: "Clientes ativos", value: formatNumber(metrics.statusCounts.ACTIVE), badge: formatShare(metrics.statusCounts.ACTIVE, metrics.totalCustomers), helper: "Clientes dentro da zona ativa", tone: "success" }), _jsx(StatCard, { title: "Clientes em atencao", value: formatNumber(metrics.statusCounts.ATTENTION), badge: formatShare(metrics.statusCounts.ATTENTION, metrics.totalCustomers), helper: "Clientes pedindo monitoramento", tone: "warning" }), _jsx(StatCard, { title: "Clientes inativos", value: formatNumber(metrics.statusCounts.INACTIVE), badge: formatShare(metrics.statusCounts.INACTIVE, metrics.totalCustomers), helper: "Clientes fora da zona ativa", tone: "danger" }), _jsx(StatCard, { title: "Frequencia media", value: `${metrics.averageFrequencyDays.toFixed(1)} dias`, helper: "Intervalo medio entre pedidos" })] }), _jsxs("section", { className: "grid-two dashboard-grid", children: [_jsxs("article", { className: "panel chart-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: activeChartCopy.eyebrow }), chartView === "inactivity" ? (_jsxs("h3", { className: "header-with-info", children: [activeChartCopy.title, _jsx(InfoHint, { text: "As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias." })] })) : (_jsx("h3", { children: activeChartCopy.title }))] }) }), _jsx("p", { className: "panel-subcopy", children: chartDescription }), _jsx("div", { className: "chart-switcher", role: "tablist", "aria-label": "Alternar visualizacao dos graficos do dashboard", children: Object.entries(chartViewCopy).map(([view, copy]) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": chartView === view, "aria-pressed": chartView === view, className: `chart-switch-button ${chartView === view ? "active" : ""}`, onClick: () => handleChangeChartView(view), children: [_jsx("strong", { children: copy.toggleLabel }), _jsx("span", { children: copy.toggleHelper })] }, view))) }), chartView === "inactivity" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "status-guide-grid", children: [_jsxs("div", { className: "status-guide-card is-active", children: [_jsx("strong", { children: "Ativo" }), _jsx("span", { children: "Ate 30 dias sem comprar" })] }), _jsxs("div", { className: "status-guide-card is-attention", children: [_jsx("strong", { children: "Atencao" }), _jsx("span", { children: "De 31 a 89 dias sem comprar" })] }), _jsxs("div", { className: "status-guide-card is-inactive", children: [_jsx("strong", { children: "Inativo" }), _jsx("span", { children: "90 dias ou mais sem comprar" })] })] }), _jsx("div", { className: "chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 280, children: _jsxs(BarChart, { data: metrics.inactivityBuckets, onClick: (state) => {
                                                    const label = state?.activeLabel;
                                                    if (!label || !(label in bucketFilters)) {
                                                        return;
                                                    }
                                                    setSelectedBucket((current) => (current === label ? null : label));
                                                }, margin: { top: 32, right: 8, left: 0, bottom: 0 }, children: [_jsx(XAxis, { dataKey: "label", stroke: "#5f6f95" }), _jsx(Tooltip, { content: _jsx(InactivityTooltip, {}), cursor: { fill: "rgba(41, 86, 215, 0.04)" } }), _jsxs(Bar, { dataKey: "count", radius: [8, 8, 0, 0], cursor: "pointer", children: [_jsx(LabelList, { dataKey: "count", position: "top", offset: 10, formatter: (value) => formatNumber(value), className: "chart-bar-label" }), metrics.inactivityBuckets.map((bucket) => (_jsx(Cell, { fill: bucketColor(bucket.label, selectedBucket === bucket.label) }, bucket.label)))] })] }) }) }), selectedBucket ? (_jsxs("div", { className: "inline-actions", children: [_jsxs("span", { className: "tag", children: ["Filtro ativo: ", selectedBucket] }), _jsx("button", { className: "ghost-button", type: "button", onClick: () => setSelectedBucket(null), children: "Limpar filtro" })] })) : null] })) : (_jsxs(_Fragment, { children: [_jsx(PeriodSelector, { value: selectedPeriod, onChange: setSelectedPeriod }), _jsx("div", { className: "trend-chart-wrap", children: trendData.length ? (_jsx(ResponsiveContainer, { width: "100%", height: 320, children: _jsxs(ComposedChart, { data: trendData, margin: { top: 12, right: 18, left: 10, bottom: 4 }, children: [_jsx("defs", { children: trendSeries.map((series) => (_jsxs("linearGradient", { id: series.gradientId, x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: series.color, stopOpacity: series.fillOpacityStart }), _jsx("stop", { offset: "100%", stopColor: series.color, stopOpacity: series.fillOpacityEnd })] }, series.gradientId))) }), _jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "date", tickFormatter: (value) => formatTrendAxisLabel(String(value)), stroke: "#5f6f95", minTickGap: 24, tickLine: false, axisLine: false }), _jsx(YAxis, { domain: [0, 100], ticks: [0, 25, 50, 75, 100], tickFormatter: (value) => formatTrendPercent(Number(value), 0), stroke: "#5f6f95", tickLine: false, axisLine: false, width: 56 }), _jsx(Tooltip, { content: _jsx(TrendTooltip, {}), cursor: { stroke: "rgba(41, 86, 215, 0.3)", strokeWidth: 1 } }), trendSeries.map((series) => (_jsx(Area, { type: "monotone", dataKey: series.shareKey, stackId: "portfolio-share", stroke: "none", fill: `url(#${series.gradientId})`, dot: false, legendType: "none" }, series.shareKey))), trendSeries.map((series) => (_jsx(Line, { type: "monotone", dataKey: series.shareKey, name: series.label, stroke: series.color, strokeWidth: 2, dot: false, activeDot: { r: 4, fill: series.color, strokeWidth: 0 } }, `${series.shareKey}-line`)))] }) })) : (_jsx("div", { className: "empty-state", children: "Sem historico suficiente para montar a evolucao diaria da base." })) }), _jsx("div", { className: "trend-legend", "aria-label": "Legenda do grafico de evolucao da base", children: trendSeries.map((series) => (_jsxs("span", { className: "trend-legend-item", children: [_jsx("span", { className: "trend-legend-emoji", style: { fontSize: "1.1rem", marginRight: "0.2rem" }, children: series.emoji }), series.label] }, series.shareKey))) })] }))] }), _jsx(SalesPerformancePanel, { salesPerformance: metrics.salesPerformance, isLoading: dashboardQuery.isLoading })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: selectedBucket ? "Clientes filtrados pelo grafico" : "Fila por prioridade" }), _jsx("h3", { children: selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes para o time abordar agora" }), _jsx("p", { className: "panel-subcopy", children: selectedBucket
                                        ? "A selecao do grafico mostra apenas clientes da faixa escolhida."
                                        : "Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras." })] }) }), tableQueryLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes priorizados..." }) : null, tableQueryError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar essa lista de clientes." }) : null, !tableQueryLoading && !tableQueryError ? _jsx(CustomerTable, { customers: tableCustomers }) : null] })] }));
}

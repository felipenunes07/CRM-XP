import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";
import { buildTrendChartData, chartMetricLabel, getAttendantColor, getInitialSelectedAttendants, sortAttendantsForBoard, toggleComparedAttendant, } from "./attendantsPage.helpers";
const metricOptions = ["revenue", "orders", "pieces", "uniqueCustomers"];
const windowOptions = [3, 6, 12, 24];
function formatMonthLabel(value) {
    const matched = value.match(/^(\d{4})-(\d{2})$/);
    if (!matched) {
        return value;
    }
    const [, year = "", month = ""] = matched;
    return `${month}/${year.slice(2)}`;
}
function formatGrowth(value) {
    if (value === null || value === undefined) {
        return "Sem base";
    }
    const percent = value * 100;
    const prefix = percent > 0 ? "+" : "";
    return `${prefix}${percent.toFixed(1).replace(".", ",")}%`;
}
function growthClass(value) {
    if (value === null || value === undefined) {
        return "neutral";
    }
    if (value > 0) {
        return "success";
    }
    if (value < 0) {
        return "danger";
    }
    return "neutral";
}
function formatMetricValue(value, metric) {
    return metric === "revenue" ? formatCurrency(value) : formatNumber(value);
}
function formatDecimal(value, digits = 1) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}
function formatPercent(value) {
    return `${formatDecimal(value * 100, 1)}%`;
}
function safeDivide(numerator, denominator) {
    if (!denominator) {
        return 0;
    }
    return numerator / denominator;
}
function activeShare(totalCustomers, activeCustomers) {
    return safeDivide(activeCustomers, totalCustomers);
}
function reactivationPressure(totalCustomers, attentionCustomers, inactiveCustomers) {
    return safeDivide(attentionCustomers + inactiveCustomers, totalCustomers);
}
function repeatIntensity(orders, uniqueCustomers) {
    return safeDivide(orders, uniqueCustomers);
}
function formatMetricAxis(value, metric) {
    if (metric !== "revenue") {
        return formatNumber(value);
    }
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 1_000_000) {
        return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
    }
    if (absoluteValue >= 1_000) {
        return `R$ ${(value / 1_000).toFixed(0)}k`;
    }
    return formatCurrency(value);
}
function TrendTooltip({ active, payload, label, metric, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip trend-tooltip", children: [_jsx("strong", { children: formatMonthLabel(label) }), _jsx("div", { className: "trend-tooltip-list", children: payload.map((entry) => (_jsxs("div", { className: "trend-tooltip-item", children: [_jsxs("span", { className: "trend-tooltip-label", children: [_jsx("span", { className: "trend-tooltip-dot", style: { backgroundColor: entry.color ?? "#2956d7" } }), entry.name] }), _jsxs("div", { className: "trend-tooltip-metric", children: [_jsx("strong", { children: formatMetricValue(Number(entry.value ?? 0), metric) }), _jsxs("span", { children: [chartMetricLabel(metric), " no mes"] })] })] }, String(entry.dataKey ?? entry.name)))) })] }));
}
function HealthTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: label }), _jsx("div", { className: "trend-tooltip-list", children: payload.map((entry) => (_jsxs("div", { className: "trend-tooltip-item", children: [_jsxs("span", { className: "trend-tooltip-label", children: [_jsx("span", { className: "trend-tooltip-dot", style: { backgroundColor: entry.color ?? "#2956d7" } }), entry.name] }), _jsxs("div", { className: "trend-tooltip-metric", children: [_jsx("strong", { children: formatNumber(Number(entry.value ?? 0)) }), _jsxs("span", { children: [formatPercent(safeDivide(Number(entry.value ?? 0), total)), " da carteira"] })] })] }, entry.name))) })] }));
}
export function AttendantsPage() {
    const { token } = useAuth();
    const [windowMonths, setWindowMonths] = useState(12);
    const [chartMetric, setChartMetric] = useState("uniqueCustomers");
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState("customers");
    const [selectedAttendants, setSelectedAttendants] = useState([]);
    const [focusedAttendant, setFocusedAttendant] = useState("");
    const attendantsQuery = useQuery({
        queryKey: ["attendants", windowMonths],
        queryFn: () => api.attendants(token, windowMonths),
        enabled: Boolean(token),
    });
    const data = attendantsQuery.data;
    const allAttendants = data?.attendants ?? [];
    const portfolioSummary = useMemo(() => allAttendants.reduce((totals, item) => ({
        totalCustomers: totals.totalCustomers + item.portfolio.totalCustomers,
        active: totals.active + item.portfolio.statusCounts.ACTIVE,
        attention: totals.attention + item.portfolio.statusCounts.ATTENTION,
        inactive: totals.inactive + item.portfolio.statusCounts.INACTIVE,
    }), {
        totalCustomers: 0,
        active: 0,
        attention: 0,
        inactive: 0,
    }), [allAttendants]);
    const teamRepeatIntensity = repeatIntensity(data?.summary.currentPeriodOrders ?? 0, data?.summary.currentPeriodCustomers ?? 0);
    const teamPiecesPerOrder = safeDivide(data?.summary.currentPeriodPieces ?? 0, data?.summary.currentPeriodOrders ?? 0);
    useEffect(() => {
        if (!allAttendants.length) {
            if (selectedAttendants.length) {
                setSelectedAttendants([]);
            }
            return;
        }
        setSelectedAttendants((current) => {
            const validSelections = current.filter((item) => allAttendants.some((entry) => entry.attendant === item));
            if (!current.length) {
                return getInitialSelectedAttendants(allAttendants, 3);
            }
            return validSelections;
        });
    }, [allAttendants]);
    useEffect(() => {
        if (!allAttendants.length) {
            if (focusedAttendant) {
                setFocusedAttendant("");
            }
            return;
        }
        const exists = allAttendants.some((item) => item.attendant === focusedAttendant);
        if (!focusedAttendant || !exists) {
            setFocusedAttendant(allAttendants[0]?.attendant ?? "");
        }
    }, [allAttendants, focusedAttendant]);
    const visibleAttendants = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
        return sortAttendantsForBoard(allAttendants.filter((item) => {
            if (!normalizedSearch) {
                return true;
            }
            return item.attendant.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
        }), sortKey);
    }, [allAttendants, search, sortKey]);
    const { data: trendData, series: trendSeries } = useMemo(() => buildTrendChartData(allAttendants, selectedAttendants, chartMetric), [allAttendants, chartMetric, selectedAttendants]);
    const selectedSeriesByAttendant = useMemo(() => new Map(trendSeries.map((series) => [series.attendant, series.color])), [trendSeries]);
    const compareOptions = useMemo(() => allAttendants.map((item) => ({
        attendant: item.attendant,
        color: getAttendantColor(item.attendant),
    })), [allAttendants]);
    const healthChartData = useMemo(() => [...visibleAttendants]
        .sort((left, right) => {
        const activeShareDiff = activeShare(right.portfolio.totalCustomers, right.portfolio.statusCounts.ACTIVE) -
            activeShare(left.portfolio.totalCustomers, left.portfolio.statusCounts.ACTIVE);
        if (activeShareDiff !== 0) {
            return activeShareDiff;
        }
        return right.portfolio.totalCustomers - left.portfolio.totalCustomers;
    })
        .map((item) => ({
        attendant: item.attendant,
        active: item.portfolio.statusCounts.ACTIVE,
        attention: item.portfolio.statusCounts.ATTENTION,
        inactive: item.portfolio.statusCounts.INACTIVE,
        totalCustomers: item.portfolio.totalCustomers,
    })), [visibleAttendants]);
    const focusedItem = allAttendants.find((item) => item.attendant === focusedAttendant) ??
        allAttendants.find((item) => item.attendant === selectedAttendants[0]) ??
        visibleAttendants[0] ??
        null;
    if (attendantsQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando aba de atendentes..." });
    }
    if (attendantsQuery.isError || !data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar o painel de atendentes." });
    }
    return (_jsxs("div", { className: "page-stack attendants-page", children: [_jsxs("section", { className: "hero-panel attendants-hero", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Performance comercial" }), _jsx("h2", { className: "premium-header-title", children: "Atendentes" }), _jsx("p", { children: "Compare faturamento, vendas, pecas e clientes por vendedora, enxergando o corte atual, o historico mensal fechado e a carteira de cada nome." })] }), _jsxs("div", { className: "hero-meta attendants-hero-meta", children: [_jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Janela atual" }), _jsxs("strong", { children: [formatDate(data.summary.currentPeriodStart), " ate ", formatDate(data.summary.currentPeriodEnd)] })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Comparativo" }), _jsxs("strong", { children: [formatDate(data.summary.previousPeriodStart), " ate ", formatDate(data.summary.previousPeriodEnd)] })] }), _jsx("div", { className: "attendants-window-toggle", role: "tablist", "aria-label": "Selecionar janela mensal", children: windowOptions.map((option) => (_jsxs("button", { type: "button", className: `attendants-window-button ${windowMonths === option ? "active" : ""}`, onClick: () => setWindowMonths(option), children: [option, " meses"] }, option))) })] })] }), _jsxs("section", { className: "stats-grid attendants-summary-grid", children: [_jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Time monitorado" }), _jsx("strong", { children: formatNumber(data.summary.totalAttendants) }), _jsxs("span", { children: [formatNumber(data.summary.activeAttendants), " com venda no corte atual"] })] }), _jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Clientes do mes" }), _jsx("strong", { children: formatNumber(data.summary.currentPeriodCustomers) }), _jsxs("span", { children: [formatNumber(data.summary.currentPeriodOrders), " vendas fechadas no corte"] })] }), _jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Recorrencia do time" }), _jsx("strong", { children: formatDecimal(teamRepeatIntensity, 2) }), _jsxs("span", { children: [formatDecimal(teamPiecesPerOrder, 1), " pecas por venda em media"] })] }), _jsxs("article", { className: "stat-card", children: [_jsx("p", { className: "eyebrow", children: "Clientes para reativar" }), _jsx("strong", { children: formatNumber(portfolioSummary.attention + portfolioSummary.inactive) }), _jsxs("span", { children: [formatPercent(reactivationPressure(portfolioSummary.totalCustomers, portfolioSummary.attention, portfolioSummary.inactive)), " ", "da carteira pedindo contato"] })] })] }), _jsxs("section", { className: "grid-two attendants-dashboard-grid", children: [_jsxs("article", { className: "panel chart-panel attendants-trend-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Evolucao mensal" }), _jsx("h3", { children: "Comparativo entre vendedoras" }), _jsxs("p", { className: "panel-subcopy", children: ["Selecione quem entra no comparativo e acompanhe ", chartMetricLabel(chartMetric).toLocaleLowerCase("pt-BR"), " ao longo de", " ", windowMonths, " meses fechados."] })] }) }), _jsxs("div", { className: "attendants-toolbar", children: [_jsxs("div", { className: "attendants-toolbar-main", children: [_jsx("div", { className: "ambassador-chart-toggle", role: "tablist", "aria-label": "Selecionar metrica do grafico", children: metricOptions.map((metric) => (_jsx("button", { type: "button", className: `ambassador-chart-button ${chartMetric === metric ? "active" : ""}`, onClick: () => setChartMetric(metric), children: chartMetricLabel(metric) }, metric))) }), _jsx("div", { className: "attendants-compare-picker", "aria-label": "Selecionar atendentes para comparar", children: compareOptions.map((option) => {
                                                    const isSelected = selectedAttendants.includes(option.attendant);
                                                    const compareDisabled = !isSelected && selectedAttendants.length >= 5;
                                                    return (_jsxs("button", { type: "button", className: `attendants-compare-chip ${isSelected ? "active" : ""}`, onClick: () => setSelectedAttendants((current) => toggleComparedAttendant(current, option.attendant, 5)), disabled: compareDisabled, children: [_jsx("span", { className: "trend-tooltip-dot", style: { backgroundColor: option.color } }), option.attendant] }, option.attendant));
                                                }) })] }), _jsxs("div", { className: "attendants-compare-summary", children: [_jsxs("span", { children: ["Comparando ", selectedAttendants.length, "/5"] }), _jsx("div", { className: "attendants-compare-tags", children: selectedAttendants.map((attendant) => (_jsxs("span", { className: "tag attendants-compare-tag", style: {
                                                        borderColor: `${selectedSeriesByAttendant.get(attendant) ?? getAttendantColor(attendant)}44`,
                                                        color: selectedSeriesByAttendant.get(attendant) ?? getAttendantColor(attendant),
                                                    }, children: [_jsx("span", { className: "trend-tooltip-dot", style: { backgroundColor: selectedSeriesByAttendant.get(attendant) ?? getAttendantColor(attendant) } }), attendant] }, attendant))) })] })] }), _jsx("div", { className: "trend-chart-wrap attendants-trend-wrap", children: trendSeries.length ? (_jsx(ResponsiveContainer, { width: "100%", height: 340, children: _jsxs(LineChart, { data: trendData, margin: { top: 12, right: 18, left: 8, bottom: 4 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "month", tickFormatter: (value) => formatMonthLabel(String(value)), stroke: "#5f6f95", minTickGap: 20 }), _jsx(YAxis, { tickFormatter: (value) => formatMetricAxis(Number(value), chartMetric), stroke: "#5f6f95" }), _jsx(Tooltip, { content: _jsx(TrendTooltip, { metric: chartMetric }) }), trendSeries.map((series) => (_jsx(Line, { type: "monotone", dataKey: series.dataKey, name: series.attendant, stroke: series.color, strokeWidth: 3, dot: false, activeDot: { r: 5 } }, series.dataKey)))] }) })) : (_jsx("div", { className: "empty-state", children: "Selecione pelo menos uma atendente para montar o comparativo." })) }), trendSeries.length ? (_jsx("div", { className: "trend-legend attendants-legend", "aria-label": "Legenda do grafico de comparacao", children: trendSeries.map((series) => (_jsxs("span", { className: "trend-legend-item", children: [_jsx("span", { className: "trend-legend-dot", style: { backgroundColor: series.color } }), series.attendant] }, series.dataKey))) })) : null] }), _jsxs("article", { className: "panel attendants-ranking-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Carteira hoje" }), _jsx("h3", { children: "Distribuicao por status" }), _jsx("p", { className: "panel-subcopy", children: "Troquei o ranking de faturamento por uma leitura mais util: quantos clientes cada atendente tem em ativo, atencao e inativo hoje." })] }) }), _jsx("div", { className: "trend-chart-wrap attendants-ranking-wrap", children: healthChartData.length ? (_jsx(ResponsiveContainer, { width: "100%", height: 340, children: _jsxs(BarChart, { data: healthChartData, layout: "vertical", margin: { top: 8, right: 16, left: 16, bottom: 4 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", horizontal: false }), _jsx(XAxis, { type: "number", stroke: "#5f6f95", tickFormatter: (value) => formatNumber(Number(value)) }), _jsx(YAxis, { type: "category", dataKey: "attendant", width: 92, stroke: "#5f6f95" }), _jsx(Tooltip, { content: _jsx(HealthTooltip, {}), cursor: { fill: "rgba(41, 86, 215, 0.04)" } }), _jsx(Bar, { dataKey: "active", name: "Ativos", stackId: "portfolio", fill: "#2f9d67", radius: [0, 0, 0, 0] }), _jsx(Bar, { dataKey: "attention", name: "Atencao", stackId: "portfolio", fill: "#d09a29", radius: [0, 0, 0, 0] }), _jsx(Bar, { dataKey: "inactive", name: "Inativos", stackId: "portfolio", fill: "#d9534f", radius: [0, 8, 8, 0] })] }) })) : (_jsx("div", { className: "empty-state", children: "Nenhuma atendente encontrada para esse filtro." })) }), _jsxs("div", { className: "trend-legend attendants-health-legend", children: [_jsxs("span", { className: "trend-legend-item", children: [_jsx("span", { className: "trend-legend-dot", style: { backgroundColor: "#2f9d67" } }), "Ativos"] }), _jsxs("span", { className: "trend-legend-item", children: [_jsx("span", { className: "trend-legend-dot", style: { backgroundColor: "#d09a29" } }), "Atencao"] }), _jsxs("span", { className: "trend-legend-item", children: [_jsx("span", { className: "trend-legend-dot", style: { backgroundColor: "#d9534f" } }), "Inativos"] })] })] })] }), _jsxs("section", { className: "grid-two attendants-detail-grid", children: [_jsxs("article", { className: "panel attendants-board-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Leaderboard" }), _jsx("h3", { children: "Quem esta puxando relacionamento e carteira" }), _jsx("p", { className: "panel-subcopy", children: "Busque uma vendedora, ordene a lista e use os botoes para comparar ou abrir o painel detalhado." })] }) }), _jsxs("div", { className: "filters-grid filters-grid-four attendants-filters", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome da atendente" })] }), _jsxs("label", { children: ["Ordenar por", _jsxs("select", { value: sortKey, onChange: (event) => setSortKey(event.target.value), children: [_jsx("option", { value: "customers", children: "Clientes atendidos" }), _jsx("option", { value: "orders", children: "Vendas" }), _jsx("option", { value: "recurrence", children: "Recorrencia" }), _jsx("option", { value: "activeShare", children: "Carteira ativa" }), _jsx("option", { value: "reactivationRisk", children: "Pressao de reativacao" }), _jsx("option", { value: "pieces", children: "Pecas" }), _jsx("option", { value: "portfolio", children: "Carteira total" }), _jsx("option", { value: "growth", children: "Crescimento de clientes" }), _jsx("option", { value: "name", children: "Nome" })] })] })] }), _jsx("div", { className: "attendants-board-list", children: visibleAttendants.length ? (visibleAttendants.map((item, index) => {
                                    const isCompared = selectedAttendants.includes(item.attendant);
                                    const isFocused = focusedItem?.attendant === item.attendant;
                                    const compareDisabled = !isCompared && selectedAttendants.length >= 5;
                                    return (_jsxs("article", { className: `attendants-board-card ${isFocused ? "is-focused" : ""}`, onClick: () => setFocusedAttendant(item.attendant), children: [_jsxs("div", { className: "attendants-board-header", children: [_jsxs("div", { className: "leaderboard-rank", children: ["#", index + 1] }), _jsxs("div", { className: "attendants-board-copy", children: [_jsx("strong", { children: item.attendant }), _jsxs("span", { children: [formatNumber(item.currentPeriod.uniqueCustomers), " clientes - ", formatNumber(item.currentPeriod.orders), " vendas -", " ", formatPercent(activeShare(item.portfolio.totalCustomers, item.portfolio.statusCounts.ACTIVE)), " da carteira ativa"] })] }), _jsxs("div", { className: "attendants-board-growth", children: [_jsx("span", { children: "Crescimento de clientes" }), _jsx("strong", { className: `attendants-growth ${growthClass(item.growth.uniqueCustomers)}`, children: formatGrowth(item.growth.uniqueCustomers) })] })] }), _jsxs("div", { className: "attendants-board-metrics", children: [_jsxs("span", { children: ["Recorrencia: ", formatDecimal(repeatIntensity(item.currentPeriod.orders, item.currentPeriod.uniqueCustomers), 2), " vendas/cliente"] }), _jsxs("span", { children: ["Pecas por venda: ", formatDecimal(item.currentPeriod.piecesPerOrder, 1)] }), _jsxs("span", { children: ["Reativar: ", formatNumber(item.portfolio.statusCounts.ATTENTION + item.portfolio.statusCounts.INACTIVE)] }), _jsxs("span", { children: ["Carteira: ", formatNumber(item.portfolio.totalCustomers)] }), _jsxs("span", { children: ["Ultima venda: ", formatDate(item.currentPeriod.lastOrderAt)] })] }), _jsxs("div", { className: "attendants-board-actions", children: [_jsx("button", { type: "button", className: `ghost-button ${isFocused ? "attendants-focus-button active" : ""}`, onClick: (event) => {
                                                            event.stopPropagation();
                                                            setFocusedAttendant(item.attendant);
                                                        }, children: isFocused ? "No painel" : "Ver painel" }), _jsx("button", { type: "button", className: `ghost-button ${isCompared ? "attendants-focus-button active" : ""}`, onClick: (event) => {
                                                            event.stopPropagation();
                                                            setSelectedAttendants((current) => toggleComparedAttendant(current, item.attendant, 5));
                                                        }, disabled: compareDisabled, children: isCompared ? "Remover do grafico" : compareDisabled ? "Limite de 5" : "Comparar" })] })] }, item.attendant));
                                })) : (_jsx("div", { className: "empty-state", children: "Nenhuma atendente encontrada para esse recorte." })) })] }), _jsxs("article", { className: "panel attendants-focus-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Drill-down" }), _jsx("h3", { children: focusedItem?.attendant ?? "Selecione uma atendente" }), _jsx("p", { className: "panel-subcopy", children: "Resumo do corte atual, carteira sob responsabilidade e os destaques do mes." })] }) }), focusedItem ? (_jsxs("div", { className: "attendants-focus-shell", children: [_jsxs("div", { className: "attendants-focus-grid", children: [_jsxs("div", { className: "attendants-focus-card", children: [_jsx("span", { children: "Clientes do mes" }), _jsx("strong", { children: formatNumber(focusedItem.currentPeriod.uniqueCustomers) }), _jsxs("p", { children: [formatNumber(focusedItem.currentPeriod.orders), " vendas no corte atual"] })] }), _jsxs("div", { className: "attendants-focus-card", children: [_jsx("span", { children: "Recorrencia" }), _jsx("strong", { children: formatDecimal(repeatIntensity(focusedItem.currentPeriod.orders, focusedItem.currentPeriod.uniqueCustomers), 2) }), _jsx("p", { children: "vendas por cliente no mes" })] }), _jsxs("div", { className: "attendants-focus-card", children: [_jsx("span", { children: "Pecas por venda" }), _jsx("strong", { children: formatDecimal(focusedItem.currentPeriod.piecesPerOrder, 1) }), _jsxs("p", { children: [formatNumber(focusedItem.currentPeriod.pieces), " pecas no corte"] })] }), _jsxs("div", { className: "attendants-focus-card", children: [_jsx("span", { children: "Pressao de reativacao" }), _jsx("strong", { children: formatPercent(reactivationPressure(focusedItem.portfolio.totalCustomers, focusedItem.portfolio.statusCounts.ATTENTION, focusedItem.portfolio.statusCounts.INACTIVE)) }), _jsxs("p", { children: [formatNumber(focusedItem.portfolio.statusCounts.ATTENTION + focusedItem.portfolio.statusCounts.INACTIVE), " clientes pedindo contato"] })] })] }), _jsxs("div", { className: "attendants-portfolio-card", children: [_jsxs("div", { children: [_jsx("span", { className: "eyebrow", children: "Carteira atual" }), _jsxs("h4", { children: [formatNumber(focusedItem.portfolio.totalCustomers), " clientes"] })] }), _jsxs("div", { className: "attendants-portfolio-metrics", children: [_jsxs("span", { className: "status-badge status-active", children: [formatNumber(focusedItem.portfolio.statusCounts.ACTIVE), " ativos"] }), _jsxs("span", { className: "status-badge status-attention", children: [formatNumber(focusedItem.portfolio.statusCounts.ATTENTION), " atencao"] }), _jsxs("span", { className: "status-badge status-inactive", children: [formatNumber(focusedItem.portfolio.statusCounts.INACTIVE), " inativos"] })] }), _jsxs("div", { className: "attendants-board-metrics", children: [_jsxs("span", { children: ["Faturamento: ", formatCurrency(focusedItem.currentPeriod.revenue)] }), _jsxs("span", { children: ["Ticket medio: ", formatCurrency(focusedItem.currentPeriod.avgTicket)] }), _jsxs("span", { children: ["Receita por cliente: ", formatCurrency(focusedItem.currentPeriod.revenuePerCustomer)] }), _jsxs("span", { children: ["Ultima venda: ", formatDate(focusedItem.currentPeriod.lastOrderAt)] })] })] }), _jsxs("div", { className: "attendants-focus-section", children: [_jsx("div", { className: "panel-header compact", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Top clientes" }), _jsx("h4", { children: "Quem mais comprou no corte" })] }) }), focusedItem.topCustomers.length ? (_jsx("div", { className: "attendants-customer-list", children: focusedItem.topCustomers.map((customer) => (_jsxs("article", { className: "attendants-customer-card", children: [_jsxs("div", { className: "attendants-customer-main", children: [_jsxs("div", { className: "attendants-customer-copy", children: [_jsx("strong", { children: customer.displayName }), _jsx("span", { children: customer.customerCode || "Sem codigo" })] }), _jsx("span", { className: `status-badge status-${customer.status.toLowerCase()}`, children: statusLabel(customer.status) })] }), _jsxs("div", { className: "attendants-board-metrics", children: [_jsx("span", { children: formatCurrency(customer.revenue) }), _jsxs("span", { children: [formatNumber(customer.orders), " vendas"] }), _jsxs("span", { children: [formatNumber(customer.pieces), " pecas"] }), _jsxs("span", { children: ["Ultima: ", formatDate(customer.lastOrderAt)] })] }), _jsx("div", { className: "attendants-board-actions", children: _jsx(Link, { className: "ghost-button", to: `/clientes/${customer.customerId}`, children: "Abrir cliente" }) })] }, customer.customerId))) })) : (_jsx("div", { className: "empty-state", children: "Sem clientes no corte atual para esta atendente." }))] }), _jsxs("div", { className: "attendants-focus-section", children: [_jsx("div", { className: "panel-header compact", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Top produtos" }), _jsx("h4", { children: "Mix vendido no corte" })] }) }), focusedItem.topProducts.length ? (_jsx("div", { className: "ambassador-top-products", children: focusedItem.topProducts.map((product) => (_jsxs("article", { className: "ambassador-top-product", children: [_jsx("strong", { children: product.itemDescription }), _jsx("span", { children: product.sku ? `SKU ${product.sku}` : "SKU nao informado" }), _jsxs("span", { children: [formatNumber(product.totalQuantity), " pecas - ", formatNumber(product.orderCount), " vendas"] }), _jsxs("span", { children: ["Ultima venda: ", formatDate(product.lastBoughtAt)] })] }, `${focusedItem.attendant}-${product.sku ?? product.itemDescription}`))) })) : (_jsx("div", { className: "empty-state", children: "Sem produtos registrados no corte atual para esta atendente." }))] })] })) : (_jsx("div", { className: "empty-state", children: "Selecione uma atendente no leaderboard para abrir o drill-down." }))] })] })] }));
}

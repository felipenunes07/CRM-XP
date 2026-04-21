import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Boxes, CalendarClock, CheckCircle2, CircleDashed, Package, RefreshCcw, ShoppingCart, Tags, TrendingDown, TrendingUp, Warehouse, } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDateTime, formatDaysSince, formatNumber, formatShortDate } from "../lib/format";
const viewTabs = [
    {
        value: "overview",
        label: "Resumo",
        helper: "Visao rapida para a chefe bater o olho e entender o que fazer primeiro.",
        title: "Resumo do estoque",
    },
    {
        value: "buying",
        label: "Compras",
        helper: "Veja o que precisa comprar agora, o que so precisa acompanhar e o que nao vale repor.",
        title: "Leitura para compras",
    },
    {
        value: "restock",
        label: "Reposicao",
        helper: "Acompanhe o que chegou, se voltou a vender e o que ainda precisa de nova reposicao.",
        title: "Acompanhamento de reposicao",
    },
    {
        value: "stale",
        label: "Estoque parado",
        helper: "Encontre o que esta ocupando espaco ha muito tempo e precisa de acao comercial.",
        title: "Produtos parados",
    },
    {
        value: "models",
        label: "Modelos",
        helper: "Abra cada modelo com calma e acompanhe estoque, vendas, reposicoes e clientes.",
        title: "Analise por modelo",
    },
];
function formatCoverage(value) {
    if (value === null || value === undefined) {
        return "Sem base";
    }
    return `${formatNumber(value)} dias`;
}
function formatCompactNumber(value) {
    if (Math.abs(value) >= 1000) {
        return `${new Intl.NumberFormat("pt-BR", {
            maximumFractionDigits: 1,
            minimumFractionDigits: 0,
            notation: "compact",
        }).format(value)}`;
    }
    return formatNumber(value);
}
function toDateOnly(value) {
    if (!value) {
        return null;
    }
    const matched = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return matched ? matched[1] ?? null : null;
}
function daysBetween(date, referenceDate) {
    const target = toDateOnly(date);
    const reference = toDateOnly(referenceDate);
    if (!target || !reference) {
        return null;
    }
    const targetMs = Date.parse(`${target}T00:00:00.000Z`);
    const referenceMs = Date.parse(`${reference}T00:00:00.000Z`);
    if (Number.isNaN(targetMs) || Number.isNaN(referenceMs)) {
        return null;
    }
    return Math.floor((referenceMs - targetMs) / (1000 * 60 * 60 * 24));
}
function buyRecommendationLabel(value) {
    if (value === "BUY_NOW") {
        return "Comprar agora";
    }
    if (value === "WATCH") {
        return "Acompanhar";
    }
    return "Nao comprar";
}
function buyRecommendationTone(value) {
    if (value === "BUY_NOW") {
        return "danger";
    }
    if (value === "WATCH") {
        return "warning";
    }
    return "neutral";
}
function restockStatusLabel(value) {
    if (value === "ARRIVED_TODAY") {
        return "Chegou hoje";
    }
    if (value === "BACK_TO_SELLING") {
        return "Deu resultado";
    }
    if (value === "RESTOCK_AGAIN") {
        return "Repor de novo";
    }
    return "Ainda nao reagiu";
}
function restockStatusTone(value) {
    if (value === "ARRIVED_TODAY" || value === "BACK_TO_SELLING") {
        return "success";
    }
    if (value === "RESTOCK_AGAIN") {
        return "danger";
    }
    return "warning";
}
function staleActionLabel(value) {
    if (value === "COMMERCIAL_PUSH") {
        return "Dar foco comercial";
    }
    if (value === "PROMOTION") {
        return "Fazer promocao";
    }
    if (value === "LIQUIDATE_REVIEW") {
        return "Liquidar ou rever compra";
    }
    return "Acompanhar";
}
function staleActionTone(value) {
    if (value === "LIQUIDATE_REVIEW") {
        return "danger";
    }
    if (value === "PROMOTION") {
        return "warning";
    }
    return "neutral";
}
function productKindLabel(value) {
    return value === "DOC_DE_CARGA" ? "DOC de Carga" : "Tela";
}
function productKindTone(value) {
    return value === "DOC_DE_CARGA" ? "warning" : "success";
}
function matchesBuyingFilter(item, filter) {
    if (filter === "buy_now") {
        return item.buyRecommendation === "BUY_NOW";
    }
    if (filter === "ending_soon") {
        return item.stockUnits > 0 && item.coverageDays !== null && item.coverageDays <= 15;
    }
    if (filter === "watch") {
        return item.buyRecommendation === "WATCH";
    }
    if (filter === "do_not_buy") {
        return item.buyRecommendation === "DO_NOT_BUY";
    }
    if (filter === "hold_sales") {
        return item.holdSales;
    }
    return true;
}
function matchesRestockWindow(item, latestSeriesDate, window) {
    if (window === "all") {
        return true;
    }
    if (window === "today") {
        return toDateOnly(item.lastRestockAt) === toDateOnly(latestSeriesDate);
    }
    const gap = daysBetween(item.lastRestockAt, latestSeriesDate);
    if (gap === null) {
        return false;
    }
    if (window === "7d") {
        return gap <= 7;
    }
    return gap <= 30;
}
function matchesStaleFilter(item, filter) {
    if (item.daysSinceLastSale === null) {
        return filter === 120;
    }
    return item.daysSinceLastSale >= filter;
}
function formatSeriesValue(dataKey, value) {
    if (dataKey.includes("Units") || dataKey.includes("Stock")) {
        return `${formatNumber(value)} pecas`;
    }
    if (dataKey.includes("Count")) {
        return `${formatNumber(value)} modelos`;
    }
    return formatNumber(value);
}
function hasOverviewSnapshotPoint(point) {
    return point.totalStockUnits > 0 || point.activeModelCount > 0;
}
function InventoryChartEmptyState({ title, description, }) {
    return (_jsxs("div", { className: "inventory-chart-empty", children: [_jsx("strong", { children: title }), _jsx("p", { children: description })] }));
}
function InventoryFocusCard({ card, onClick, }) {
    return (_jsxs("button", { type: "button", className: `stat-card inventory-focus-card tone-${card.tone}`, onClick: () => onClick(card), children: [_jsxs("div", { className: "stat-card-header", children: [_jsx("p", { className: "stat-card-title", children: card.title }), _jsxs("div", { className: `stat-card-icon tone-${card.tone}`, children: [card.key === "BUY_URGENT" ? _jsx(ShoppingCart, { size: 18 }) : null, card.key === "ENDING_SOON" ? _jsx(TrendingDown, { size: 18 }) : null, card.key === "RESTOCKED_TODAY" ? _jsx(Package, { size: 18 }) : null, card.key === "STALE_90" ? _jsx(CalendarClock, { size: 18 }) : null, card.key === "HOLD_SALES" ? _jsx(AlertTriangle, { size: 18 }) : null] })] }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: formatCompactNumber(card.count) }), _jsxs("div", { className: "stat-card-footer", children: [_jsx("span", { className: `stat-card-badge tone-${card.tone}`, children: "Abrir lista" }), _jsx("span", { className: "stat-card-helper", children: card.helper })] })] })] }));
}
function InventoryTrendChart({ series }) {
    const stockSeries = series.filter(hasOverviewSnapshotPoint).slice(-60);
    const salesSeries = series.filter((point) => point.salesUnits > 0 || point.restockUnits > 0).slice(-60);
    const firstSnapshotDate = stockSeries[0]?.date ?? null;
    return (_jsxs("div", { className: "inventory-overview-chart-grid", children: [_jsxs("article", { className: "inventory-overview-chart-card", children: [_jsxs("div", { className: "inventory-overview-chart-header", children: [_jsxs("div", { children: [_jsx("span", { children: "Grafico 1" }), _jsx("h4", { children: "Pecas em estoque" })] }), _jsx("p", { children: "Mostra so a quantidade total da planilha em cada leitura do dia." })] }), stockSeries.length >= 2 ? (_jsx("div", { className: "trend-chart-wrap inventory-trend-chart", children: _jsx(ResponsiveContainer, { width: "100%", height: 250, children: _jsxs(ComposedChart, { data: stockSeries, children: [_jsx(CartesianGrid, { vertical: false, strokeDasharray: "3 3", stroke: "rgba(41, 86, 215, 0.12)" }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fontSize: 12 } }), _jsx(YAxis, { tickFormatter: (value) => formatCompactNumber(Number(value)), tick: { fontSize: 12 } }), _jsx(Tooltip, { labelFormatter: (value) => formatDate(String(value)), formatter: (value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)] }), _jsx(Area, { type: "monotone", dataKey: "totalStockUnits", name: "Pecas em estoque", stroke: "#2956d7", fill: "rgba(95, 140, 255, 0.18)", strokeWidth: 2.4 })] }) }) })) : (_jsx(InventoryChartEmptyState, { title: "Ainda nao da para ver a curva do estoque", description: firstSnapshotDate
                            ? `O historico do estoque comecou em ${formatDate(firstSnapshotDate)}. Quando entrar mais um dia de leitura, esse grafico vai ficar claro.`
                            : "Assim que a planilha diaria for sendo lida em mais dias, a curva do estoque aparece aqui." }))] }), _jsxs("article", { className: "inventory-overview-chart-card", children: [_jsxs("div", { className: "inventory-overview-chart-header", children: [_jsxs("div", { children: [_jsx("span", { children: "Grafico 2" }), _jsx("h4", { children: "Modelos ativos" })] }), _jsx("p", { children: "Mostra quantos modelos diferentes estavam com saldo na leitura de cada dia." })] }), stockSeries.length >= 2 ? (_jsx("div", { className: "trend-chart-wrap inventory-trend-chart", children: _jsx(ResponsiveContainer, { width: "100%", height: 250, children: _jsxs(ComposedChart, { data: stockSeries, children: [_jsx(CartesianGrid, { vertical: false, strokeDasharray: "3 3", stroke: "rgba(41, 86, 215, 0.12)" }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fontSize: 12 } }), _jsx(YAxis, { tickFormatter: (value) => formatCompactNumber(Number(value)), tick: { fontSize: 12 } }), _jsx(Tooltip, { labelFormatter: (value) => formatDate(String(value)), formatter: (value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)] }), _jsx(Line, { type: "monotone", dataKey: "activeModelCount", name: "Modelos ativos", stroke: "#173260", strokeWidth: 2.5, dot: { r: 3 } })] }) }) })) : (_jsx(InventoryChartEmptyState, { title: "Ainda nao da para ver a curva do mix", description: "Esse grafico depende de mais de uma leitura diaria da planilha para mostrar se a variedade aumentou ou caiu." }))] }), _jsxs("article", { className: "inventory-overview-chart-card inventory-overview-chart-card-wide", children: [_jsxs("div", { className: "inventory-overview-chart-header", children: [_jsxs("div", { children: [_jsx("span", { children: "Grafico 3" }), _jsx("h4", { children: "Vendas por dia" })] }), _jsx("p", { children: "Mostra so as vendas do CRM. A reposicao aparece separada em verde quando existir." })] }), salesSeries.length ? (_jsx("div", { className: "trend-chart-wrap inventory-trend-chart", children: _jsx(ResponsiveContainer, { width: "100%", height: 280, children: _jsxs(ComposedChart, { data: salesSeries, children: [_jsx(CartesianGrid, { vertical: false, strokeDasharray: "3 3", stroke: "rgba(41, 86, 215, 0.12)" }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fontSize: 12 } }), _jsx(YAxis, { yAxisId: "sales", tickFormatter: (value) => formatCompactNumber(Number(value)), tick: { fontSize: 12 } }), _jsx(YAxis, { yAxisId: "restock", orientation: "right", tickFormatter: (value) => formatCompactNumber(Number(value)), tick: { fontSize: 12 } }), _jsx(Tooltip, { labelFormatter: (value) => formatDate(String(value)), formatter: (value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)] }), _jsx(Bar, { yAxisId: "sales", dataKey: "salesUnits", name: "Pecas vendidas", fill: "#d09a29", radius: [8, 8, 0, 0], maxBarSize: 20 }), _jsx(Line, { yAxisId: "restock", type: "monotone", dataKey: "restockUnits", name: "Reposicao", stroke: "#2f9d67", strokeWidth: 2.2, dot: { r: 3 }, connectNulls: false })] }) }) })) : (_jsx(InventoryChartEmptyState, { title: "Ainda nao apareceram vendas nesse periodo", description: "Assim que o CRM tiver vendas registradas no recorte atual, elas vao aparecer aqui separadas do estoque." })), _jsxs("div", { className: "inventory-chart-legend", children: [_jsxs("span", { children: [_jsx("i", { className: "tone-sales" }), " Pecas vendidas"] }), _jsxs("span", { children: [_jsx("i", { className: "tone-restock" }), " Reposicao"] })] })] })] }));
}
function InventoryModelChart({ series }) {
    return (_jsx("div", { className: "trend-chart-wrap inventory-model-chart", children: _jsx(ResponsiveContainer, { width: "100%", height: 320, children: _jsxs(ComposedChart, { data: series, children: [_jsx(CartesianGrid, { vertical: false, strokeDasharray: "3 3", stroke: "rgba(41, 86, 215, 0.12)" }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fontSize: 12 } }), _jsx(YAxis, { yAxisId: "stock", tickFormatter: (value) => formatCompactNumber(Number(value)), tick: { fontSize: 12 } }), _jsx(YAxis, { yAxisId: "activity", orientation: "right", tickFormatter: (value) => formatCompactNumber(Number(value)), tick: { fontSize: 12 } }), _jsx(Tooltip, { labelFormatter: (value) => formatDate(String(value)), formatter: (value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)] }), _jsx(Line, { yAxisId: "stock", type: "monotone", dataKey: "stockUnits", name: "Estoque", stroke: "#2956d7", strokeWidth: 2.4, dot: false }), _jsx(Bar, { yAxisId: "activity", dataKey: "salesUnits", name: "Vendas", fill: "#d09a29", radius: [8, 8, 0, 0], maxBarSize: 16 }), _jsx(Line, { yAxisId: "activity", type: "monotone", dataKey: "activeSkuCount", name: "SKUs ativos", stroke: "#173260", strokeWidth: 2.3, dot: false }), _jsx(Bar, { yAxisId: "activity", dataKey: "restockUnits", name: "Reposicao", fill: "#2f9d67", radius: [8, 8, 0, 0], maxBarSize: 10 })] }) }) }));
}
function ModelDetailPanel({ detail, isLoading, }) {
    if (isLoading) {
        return _jsx("section", { className: "panel inventory-detail-panel", children: "Carregando analise do modelo..." });
    }
    if (!detail?.model) {
        return (_jsx("section", { className: "panel inventory-detail-panel inventory-detail-empty", children: _jsx("div", { className: "empty-state", children: "Escolha um modelo da lista para abrir a analise completa." }) }));
    }
    const model = detail.model;
    return (_jsxs("section", { className: "panel inventory-detail-panel", children: [_jsxs("div", { className: "inventory-detail-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Detalhe do modelo" }), _jsx("h3", { children: model.modelLabel }), _jsxs("p", { className: "panel-subcopy", children: [buyRecommendationLabel(model.buyRecommendation), " \u00B7 ", model.sampleSkus.slice(0, 3).join(", ")] })] }), _jsxs("div", { className: "inventory-note-pills", children: [_jsx("span", { className: `inventory-status-pill tone-${productKindTone(model.productKind)}`, children: productKindLabel(model.productKind) }), _jsx("span", { className: `inventory-status-pill tone-${buyRecommendationTone(model.buyRecommendation)}`, children: buyRecommendationLabel(model.buyRecommendation) })] })] }), _jsxs("div", { className: "inventory-mini-stats", children: [_jsxs("article", { className: "inventory-mini-stat", children: [_jsx("span", { children: "Pecas em estoque" }), _jsx("strong", { children: formatNumber(model.stockUnits) })] }), _jsxs("article", { className: "inventory-mini-stat", children: [_jsx("span", { children: "SKUs ativos" }), _jsx("strong", { children: formatNumber(model.activeSkuCount) })] }), _jsxs("article", { className: "inventory-mini-stat", children: [_jsx("span", { children: "Venda 30 dias" }), _jsx("strong", { children: formatNumber(model.sales30) })] }), _jsxs("article", { className: "inventory-mini-stat", children: [_jsx("span", { children: "Cobertura" }), _jsx("strong", { children: formatCoverage(model.coverageDays) })] })] }), _jsx(InventoryModelChart, { series: detail.dailySeries }), _jsx("div", { className: "inventory-detail-story", children: detail.highlights.map((line) => (_jsxs("div", { className: "inventory-story-card", children: [_jsx(CircleDashed, { size: 16 }), _jsx("span", { children: line })] }, line))) }), _jsxs("div", { className: "inventory-benchmark-grid", children: [_jsxs("article", { className: "inventory-benchmark-card", children: [_jsx("span", { children: "Estoque baixo" }), _jsx("strong", { children: detail.benchmarks.lowStockAvgSales === null ? "Sem base" : `${detail.benchmarks.lowStockAvgSales} pecas/dia` })] }), _jsxs("article", { className: "inventory-benchmark-card", children: [_jsx("span", { children: "Estoque alto" }), _jsx("strong", { children: detail.benchmarks.highStockAvgSales === null ? "Sem base" : `${detail.benchmarks.highStockAvgSales} pecas/dia` })] }), _jsxs("article", { className: "inventory-benchmark-card", children: [_jsx("span", { children: "Mix curto" }), _jsx("strong", { children: detail.benchmarks.shortMixAvgSales === null ? "Sem base" : `${detail.benchmarks.shortMixAvgSales} pecas/dia` })] }), _jsxs("article", { className: "inventory-benchmark-card", children: [_jsx("span", { children: "Mix amplo" }), _jsx("strong", { children: detail.benchmarks.wideMixAvgSales === null ? "Sem base" : `${detail.benchmarks.wideMixAvgSales} pecas/dia` })] })] }), _jsxs("div", { className: "inventory-detail-grid", children: [_jsxs("section", { className: "inventory-detail-column", children: [_jsxs("div", { className: "inventory-section-heading", children: [_jsx("h4", { children: "Clientes que mais compram" }), _jsx("span", { children: formatNumber(detail.topCustomers.length) })] }), detail.topCustomers.length ? (_jsx("div", { className: "inventory-detail-list", children: detail.topCustomers.map((customer) => (_jsxs("article", { className: "inventory-detail-list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: customer.customerDisplayName }), _jsxs("span", { children: [customer.customerCode, " \u00B7 ", formatNumber(customer.totalQuantity), " pecas \u00B7 ", formatDaysSince(daysBetween(customer.lastPurchaseAt, toDateOnly(new Date().toISOString())))] })] }), _jsx(Link, { className: "ghost-button small-button", to: `/clientes/${customer.customerId}`, children: "Ver cliente" })] }, customer.customerId))) })) : (_jsx("div", { className: "empty-state", children: "Sem clientes com historico deste modelo." }))] }), _jsxs("section", { className: "inventory-detail-column", children: [_jsxs("div", { className: "inventory-section-heading", children: [_jsx("h4", { children: "Depositos e saldo" }), _jsx("span", { children: formatNumber(detail.deposits.length) })] }), detail.deposits.length ? (_jsx("div", { className: "inventory-detail-list", children: detail.deposits.map((deposit) => (_jsxs("article", { className: "inventory-detail-list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: deposit.name }), _jsxs("span", { children: [deposit.companyName ?? "Sem empresa", " "] })] }), _jsxs("div", { className: "inventory-row-numbers", children: [_jsx("strong", { children: formatNumber(deposit.balance) }), _jsxs("span", { children: ["Reservado ", formatNumber(deposit.reservedBalance)] })] })] }, `${deposit.name}-${deposit.companyName ?? ""}`))) })) : (_jsx("div", { className: "empty-state", children: "Sem leitura de deposito no cache agora." }))] }), _jsxs("section", { className: "inventory-detail-column", children: [_jsxs("div", { className: "inventory-section-heading", children: [_jsx("h4", { children: "SKUs do modelo" }), _jsx("span", { children: formatNumber(detail.skus.length) })] }), _jsx("div", { className: "inventory-detail-list", children: detail.skus.map((sku) => (_jsxs("article", { className: "inventory-detail-list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: sku.sku }), _jsxs("span", { children: [sku.quality ?? "Sem qualidade", " \u00B7 ", sku.color ?? "Sem cor"] })] }), _jsxs("div", { className: "inventory-row-numbers", children: [_jsx("strong", { children: formatNumber(sku.stockCurrent) }), _jsxs("span", { children: ["Venda 90d ", formatNumber(sku.sales90)] })] })] }, sku.sku))) })] })] })] }));
}
export function InventoryPage() {
    const { token, user } = useAuth();
    const queryClient = useQueryClient();
    const [activeView, setActiveView] = useState("overview");
    const [buyingFilter, setBuyingFilter] = useState("all");
    const [restockWindow, setRestockWindow] = useState("all");
    const [staleFilter, setStaleFilter] = useState(90);
    const [selectedModelKey, setSelectedModelKey] = useState(null);
    const [modelSearch, setModelSearch] = useState("");
    const [brandFilter, setBrandFilter] = useState("");
    const [familyFilter, setFamilyFilter] = useState("");
    const [qualityFilter, setQualityFilter] = useState("");
    const deferredSearch = useDeferredValue(modelSearch.trim().toLowerCase());
    const activeTab = viewTabs.find((tab) => tab.value === activeView) ?? viewTabs[0];
    const canRefresh = user?.role === "ADMIN" || user?.role === "MANAGER";
    const snapshotQuery = useQuery({
        queryKey: ["inventory-snapshot"],
        queryFn: () => api.inventorySnapshot(token),
        enabled: Boolean(token),
    });
    const overviewQuery = useQuery({
        queryKey: ["inventory-overview"],
        queryFn: () => api.inventoryOverview(token),
        enabled: Boolean(token),
    });
    const buyingQuery = useQuery({
        queryKey: ["inventory-buying"],
        queryFn: () => api.inventoryBuying(token),
        enabled: Boolean(token && activeView === "buying"),
    });
    const restockQuery = useQuery({
        queryKey: ["inventory-restock"],
        queryFn: () => api.inventoryRestock(token),
        enabled: Boolean(token && activeView === "restock"),
    });
    const staleQuery = useQuery({
        queryKey: ["inventory-stale"],
        queryFn: () => api.inventoryStale(token),
        enabled: Boolean(token && activeView === "stale"),
    });
    const modelsQuery = useQuery({
        queryKey: ["inventory-models"],
        queryFn: () => api.inventoryModels(token),
        enabled: Boolean(token && activeView === "models"),
    });
    const detailQuery = useQuery({
        queryKey: ["inventory-model-detail", selectedModelKey],
        queryFn: () => api.inventoryModelDetail(token, selectedModelKey),
        enabled: Boolean(token && activeView === "models" && selectedModelKey),
    });
    const refreshMutation = useMutation({
        mutationFn: () => api.refreshInventorySnapshot(token),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["inventory-snapshot"] }),
                queryClient.invalidateQueries({ queryKey: ["inventory-overview"] }),
                queryClient.invalidateQueries({ queryKey: ["inventory-buying"] }),
                queryClient.invalidateQueries({ queryKey: ["inventory-restock"] }),
                queryClient.invalidateQueries({ queryKey: ["inventory-stale"] }),
                queryClient.invalidateQueries({ queryKey: ["inventory-models"] }),
                queryClient.invalidateQueries({ queryKey: ["inventory-model-detail"] }),
            ]);
        },
    });
    const snapshotMeta = overviewQuery.data?.snapshot ?? snapshotQuery.data;
    const latestSeriesDate = overviewQuery.data?.dailySeries.at(-1)?.date ?? toDateOnly(snapshotMeta?.importedAt ?? null);
    const visibleBuyingItems = useMemo(() => (buyingQuery.data?.items ?? []).filter((item) => matchesBuyingFilter(item, buyingFilter)), [buyingFilter, buyingQuery.data?.items]);
    const visibleRestockItems = useMemo(() => (restockQuery.data?.items ?? []).filter((item) => matchesRestockWindow(item, latestSeriesDate, restockWindow)), [latestSeriesDate, restockQuery.data?.items, restockWindow]);
    const visibleStaleItems = useMemo(() => (staleQuery.data?.items ?? []).filter((item) => matchesStaleFilter(item, staleFilter)), [staleFilter, staleQuery.data?.items]);
    const visibleModels = useMemo(() => {
        return (modelsQuery.data?.items ?? []).filter((item) => {
            if (deferredSearch) {
                const haystack = [item.modelLabel, item.brand, item.family, item.sampleSkus.join(" "), item.qualityLabels.join(" ")]
                    .join(" ")
                    .toLowerCase();
                if (!haystack.includes(deferredSearch)) {
                    return false;
                }
            }
            if (brandFilter && item.brand !== brandFilter) {
                return false;
            }
            if (familyFilter && item.family !== familyFilter) {
                return false;
            }
            if (qualityFilter && !item.qualityLabels.includes(qualityFilter)) {
                return false;
            }
            return true;
        });
    }, [brandFilter, deferredSearch, familyFilter, modelsQuery.data?.items, qualityFilter]);
    function openModel(modelKey) {
        setSelectedModelKey(modelKey);
        setActiveView("models");
    }
    function handleOverviewCardClick(card) {
        if (card.targetTab === "buying") {
            setActiveView("buying");
            setBuyingFilter(card.targetFilter ?? "all");
            return;
        }
        if (card.targetTab === "restock") {
            setActiveView("restock");
            setRestockWindow(card.targetFilter === "arrived_today" ? "today" : "30d");
            return;
        }
        setActiveView("stale");
        setStaleFilter(card.targetFilter === "90_plus" ? 90 : 30);
    }
    return (_jsxs("div", { className: "page-stack inventory-workspace", children: [_jsxs("section", { className: "panel inventory-shell", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Estoque" }), _jsx("h2", { className: "premium-header-title", children: activeTab.title }), _jsx("p", { className: "panel-subcopy", children: activeTab.helper })] }), _jsx("div", { className: "inventory-shell-actions", children: canRefresh ? (_jsxs("button", { type: "button", className: "ghost-button", onClick: () => refreshMutation.mutate(), disabled: refreshMutation.isPending, children: [_jsx(RefreshCcw, { size: 16 }), refreshMutation.isPending ? "Atualizando..." : "Atualizar planilha"] })) : null })] }), _jsx("div", { className: "chart-switcher customers-view-switcher inventory-view-switcher", role: "tablist", "aria-label": "Abas de estoque", children: viewTabs.map((tab) => (_jsx("button", { type: "button", role: "tab", "aria-selected": activeView === tab.value, "aria-pressed": activeView === tab.value, className: `chart-switch-button ${activeView === tab.value ? "active" : ""}`, onClick: () => setActiveView(tab.value), children: _jsx("strong", { children: tab.label }) }, tab.value))) }), _jsxs("div", { className: "inventory-shell-meta", children: [_jsxs("span", { className: "inventory-shell-badge", children: [_jsx(Warehouse, { size: 14 }), snapshotMeta ? `Ultima leitura: ${formatDateTime(snapshotMeta.importedAt)}` : "Sem leitura da planilha ainda"] }), snapshotMeta ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: "inventory-shell-badge", children: [_jsx(Boxes, { size: 14 }), formatNumber(snapshotMeta.inStockRows), " SKUs com saldo"] }), _jsxs("span", { className: "inventory-shell-badge", children: [_jsx(Tags, { size: 14 }), formatNumber(snapshotMeta.totalRows), " linhas na planilha"] })] })) : null] })] }), activeView === "overview" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "inventory-focus-grid", children: (overviewQuery.data?.cards ?? []).map((card) => (_jsx(InventoryFocusCard, { card: card, onClick: handleOverviewCardClick }, card.key))) }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "inventory-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Leitura visual" }), _jsx("h3", { children: "Cada grafico mostra uma coisa" }), _jsx("p", { className: "panel-subcopy", children: "Separei estoque, variedade e vendas para a leitura ficar mais clara." })] }), _jsxs("div", { className: "inventory-row-numbers", children: [_jsx("strong", { children: formatNumber(overviewQuery.data?.totals.totalStockUnits ?? 0) }), _jsx("span", { children: "Pecas em estoque agora" })] })] }), _jsx(InventoryTrendChart, { series: overviewQuery.data?.dailySeries ?? [] }), _jsx("div", { className: "inventory-story-grid", children: (overviewQuery.data?.highlights ?? []).map((line) => (_jsxs("article", { className: "inventory-story-card", children: [_jsx(TrendingUp, { size: 16 }), _jsx("span", { children: line })] }, line))) })] }), _jsxs("section", { className: "inventory-summary-grid", children: [_jsxs("article", { className: "panel inventory-summary-panel", children: [_jsx("div", { className: "inventory-section-heading", children: _jsx("h3", { children: "Leitura do dia" }) }), _jsxs("div", { className: "inventory-summary-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Modelos ativos" }), _jsx("strong", { children: formatNumber(overviewQuery.data?.totals.activeModelCount ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "SKUs ativos" }), _jsx("strong", { children: formatNumber(overviewQuery.data?.totals.activeSkuCount ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Venda 30 dias" }), _jsx("strong", { children: formatNumber(overviewQuery.data?.totals.sales30 ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Capital parado" }), _jsx("strong", { children: formatCurrency(overviewQuery.data?.totals.trappedValue ?? 0) })] })] })] }), _jsxs("article", { className: "panel inventory-summary-panel", children: [_jsx("div", { className: "inventory-section-heading", children: _jsx("h3", { children: "Proximo passo" }) }), _jsxs("div", { className: "inventory-next-actions", children: [_jsxs("button", { type: "button", className: "ghost-button", onClick: () => setActiveView("buying"), children: ["Ver compras ", _jsx(ArrowRight, { size: 14 })] }), _jsxs("button", { type: "button", className: "ghost-button", onClick: () => setActiveView("restock"), children: ["Ver reposicao ", _jsx(ArrowRight, { size: 14 })] }), _jsxs("button", { type: "button", className: "ghost-button", onClick: () => setActiveView("stale"), children: ["Ver estoque parado ", _jsx(ArrowRight, { size: 14 })] })] })] })] })] })) : null, activeView === "buying" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "panel inventory-inline-toolbar", children: _jsx("div", { className: "inventory-chip-row", children: [
                                { value: "all", label: "Todos" },
                                { value: "buy_now", label: "Comprar agora" },
                                { value: "ending_soon", label: "Vai acabar" },
                                { value: "watch", label: "Acompanhar" },
                                { value: "do_not_buy", label: "Nao comprar" },
                                { value: "hold_sales", label: "Segurar venda" },
                            ].map((chip) => (_jsx("button", { type: "button", className: `inventory-filter-chip ${buyingFilter === chip.value ? "active" : ""}`, onClick: () => setBuyingFilter(chip.value), children: chip.label }, chip.value))) }) }), _jsxs("section", { className: "inventory-card-list", children: [visibleBuyingItems.map((item) => (_jsxs("article", { className: "panel inventory-line-card", children: [_jsxs("div", { className: "inventory-line-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Modelo" }), _jsx("h3", { children: item.modelLabel }), _jsx("p", { className: "panel-subcopy", children: item.sampleSkus.slice(0, 3).join(", ") })] }), _jsxs("div", { className: "inventory-note-pills", children: [_jsx("span", { className: `inventory-status-pill tone-${productKindTone(item.productKind)}`, children: productKindLabel(item.productKind) }), _jsx("span", { className: `inventory-status-pill tone-${buyRecommendationTone(item.buyRecommendation)}`, children: buyRecommendationLabel(item.buyRecommendation) })] })] }), _jsxs("div", { className: "inventory-line-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Pecas" }), _jsx("strong", { children: formatNumber(item.stockUnits) })] }), _jsxs("div", { children: [_jsx("span", { children: "SKUs ativos" }), _jsx("strong", { children: formatNumber(item.activeSkuCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Venda 30/90" }), _jsxs("strong", { children: [formatNumber(item.sales30), " / ", formatNumber(item.sales90)] })] }), _jsxs("div", { children: [_jsx("span", { children: "Cobertura" }), _jsx("strong", { children: formatCoverage(item.coverageDays) })] }), _jsxs("div", { children: [_jsx("span", { children: "Ultima venda" }), _jsx("strong", { children: formatDate(item.lastSaleAt) })] }), _jsxs("div", { children: [_jsx("span", { children: "Ultima reposicao" }), _jsx("strong", { children: formatDate(item.lastRestockAt) })] })] }), _jsxs("div", { className: "inventory-line-footer", children: [_jsxs("div", { className: "inventory-note-pills", children: [item.holdSales ? _jsx("span", { className: "inventory-note-pill tone-danger", children: "Segurar venda" }) : null, item.trappedValueEstimated ? _jsx("span", { className: "inventory-note-pill tone-warning", children: "Valor estimado" }) : null, _jsxs("span", { className: "inventory-note-pill tone-neutral", children: ["Valor em estoque ", formatCurrency(item.trappedValue)] })] }), _jsx("button", { type: "button", className: "primary-button small-button", onClick: () => openModel(item.modelKey), children: "Abrir analise" })] })] }, item.modelKey))), !visibleBuyingItems.length ? _jsx("div", { className: "empty-state", children: "Nenhum modelo entrou nesse filtro agora." }) : null] })] })) : null, activeView === "restock" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "inventory-summary-grid", children: [_jsxs("button", { type: "button", className: "panel inventory-summary-panel inventory-summary-clickable", onClick: () => setRestockWindow("today"), children: [_jsx("span", { children: "Chegou hoje" }), _jsx("strong", { children: formatNumber(restockQuery.data?.counts.arrivedToday ?? 0) })] }), _jsxs("button", { type: "button", className: "panel inventory-summary-panel inventory-summary-clickable", onClick: () => setRestockWindow("7d"), children: [_jsx("span", { children: "Chegou e voltou a vender" }), _jsx("strong", { children: formatNumber(restockQuery.data?.counts.backToSelling ?? 0) })] }), _jsxs("button", { type: "button", className: "panel inventory-summary-panel inventory-summary-clickable", onClick: () => setRestockWindow("30d"), children: [_jsx("span", { children: "Chegou e ainda nao girou" }), _jsx("strong", { children: formatNumber(restockQuery.data?.counts.noReactionYet ?? 0) })] }), _jsxs("article", { className: "panel inventory-summary-panel", children: [_jsx("span", { children: "Ainda precisa repor" }), _jsx("strong", { children: formatNumber(restockQuery.data?.counts.restockAgain ?? 0) })] })] }), _jsx("section", { className: "panel inventory-inline-toolbar", children: _jsx("div", { className: "inventory-chip-row", children: [
                                { value: "all", label: "Tudo" },
                                { value: "today", label: "Hoje" },
                                { value: "7d", label: "7 dias" },
                                { value: "30d", label: "30 dias" },
                            ].map((chip) => (_jsx("button", { type: "button", className: `inventory-filter-chip ${restockWindow === chip.value ? "active" : ""}`, onClick: () => setRestockWindow(chip.value), children: chip.label }, chip.value))) }) }), _jsxs("section", { className: "inventory-card-list", children: [visibleRestockItems.map((item) => (_jsxs("article", { className: "panel inventory-line-card", children: [_jsxs("div", { className: "inventory-line-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Reposicao" }), _jsx("h3", { children: item.modelLabel }), _jsxs("p", { className: "panel-subcopy", children: ["Ultima entrada: ", formatDate(item.lastRestockAt)] })] }), _jsx("span", { className: `inventory-status-pill tone-${restockStatusTone(item.status)}`, children: restockStatusLabel(item.status) })] }), _jsxs("div", { className: "inventory-line-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: "Entrou" }), _jsx("strong", { children: formatNumber(item.restockUnits) })] }), _jsxs("div", { children: [_jsx("span", { children: "Antes / Depois" }), _jsxs("strong", { children: [formatNumber(item.stockBefore), " / ", formatNumber(item.stockAfter)] })] }), _jsxs("div", { children: [_jsx("span", { children: "Venda 7d antes" }), _jsx("strong", { children: formatNumber(item.sales7Before) })] }), _jsxs("div", { children: [_jsx("span", { children: "Venda 7d depois" }), _jsx("strong", { children: formatNumber(item.sales7After) })] }), _jsxs("div", { children: [_jsx("span", { children: "Estoque agora" }), _jsx("strong", { children: formatNumber(item.stockUnits) })] }), _jsxs("div", { children: [_jsx("span", { children: "Cobertura" }), _jsx("strong", { children: formatCoverage(item.coverageDays) })] })] }), _jsxs("div", { className: "inventory-line-footer", children: [_jsx("div", { className: "inventory-note-pills", children: _jsx("span", { className: `inventory-note-pill tone-${buyRecommendationTone(item.buyRecommendation)}`, children: buyRecommendationLabel(item.buyRecommendation) }) }), _jsx("button", { type: "button", className: "primary-button small-button", onClick: () => openModel(item.modelKey), children: "Abrir analise" })] })] }, `${item.modelKey}-${item.lastRestockAt ?? "no-restock"}`))), !visibleRestockItems.length ? _jsx("div", { className: "empty-state", children: "Nenhum modelo entrou nesse periodo agora." }) : null] })] })) : null, activeView === "stale" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "inventory-summary-grid", children: [
                            { value: 30, label: "30+ dias sem vender", count: staleQuery.data?.counts.stale30 ?? 0 },
                            { value: 60, label: "60+ dias sem vender", count: staleQuery.data?.counts.stale60 ?? 0 },
                            { value: 90, label: "90+ dias sem vender", count: staleQuery.data?.counts.stale90 ?? 0 },
                            { value: 120, label: "120+ dias sem vender", count: staleQuery.data?.counts.stale120 ?? 0 },
                        ].map((card) => (_jsxs("button", { type: "button", "aria-pressed": staleFilter === card.value, className: `panel inventory-summary-panel inventory-summary-clickable ${staleFilter === card.value ? "selected" : ""}`, onClick: () => setStaleFilter(card.value), children: [_jsxs("div", { className: "inventory-summary-top", children: [_jsx("span", { children: card.label }), staleFilter === card.value ? (_jsxs("span", { className: "inventory-summary-selected-badge", children: [_jsx(CheckCircle2, { size: 14 }), "Selecionado"] })) : (_jsx("small", { className: "inventory-summary-hint", children: "Clique para filtrar" }))] }), _jsx("strong", { children: formatNumber(card.count) })] }, card.value))) }), _jsx("section", { className: "inventory-card-list", children: visibleStaleItems.length ? (_jsxs("section", { className: "panel inventory-stale-table-panel", children: [_jsxs("div", { className: "inventory-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Produtos parados" }), _jsx("h3", { children: "Tabela de produtos sem giro" })] }), _jsxs("span", { children: [formatNumber(visibleStaleItems.length), " modelos"] })] }), _jsx("div", { className: "inventory-stale-table-wrap", children: _jsxs("table", { className: "data-table inventory-stale-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Modelo" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Dias sem vender" }), _jsx("th", { children: "Pecas" }), _jsx("th", { children: "SKUs" }), _jsx("th", { children: "Ultima venda" }), _jsx("th", { children: "Venda 90 dias" }), _jsx("th", { children: "Valor parado" }), _jsx("th", { children: "Ultima reposicao" }), _jsx("th", { children: "Acao sugerida" }), _jsx("th", { children: "Abrir" })] }) }), _jsx("tbody", { children: visibleStaleItems.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { className: "inventory-stale-model-cell", children: [_jsx("strong", { children: item.modelLabel }), _jsxs("span", { children: [item.brand, " \u00B7 ", item.family] })] }) }), _jsx("td", { children: _jsx("span", { className: `inventory-status-pill tone-${productKindTone(item.productKind)}`, children: productKindLabel(item.productKind) }) }), _jsx("td", { children: _jsx("strong", { children: item.daysSinceLastSale === null ? "Sem venda" : `${formatNumber(item.daysSinceLastSale)} dias` }) }), _jsx("td", { children: formatNumber(item.stockUnits) }), _jsx("td", { children: formatNumber(item.activeSkuCount) }), _jsx("td", { children: formatDate(item.lastSaleAt) }), _jsx("td", { children: formatNumber(item.sales90) }), _jsx("td", { children: _jsxs("div", { className: "inventory-stale-value-cell", children: [_jsx("strong", { children: formatCurrency(item.trappedValue) }), item.trappedValueEstimated ? _jsx("span", { className: "inventory-note-pill tone-warning", children: "Estimado" }) : null] }) }), _jsx("td", { children: formatDate(item.lastRestockAt) }), _jsx("td", { children: _jsx("span", { className: `inventory-status-pill tone-${staleActionTone(item.suggestedAction)}`, children: staleActionLabel(item.suggestedAction) }) }), _jsx("td", { children: _jsx("button", { type: "button", className: "primary-button small-button", onClick: () => openModel(item.modelKey), children: "Abrir analise" }) })] }, item.modelKey))) })] }) })] })) : (_jsx("div", { className: "empty-state", children: "Nenhum modelo entrou nessa faixa agora." })) })] })) : null, activeView === "models" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "panel inventory-search-panel", children: _jsxs("div", { className: "inventory-search-grid", children: [_jsxs("label", { children: ["Buscar modelo, marca, familia ou SKU", _jsx("input", { value: modelSearch, onChange: (event) => setModelSearch(event.target.value), placeholder: "Ex.: A05, Xiaomi, 1308-1" })] }), _jsxs("label", { children: ["Marca", _jsxs("select", { value: brandFilter, onChange: (event) => setBrandFilter(event.target.value), children: [_jsx("option", { value: "", children: "Todas" }), (modelsQuery.data?.filters.brands ?? []).map((brand) => (_jsx("option", { value: brand, children: brand }, brand)))] })] }), _jsxs("label", { children: ["Familia", _jsxs("select", { value: familyFilter, onChange: (event) => setFamilyFilter(event.target.value), children: [_jsx("option", { value: "", children: "Todas" }), (modelsQuery.data?.filters.families ?? []).map((family) => (_jsx("option", { value: family, children: family }, family)))] })] }), _jsxs("label", { children: ["Qualidade", _jsxs("select", { value: qualityFilter, onChange: (event) => setQualityFilter(event.target.value), children: [_jsx("option", { value: "", children: "Todas" }), (modelsQuery.data?.filters.qualities ?? []).map((quality) => (_jsx("option", { value: quality, children: quality }, quality)))] })] })] }) }), _jsxs("section", { className: "inventory-models-layout", children: [_jsxs("section", { className: "panel inventory-model-list-panel", children: [_jsxs("div", { className: "inventory-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Catalogo" }), _jsx("h3", { children: "Modelos para analisar" })] }), _jsx("span", { children: formatNumber(visibleModels.length) })] }), _jsxs("div", { className: "inventory-model-list", children: [visibleModels.map((item) => (_jsxs("button", { type: "button", className: `inventory-model-button ${selectedModelKey === item.modelKey ? "active" : ""}`, onClick: () => setSelectedModelKey(item.modelKey), children: [_jsxs("div", { children: [_jsx("strong", { children: item.modelLabel }), _jsxs("span", { children: [productKindLabel(item.productKind), " \u00B7 ", item.sampleSkus.slice(0, 3).join(", "), " \u00B7 ", item.qualityLabels.slice(0, 2).join(", ") || "Sem qualidade"] })] }), _jsxs("div", { className: "inventory-row-numbers", children: [_jsx("strong", { children: formatNumber(item.stockUnits) }), _jsx("span", { children: buyRecommendationLabel(item.buyRecommendation) })] })] }, item.modelKey))), !visibleModels.length ? _jsx("div", { className: "empty-state", children: "Nenhum modelo bateu com essa busca." }) : null] })] }), _jsx(ModelDetailPanel, { detail: detailQuery.data, isLoading: detailQuery.isLoading })] })] })) : null] }));
}

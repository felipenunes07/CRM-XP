import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber, statusLabel } from "../lib/format";
const alertLabels = {
    sem_pedido_no_mes: "Sem pedido no mes",
    queda_vs_mes_anterior: "Queda vs mes anterior",
    atencao: "Atencao",
    inativo: "Inativo",
    compra_prevista_vencida: "Compra prevista vencida",
};
const insightLabels = {
    alto_valor: "Alto valor",
    reativacao: "Reativacao",
    recorrente: "Recorrente",
    queda_frequencia: "Queda de frequencia",
    risco_churn: "Risco de churn",
    compra_prevista_vencida: "Compra prevista vencida",
    novo_cliente: "Novo cliente",
};
function formatMonthLabel(value) {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    const year = match?.[1];
    const month = match?.[2];
    if (!year || !month) {
        return value;
    }
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
function growthTone(value) {
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
function primaryInsightLabel(ambassador) {
    if (!ambassador.primaryInsight) {
        return "Sem sinal dominante";
    }
    return insightLabels[ambassador.primaryInsight];
}
function ambassadorFocusTone(ambassador) {
    if (ambassador.alerts.includes("sem_pedido_no_mes") || ambassador.status === "INACTIVE") {
        return "danger";
    }
    if (ambassador.status === "ATTENTION" ||
        ambassador.alerts.includes("queda_vs_mes_anterior") ||
        ambassador.alerts.includes("compra_prevista_vencida")) {
        return "warning";
    }
    return "success";
}
function ambassadorFocusSummary(ambassador) {
    if (ambassador.alerts.includes("sem_pedido_no_mes")) {
        return "Ainda nao comprou na janela atual. Vale contato proativo neste corte.";
    }
    if (ambassador.status === "INACTIVE") {
        return "Ja saiu da zona ativa. Precisa reengajar antes de perder recorrencia.";
    }
    if (ambassador.status === "ATTENTION") {
        return "Entrou em monitoramento. O ideal e agir antes de virar inativo.";
    }
    if ((ambassador.revenueGrowthRatio ?? 0) <= -0.15) {
        return "Comprou menos do que no corte anterior e merece revisao de rotina.";
    }
    if ((ambassador.revenueGrowthRatio ?? 0) >= 0.15) {
        return "Vem acelerando no corte atual e pode puxar volume adicional.";
    }
    return "Segue estavel, sem alerta critico no momento.";
}
function ambassadorFocusHeadline(ambassador) {
    if (ambassador.alerts.includes("sem_pedido_no_mes") || ambassador.status === "INACTIVE") {
        return "Risco de esfriar";
    }
    if (ambassador.status === "ATTENTION" ||
        ambassador.alerts.includes("queda_vs_mes_anterior") ||
        ambassador.alerts.includes("compra_prevista_vencida")) {
        return "Pede acompanhamento";
    }
    if ((ambassador.revenueGrowthRatio ?? 0) >= 0.15) {
        return "Boa tracao no corte";
    }
    return "Relacao saudavel";
}
function statusClass(status) {
    if (status === "ACTIVE") {
        return "status-active";
    }
    if (status === "ATTENTION") {
        return "status-attention";
    }
    return "status-inactive";
}
function metricValue(item, sortKey) {
    switch (sortKey) {
        case "growth":
            return item.revenueGrowthRatio ?? Number.NEGATIVE_INFINITY;
        case "recency":
            return item.daysSinceLastPurchase ?? Number.POSITIVE_INFINITY;
        case "priority":
            return item.priorityScore;
        case "name":
            return item.displayName.toLocaleLowerCase("pt-BR");
        case "revenue":
        default:
            return item.currentPeriodRevenue;
    }
}
function chartMetricLabel(metric) {
    if (metric === "orders") {
        return "Pedidos";
    }
    if (metric === "pieces") {
        return "Pecas";
    }
    return "Faturamento";
}
function chartMetricColor(metric) {
    if (metric === "orders") {
        return "#5f8cff";
    }
    if (metric === "pieces") {
        return "#2f9d67";
    }
    return "#2956d7";
}
function AmbassadorTrendTooltip({ active, payload, label, metric, subjectLabel, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    const value = payload[0]?.value ?? 0;
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: metric === "revenue" ? formatCurrency(value) : formatNumber(value) }), _jsxs("span", { children: [chartMetricLabel(metric), " de ", subjectLabel] })] }), _jsx("p", { children: "Historico mensal fechado. Troque o embaixador acima para atualizar essa leitura." })] }));
}
export function AmbassadorsPage() {
    const { token } = useAuth();
    const [chartMetric, setChartMetric] = useState("revenue");
    const [trendWindow, setTrendWindow] = useState(12);
    const [selectedAmbassadorId, setSelectedAmbassadorId] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [alertFilter, setAlertFilter] = useState("");
    const [sortKey, setSortKey] = useState("revenue");
    const ambassadorsQuery = useQuery({
        queryKey: ["ambassadors"],
        queryFn: () => api.ambassadors(token),
        enabled: Boolean(token),
    });
    const data = ambassadorsQuery.data;
    const allAmbassadors = data?.ambassadors ?? [];
    const selectableAmbassadors = useMemo(() => [...allAmbassadors].sort((left, right) => {
        const revenueDiff = right.currentPeriodRevenue - left.currentPeriodRevenue;
        if (revenueDiff !== 0) {
            return revenueDiff;
        }
        return left.displayName.localeCompare(right.displayName, "pt-BR");
    }), [allAmbassadors]);
    const ambassadors = useMemo(() => {
        return [...allAmbassadors]
            .filter((item) => {
            if (search.trim()) {
                const haystack = `${item.displayName} ${item.customerCode}`.toLocaleLowerCase("pt-BR");
                if (!haystack.includes(search.trim().toLocaleLowerCase("pt-BR"))) {
                    return false;
                }
            }
            if (statusFilter && item.status !== statusFilter) {
                return false;
            }
            if (alertFilter && !item.alerts.includes(alertFilter)) {
                return false;
            }
            return true;
        })
            .sort((left, right) => {
            const leftValue = metricValue(left, sortKey);
            const rightValue = metricValue(right, sortKey);
            if (typeof leftValue === "string" && typeof rightValue === "string") {
                return leftValue.localeCompare(rightValue, "pt-BR");
            }
            return Number(rightValue) - Number(leftValue);
        });
    }, [alertFilter, allAmbassadors, search, sortKey, statusFilter]);
    useEffect(() => {
        if (!selectableAmbassadors.length) {
            if (selectedAmbassadorId) {
                setSelectedAmbassadorId("");
            }
            return;
        }
        const firstAmbassador = selectableAmbassadors[0];
        const hasSelected = selectableAmbassadors.some((item) => item.id === selectedAmbassadorId);
        if ((!selectedAmbassadorId || !hasSelected) && firstAmbassador) {
            setSelectedAmbassadorId(firstAmbassador.id);
        }
    }, [selectableAmbassadors, selectedAmbassadorId]);
    if (ambassadorsQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando aba de embaixadores..." });
    }
    if (ambassadorsQuery.isError || !data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os embaixadores." });
    }
    const { summary, monthlyTrend } = data;
    const selectedAmbassador = selectableAmbassadors.find((item) => item.id === selectedAmbassadorId) ?? selectableAmbassadors[0] ?? null;
    const activeTrendDataFull = selectedAmbassador?.monthlyTrend?.length ? selectedAmbassador.monthlyTrend : monthlyTrend;
    const activeTrendData = activeTrendDataFull.slice(-trendWindow);
    const activeTrendLabel = selectedAmbassador ? selectedAmbassador.displayName : "a carteira";
    const overviewItems = [
        {
            label: "Carteira atual",
            value: `${formatNumber(summary.totalAmbassadors)} embaixadores`,
            detail: `${formatNumber(summary.statusCounts.ACTIVE)} ativos, ${formatNumber(summary.statusCounts.ATTENTION)} em atencao, ${formatNumber(summary.statusCounts.INACTIVE)} inativos.`,
            tone: "neutral",
        },
        {
            label: "Faturamento do corte",
            value: formatCurrency(summary.currentPeriodRevenue),
            detail: `${formatNumber(summary.currentPeriodOrders)} pedidos e ${formatNumber(summary.currentPeriodPieces)} pecas na janela atual.`,
            tone: "neutral",
        },
        {
            label: "Ticket medio",
            value: formatCurrency(summary.currentPeriodAvgTicket),
            detail: `${formatDate(summary.currentPeriodStart)} a ${formatDate(summary.currentPeriodEnd)}.`,
            tone: "neutral",
        },
        {
            label: "Crescimento",
            value: formatGrowth(summary.revenueGrowthRatio),
            detail: `Base anterior: ${formatCurrency(summary.previousPeriodRevenue)}.`,
            tone: growthTone(summary.revenueGrowthRatio),
        },
        {
            label: "Sem pedido no corte",
            value: formatNumber(summary.withoutOrdersThisMonth),
            detail: "Embaixadores que ainda nao compraram nesta janela.",
            tone: summary.withoutOrdersThisMonth ? "warning" : "success",
        },
    ];
    const selectedAmbassadorMetrics = selectedAmbassador
        ? [
            {
                label: "Faturamento no corte",
                value: formatCurrency(selectedAmbassador.currentPeriodRevenue),
                detail: `Anterior: ${formatCurrency(selectedAmbassador.previousPeriodRevenue)}`,
                tone: "neutral",
            },
            {
                label: "Crescimento",
                value: formatGrowth(selectedAmbassador.revenueGrowthRatio),
                detail: selectedAmbassador.revenueGrowthRatio === null ? "Sem base comparavel" : "vs corte anterior",
                tone: growthTone(selectedAmbassador.revenueGrowthRatio),
            },
            {
                label: "Pedidos no corte",
                value: formatNumber(selectedAmbassador.currentPeriodOrders),
                detail: selectedAmbassador.currentPeriodOrders
                    ? `Ticket atual: ${formatCurrency(selectedAmbassador.currentPeriodRevenue / selectedAmbassador.currentPeriodOrders)}`
                    : "Sem pedidos nesta janela",
                tone: selectedAmbassador.currentPeriodOrders ? "neutral" : "warning",
            },
            {
                label: "Pecas no corte",
                value: formatNumber(selectedAmbassador.currentPeriodPieces),
                detail: "Volume comprado na janela atual",
                tone: "neutral",
            },
            {
                label: "Recencia",
                value: formatDaysSince(selectedAmbassador.daysSinceLastPurchase),
                detail: `Ultima compra: ${formatDate(selectedAmbassador.lastPurchaseAt)}`,
                tone: selectedAmbassador.status === "ACTIVE"
                    ? "success"
                    : selectedAmbassador.status === "ATTENTION"
                        ? "warning"
                        : "danger",
            },
            {
                label: "Historico total",
                value: formatCurrency(selectedAmbassador.totalSpent),
                detail: `Ticket medio historico: ${formatCurrency(selectedAmbassador.avgTicket)}`,
                tone: "neutral",
            },
        ]
        : [];
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "hero-panel", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Clientes chave" }), _jsx("h2", { children: "Embaixadores da empresa" }), _jsxs("p", { children: ["Acompanhe de perto quem a chefia definiu como ", AMBASSADOR_LABEL_NAME.toLowerCase(), " e veja se essa carteira esta comprando mais, crescendo e puxando volume com a XP."] })] }), _jsxs("div", { className: "hero-meta", children: [_jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Janela atual" }), _jsxs("strong", { children: [formatDate(summary.currentPeriodStart), " a ", formatDate(summary.currentPeriodEnd)] })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Comparacao" }), _jsxs("strong", { children: [formatDate(summary.previousPeriodStart), " a ", formatDate(summary.previousPeriodEnd)] })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Cohort atual" }), _jsxs("strong", { children: [formatNumber(summary.totalAmbassadors), " embaixadores"] })] })] })] }), _jsxs("section", { className: "panel ambassador-overview-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Resumo da carteira" }), _jsx("h3", { children: "O que importa neste corte" }), _jsx("p", { className: "panel-subcopy", children: "Visao do grupo inteiro para saber tamanho, faturamento e risco da carteira de embaixadores." })] }) }), _jsx("div", { className: "ambassador-overview-grid", children: overviewItems.map((item) => (_jsxs("article", { className: `ambassador-overview-item tone-${item.tone}`, children: [_jsx("span", { children: item.label }), _jsx("strong", { children: item.value }), _jsx("p", { children: item.detail })] }, item.label))) })] }), _jsxs("section", { className: "panel ambassador-focus-panel", children: [_jsxs("div", { className: "ambassador-focus-toolbar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Embaixador selecionado" }), _jsx("h3", { children: selectedAmbassador ? selectedAmbassador.displayName : "Selecione um embaixador" }), _jsx("p", { className: "panel-subcopy", children: "Ao trocar o nome, esse resumo e o grafico mensal abaixo atualizam juntos." })] }), _jsxs("div", { className: "ambassador-focus-controls", children: [_jsxs("label", { className: "ambassador-focus-select", children: ["Embaixador", _jsx("select", { value: selectedAmbassador?.id ?? "", onChange: (event) => setSelectedAmbassadorId(event.target.value), disabled: !selectableAmbassadors.length, children: selectableAmbassadors.map((ambassador) => (_jsxs("option", { value: ambassador.id, children: [ambassador.displayName, " ", ambassador.customerCode ? `| ${ambassador.customerCode}` : ""] }, ambassador.id))) })] }), selectedAmbassador ? (_jsx(Link, { className: "ghost-button", to: `/clientes/${selectedAmbassador.id}`, children: "Abrir cliente" })) : null] })] }), selectedAmbassador ? (_jsxs("div", { className: "ambassador-focus-shell", children: [_jsxs("div", { className: "ambassador-focus-summary", children: [_jsx("div", { className: "ambassador-focus-identity", children: _jsxs("div", { className: "ambassador-focus-copy", children: [_jsxs("div", { className: "ambassador-title-row", children: [_jsx("strong", { children: selectedAmbassador.displayName }), _jsx("span", { className: `status-badge ${statusClass(selectedAmbassador.status)}`, children: statusLabel(selectedAmbassador.status) })] }), _jsxs("span", { children: [selectedAmbassador.customerCode || "Sem codigo", " | Embaixador desde ", formatDate(selectedAmbassador.ambassadorAssignedAt)] }), _jsxs("span", { children: ["Ultima atendente: ", selectedAmbassador.lastAttendant ?? "Nao informado"] })] }) }), _jsxs("div", { className: `ambassador-focus-note tone-${ambassadorFocusTone(selectedAmbassador)}`, children: [_jsx("span", { children: "Leitura rapida" }), _jsx("strong", { children: ambassadorFocusHeadline(selectedAmbassador) }), _jsx("p", { children: ambassadorFocusSummary(selectedAmbassador) })] })] }), _jsxs("div", { className: "tag-row compact ambassador-focus-tags", children: [_jsx("span", { className: "tag ambassador-insight-tag", children: primaryInsightLabel(selectedAmbassador) }), _jsxs("span", { className: "tag ambassador-tag", children: ["Prioridade ", formatNumber(selectedAmbassador.priorityScore)] }), _jsxs("span", { className: "tag ambassador-tag", children: ["Valor ", formatCurrency(selectedAmbassador.totalSpent)] }), selectedAmbassador.alerts.length ? (selectedAmbassador.alerts.map((alert) => (_jsx("span", { className: "tag ambassador-alert-tag", children: alertLabels[alert] ?? alert }, alert)))) : (_jsx("span", { className: "muted-copy", children: "Sem alertas no momento." }))] }), _jsx("div", { className: "ambassador-focus-metrics", children: selectedAmbassadorMetrics.map((metric) => (_jsxs("article", { className: `ambassador-focus-metric tone-${metric.tone}`, children: [_jsx("span", { children: metric.label }), _jsx("strong", { children: metric.value }), _jsx("p", { children: metric.detail })] }, metric.label))) })] })) : (_jsx("div", { className: "empty-state", children: "Nenhum embaixador disponivel para esse recorte." }))] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Historico mensal" }), _jsx("h3", { children: selectedAmbassador ? `Tendencia de ${selectedAmbassador.displayName}` : "Tendencia mensal da carteira" }), _jsxs("p", { className: "panel-subcopy", children: [selectedAmbassador
                                                ? "Esse grafico acompanha o embaixador selecionado acima e troca assim que voce muda o nome."
                                                : "Historico mensal da carteira inteira de embaixadores.", " ", "Janela atual: ultimos ", trendWindow, " meses fechados."] })] }), _jsxs("div", { className: "ambassador-chart-controls", children: [_jsx("div", { className: "ambassador-chart-toggle", role: "tablist", "aria-label": "Selecionar metrica do grafico", children: ["revenue", "orders", "pieces"].map((metric) => (_jsx("button", { type: "button", className: `ambassador-chart-button ${chartMetric === metric ? "active" : ""}`, onClick: () => setChartMetric(metric), children: chartMetricLabel(metric) }, metric))) }), _jsx("div", { className: "ambassador-range-toggle", role: "tablist", "aria-label": "Selecionar janela de tempo", children: [6, 12, 24].map((windowSize) => (_jsxs("button", { type: "button", className: `ambassador-range-button ${trendWindow === windowSize ? "active" : ""}`, onClick: () => setTrendWindow(windowSize), children: [windowSize, "m"] }, windowSize))) })] })] }), _jsx("div", { className: "trend-chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 320, children: _jsxs(BarChart, { data: activeTrendData, margin: { top: 12, right: 8, left: 0, bottom: 4 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "month", tickFormatter: (value) => formatMonthLabel(String(value)), stroke: "#5f6f95", minTickGap: trendWindow === 24 ? 18 : 8 }), _jsx(YAxis, { stroke: "#5f6f95", tickFormatter: (value) => formatNumber(Number(value)) }), _jsx(Tooltip, { content: _jsx(AmbassadorTrendTooltip, { metric: chartMetric, subjectLabel: activeTrendLabel }), cursor: { fill: "rgba(41, 86, 215, 0.04)" } }), _jsx(Bar, { dataKey: chartMetric, fill: chartMetricColor(chartMetric), radius: [8, 8, 0, 0] })] }) }) })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Carteira monitorada" }), _jsx("h3", { children: "Quem esta crescendo, parado ou pedindo atencao" }), _jsx("p", { className: "panel-subcopy", children: "Use os filtros para encontrar um nome e clique em \"Ver no painel\" para atualizar o resumo acima." })] }) }), _jsxs("div", { className: "filters-grid filters-grid-four ambassador-filters", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome ou codigo" })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { children: ["Alerta", _jsxs("select", { value: alertFilter, onChange: (event) => setAlertFilter(event.target.value), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "sem_pedido_no_mes", children: "Sem pedido no mes" }), _jsx("option", { value: "queda_vs_mes_anterior", children: "Queda vs mes anterior" }), _jsx("option", { value: "atencao", children: "Atencao" }), _jsx("option", { value: "inativo", children: "Inativo" }), _jsx("option", { value: "compra_prevista_vencida", children: "Compra prevista vencida" })] })] }), _jsxs("label", { children: ["Ordenar por", _jsxs("select", { value: sortKey, onChange: (event) => setSortKey(event.target.value), children: [_jsx("option", { value: "revenue", children: "Faturamento do mes" }), _jsx("option", { value: "growth", children: "Crescimento" }), _jsx("option", { value: "recency", children: "Recencia" }), _jsx("option", { value: "priority", children: "Prioridade" }), _jsx("option", { value: "name", children: "Nome" })] })] })] }), ambassadors.length ? (_jsx("div", { className: "ambassador-card-list", children: ambassadors.map((ambassador) => (_jsxs("article", { className: `ambassador-card ${selectedAmbassador?.id === ambassador.id ? "is-selected" : ""}`, children: [_jsxs("div", { className: "ambassador-card-top", children: [_jsxs("div", { className: "ambassador-card-copy", children: [_jsxs("div", { className: "ambassador-title-row", children: [_jsx("strong", { children: ambassador.displayName }), _jsx("span", { className: `status-badge ${statusClass(ambassador.status)}`, children: statusLabel(ambassador.status) })] }), _jsxs("span", { children: [ambassador.customerCode || "Sem codigo", " | Embaixador desde ", formatDate(ambassador.ambassadorAssignedAt)] })] }), _jsxs("div", { className: "ambassador-card-actions", children: [_jsx("button", { type: "button", className: `ghost-button ambassador-select-button ${selectedAmbassador?.id === ambassador.id ? "active" : ""}`, onClick: () => setSelectedAmbassadorId(ambassador.id), children: selectedAmbassador?.id === ambassador.id ? "No painel" : "Ver no painel" }), _jsx(Link, { className: "ghost-button", to: `/clientes/${ambassador.id}`, children: "Abrir cliente" })] })] }), _jsxs("div", { className: "ambassador-metric-strip", children: [_jsxs("span", { children: ["Faturamento no mes: ", formatCurrency(ambassador.currentPeriodRevenue)] }), _jsxs("span", { children: ["Crescimento: ", formatGrowth(ambassador.revenueGrowthRatio)] }), _jsxs("span", { children: ["Pedidos no mes: ", formatNumber(ambassador.currentPeriodOrders)] }), _jsxs("span", { children: ["Pecas no mes: ", formatNumber(ambassador.currentPeriodPieces)] }), _jsxs("span", { children: ["Total historico: ", formatCurrency(ambassador.totalSpent)] }), _jsxs("span", { children: ["Ticket medio: ", formatCurrency(ambassador.avgTicket)] }), _jsxs("span", { children: ["Ultima compra: ", formatDate(ambassador.lastPurchaseAt)] }), _jsxs("span", { children: ["Recencia: ", formatDaysSince(ambassador.daysSinceLastPurchase)] }), _jsxs("span", { children: ["Ultima atendente: ", ambassador.lastAttendant ?? "Nao informado"] })] }), _jsxs("div", { className: "ambassador-card-section", children: [_jsx("strong", { children: "Alertas" }), _jsx("div", { className: "tag-row compact", children: ambassador.alerts.length ? (ambassador.alerts.map((alert) => (_jsx("span", { className: "tag ambassador-alert-tag", children: alertLabels[alert] ?? alert }, alert)))) : (_jsx("span", { className: "muted-copy", children: "Sem alertas no momento." })) })] }), _jsxs("div", { className: "ambassador-card-section", children: [_jsx("strong", { children: "Top 3 produtos mais comprados" }), ambassador.topProducts.length ? (_jsx("div", { className: "ambassador-top-products", children: ambassador.topProducts.map((product) => (_jsxs("div", { className: "ambassador-top-product", children: [_jsx("strong", { children: product.itemDescription }), _jsx("span", { children: product.sku ? `SKU ${product.sku}` : "SKU nao informado" }), _jsxs("span", { children: [formatNumber(product.totalQuantity), " pecas | ", formatNumber(product.orderCount), " pedidos"] })] }, `${ambassador.id}-${product.sku ?? product.itemDescription}`))) })) : (_jsx("span", { className: "muted-copy", children: "Ainda nao ha historico suficiente para montar o mix." }))] })] }, ambassador.id))) })) : (_jsx("div", { className: "empty-state", children: "Nenhum embaixador encontrado para esse recorte." }))] })] }));
}

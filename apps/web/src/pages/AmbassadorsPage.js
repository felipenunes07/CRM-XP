import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
    return (_jsxs("div", { className: "chart-tooltip", children: [_jsx("strong", { children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", children: [_jsx("strong", { children: metric === "revenue" ? formatCurrency(value) : formatNumber(value) }), _jsxs("span", { children: [chartMetricLabel(metric), " de ", subjectLabel] })] }), _jsx("p", { children: "Historico mensal de desempenho. Troque o embaixador acima para atualizar essa leitura." })] }));
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
            label: "Peças compradas",
            value: formatNumber(summary.currentPeriodPieces),
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
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: '0.2rem' }, children: "Clientes chave" }), _jsx("h2", { className: "premium-header-title", children: "Embaixadores da empresa" })] }), _jsxs("div", { style: { display: 'flex', gap: '1rem', flexWrap: 'wrap' }, children: [_jsxs("div", { style: { background: 'var(--panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }, children: [_jsx("span", { style: { fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }, children: "Janela atual" }), _jsxs("strong", { style: { fontSize: '0.85rem' }, children: [formatDate(summary.currentPeriodStart), " - ", formatDate(summary.currentPeriodEnd)] })] }), _jsxs("div", { style: { background: 'var(--panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }, children: [_jsx("span", { style: { fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }, children: "Comparacao" }), _jsxs("strong", { style: { fontSize: '0.85rem' }, children: [formatDate(summary.previousPeriodStart), " - ", formatDate(summary.previousPeriodEnd)] })] }), _jsxs("div", { style: { background: 'var(--panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }, children: [_jsx("span", { style: { fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }, children: "Cohort atual" }), _jsxs("strong", { style: { fontSize: '0.85rem' }, children: [formatNumber(summary.totalAmbassadors), " embaixadores"] })] })] })] }), _jsx("div", { className: "stats-grid", children: overviewItems.map((item) => (_jsxs("div", { className: `stat-card tone-${item.tone}`, children: [_jsx("div", { className: "stat-card-header", children: _jsx("h3", { className: "stat-card-title", children: item.label }) }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: item.value }), _jsx("p", { className: "stat-card-helper", children: item.detail })] })] }, item.label))) }), _jsxs("div", { className: "grid-two dashboard-grid", style: { alignItems: "flex-start", marginTop: "1rem" }, children: [_jsxs("div", { className: "page-stack", children: [selectedAmbassador && (_jsxs("section", { className: "panel", style: { padding: '1.25rem' }, children: [_jsxs("div", { className: "panel-header", style: { marginBottom: '1rem' }, children: [_jsxs("div", { children: [_jsx("h3", { style: { margin: 0, fontSize: '1.4rem' }, children: selectedAmbassador.displayName }), _jsxs("div", { style: { display: 'flex', gap: '0.8rem', marginTop: '0.4rem', alignItems: 'center' }, children: [_jsx("span", { className: `status-badge ${statusClass(selectedAmbassador.status)}`, children: statusLabel(selectedAmbassador.status) }), _jsx("span", { style: { fontSize: '0.85rem', color: 'var(--muted)' }, children: selectedAmbassador.customerCode || "Sem codigo" })] })] }), _jsx("div", { style: { display: 'flex', alignItems: 'flex-start' }, children: _jsx(Link, { className: "ghost-button", to: `/clientes/${selectedAmbassador.id}`, style: { padding: '0.4rem 1rem' }, children: "Abrir perfil" }) })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', background: 'var(--line)', padding: '1rem', borderRadius: '10px' }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column' }, children: [_jsx("span", { style: { fontSize: '0.75rem', color: 'var(--muted)' }, children: "Faturamento atual" }), _jsx("strong", { style: { fontSize: '1.1rem' }, children: formatCurrency(selectedAmbassador.currentPeriodRevenue) })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column' }, children: [_jsx("span", { style: { fontSize: '0.75rem', color: 'var(--muted)' }, children: "Crescimento" }), _jsx("strong", { style: { fontSize: '1.1rem', color: ambassadorFocusTone(selectedAmbassador) === 'success' ? 'var(--success)' : 'inherit' }, children: formatGrowth(selectedAmbassador.revenueGrowthRatio) })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column' }, children: [_jsx("span", { style: { fontSize: '0.75rem', color: 'var(--muted)' }, children: "Pedidos no corte" }), _jsx("strong", { style: { fontSize: '1.1rem' }, children: formatNumber(selectedAmbassador.currentPeriodOrders) })] }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column' }, children: [_jsx("span", { style: { fontSize: '0.75rem', color: 'var(--muted)' }, children: "Recencia" }), _jsx("strong", { style: { fontSize: '1.1rem' }, children: formatDaysSince(selectedAmbassador.daysSinceLastPurchase) })] })] })] })), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Historico mensal" }), _jsx("h3", { children: selectedAmbassador ? `Tendencia de ${selectedAmbassador.displayName}` : "Tendencia mensal" })] }), _jsxs("div", { className: "ambassador-chart-controls", style: { display: 'flex', alignItems: 'center', gap: '1rem' }, children: [_jsx("div", { className: "ambassador-chart-toggle", role: "tablist", children: ["revenue", "orders", "pieces"].map((metric) => (_jsx("button", { type: "button", className: `ambassador-chart-button ${chartMetric === metric ? "active" : ""}`, onClick: () => setChartMetric(metric), children: chartMetricLabel(metric) }, metric))) }), _jsx("div", { style: { width: '1px', height: '24px', background: 'var(--line)' } }), _jsx("div", { className: "ambassador-range-toggle", role: "tablist", children: [6, 12, 24].map((windowSize) => (_jsxs("button", { type: "button", className: `ambassador-range-button ${trendWindow === windowSize ? "active" : ""}`, onClick: () => setTrendWindow(windowSize), children: [windowSize, "m"] }, windowSize))) })] })] }), _jsx("div", { className: "trend-chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 320, children: _jsxs(BarChart, { data: activeTrendData, margin: { top: 12, right: 8, left: 0, bottom: 4 }, children: [_jsx(CartesianGrid, { stroke: "rgba(41, 86, 215, 0.08)", vertical: false }), _jsx(XAxis, { dataKey: "month", tickFormatter: (value) => formatMonthLabel(String(value)), stroke: "#5f6f95", minTickGap: trendWindow === 24 ? 18 : 8 }), _jsx(YAxis, { stroke: "#5f6f95", tickFormatter: (value) => formatNumber(Number(value)) }), _jsx(Tooltip, { content: _jsx(AmbassadorTrendTooltip, { metric: chartMetric, subjectLabel: activeTrendLabel }), cursor: { fill: "rgba(41, 86, 215, 0.04)" } }), _jsx(Bar, { dataKey: chartMetric, fill: chartMetricColor(chartMetric), radius: [8, 8, 0, 0] })] }) }) })] })] }), _jsxs("section", { className: "panel search-sidebar", children: [_jsx("div", { className: "panel-header", style: { marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--line)' }, children: _jsx("h3", { style: { fontSize: '1.2rem', margin: 0 }, children: "Encontrar Embaixador" }) }), _jsxs("div", { className: "search-container", children: [_jsxs("div", { className: "search-input-wrapper", children: [_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome ou codigo..." })] }), _jsxs("div", { className: "filter-row", children: [_jsxs("select", { className: "filter-select", value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "", children: "Status" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] }), _jsxs("select", { className: "filter-select", value: sortKey, onChange: (event) => setSortKey(event.target.value), children: [_jsx("option", { value: "revenue", children: "Vendas" }), _jsx("option", { value: "growth", children: "Crescimento" }), _jsx("option", { value: "recency", children: "Recencia" })] })] })] }), _jsx("div", { className: "ambassador-list", children: ambassadors.length ? ambassadors.map((ambassador) => (_jsxs("article", { onClick: () => setSelectedAmbassadorId(ambassador.id), className: `ambassador-item-card ${selectedAmbassador?.id === ambassador.id ? 'selected' : ''}`, children: [_jsxs("div", { className: "ambassador-item-card-header", children: [_jsx("div", { className: "ambassador-item-name", children: ambassador.displayName }), _jsx("div", { className: "ambassador-item-revenue", children: formatCurrency(ambassador.currentPeriodRevenue) })] }), _jsxs("div", { className: "ambassador-item-footer", children: [_jsx("span", { className: `status-badge ${statusClass(ambassador.status)}`, style: { padding: '0.15rem 0.5rem', fontSize: '0.65rem' }, children: statusLabel(ambassador.status) }), _jsxs("span", { className: "ambassador-item-growth", children: ["Crescem: ", _jsx("strong", { children: formatGrowth(ambassador.revenueGrowthRatio) })] })] })] }, ambassador.id))) : (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', gap: '1rem', opacity: 0.6 }, children: [_jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", width: "48", height: "48", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "11", cy: "11", r: "8" }), _jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })] }), _jsx("span", { style: { fontSize: '0.9rem' }, children: "Nenhum embaixador encontrado" })] })) })] })] })] }));
}

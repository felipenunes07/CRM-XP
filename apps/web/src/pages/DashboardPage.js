import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Link } from "react-router-dom";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber } from "../lib/format";
const bucketFilters = {
    "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
    "15-29": { minDaysInactive: 15, maxDaysInactive: 29 },
    "30-59": { minDaysInactive: 30, maxDaysInactive: 59 },
    "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
    "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
    "180+": { minDaysInactive: 180 },
};
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
    return (items ?? []).slice(0, 12);
}
export function DashboardPage() {
    const { token } = useAuth();
    const [selectedBucket, setSelectedBucket] = useState(null);
    const dashboardQuery = useQuery({
        queryKey: ["dashboard"],
        queryFn: () => api.dashboard(token),
        enabled: Boolean(token),
    });
    const agendaQuery = useQuery({
        queryKey: ["dashboard-agenda-preview"],
        queryFn: () => api.agenda(token, 12),
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
    if (dashboardQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando dashboard..." });
    }
    if (dashboardQuery.isError || !dashboardQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar o dashboard." });
    }
    const metrics = dashboardQuery.data;
    const agendaItems = getAgendaPreviewItems(agendaQuery.data);
    const tableCustomers = selectedBucket ? (filteredCustomersQuery.data ?? []) : metrics.topCustomers;
    return (_jsxs("div", { className: "page-stack", children: [_jsx("section", { className: "hero-panel", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Visao geral" }), _jsx("h2", { children: "XP CRM" }), _jsx("p", { children: "Base comercial centralizada no Supabase com leitura analitica pronta para o time comercial." })] }) }), _jsxs("section", { className: "stats-grid", children: [_jsx(StatCard, { title: "Total de clientes", value: formatNumber(metrics.totalCustomers), helper: "Base comercial consolidada" }), _jsx(StatCard, { title: "Clientes ativos", value: formatNumber(metrics.statusCounts.ACTIVE), tone: "success" }), _jsx(StatCard, { title: "Clientes em atencao", value: formatNumber(metrics.statusCounts.ATTENTION), tone: "warning" }), _jsx(StatCard, { title: "Clientes inativos", value: formatNumber(metrics.statusCounts.INACTIVE), tone: "danger" }), _jsx(StatCard, { title: "Ticket medio", value: formatCurrency(metrics.averageTicket) }), _jsx(StatCard, { title: "Frequencia media", value: `${metrics.averageFrequencyDays.toFixed(1)} dias`, helper: metrics.lastSyncAt ? `Ultima sincronizacao ${new Date(metrics.lastSyncAt).toLocaleString("pt-BR")}` : "Sincronizacao diaria automatica" })] }), _jsxs("section", { className: "grid-two dashboard-grid", children: [_jsxs("article", { className: "panel chart-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Faixas de inatividade" }), _jsx("h3", { children: "Onde esta o risco de parada" })] }) }), _jsx("p", { className: "panel-subcopy", children: "Clique em uma barra para filtrar a tabela abaixo pelos clientes daquela faixa." }), _jsx("div", { className: "chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 280, children: _jsxs(BarChart, { data: metrics.inactivityBuckets, onClick: (state) => {
                                            const label = state?.activeLabel;
                                            if (!label || !(label in bucketFilters)) {
                                                return;
                                            }
                                            setSelectedBucket((current) => (current === label ? null : label));
                                        }, children: [_jsx(XAxis, { dataKey: "label", stroke: "#5f6f95" }), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "count", radius: [8, 8, 0, 0], cursor: "pointer", children: metrics.inactivityBuckets.map((bucket) => (_jsx(Cell, { fill: bucketColor(bucket.label, selectedBucket === bucket.label) }, bucket.label))) })] }) }) }), selectedBucket ? (_jsxs("div", { className: "inline-actions", children: [_jsxs("span", { className: "tag", children: ["Filtro ativo: ", selectedBucket] }), _jsx("button", { className: "ghost-button", type: "button", onClick: () => setSelectedBucket(null), children: "Limpar filtro" })] })) : null] }), _jsxs("article", { className: "panel insight-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Agenda de hoje" }), _jsxs("h3", { children: [metrics.dailyAgendaCount, " clientes pedem contato agora"] })] }), _jsx(Link, { className: "ghost-button", to: "/agenda", children: "Ver agenda completa" })] }), _jsx("div", { className: "stack-list agenda-scroll-list", children: agendaItems.map((customer) => (_jsxs("div", { className: "agenda-card compact", children: [_jsxs("div", { className: "agenda-card-copy", children: [_jsx("strong", { children: customer.displayName }), _jsx("p", { children: customer.reason }), _jsxs("small", { children: ["Ultima compra: ", formatDate(customer.lastPurchaseAt), " | ", formatDaysSince(customer.daysSinceLastPurchase)] })] }), _jsxs("div", { className: "agenda-metric", children: [_jsx("span", { children: customer.priorityScore.toFixed(1) }), _jsx(ArrowUpRight, { size: 16 })] })] }, customer.id))) })] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: selectedBucket ? "Clientes filtrados pelo grafico" : "Ranking por faturamento" }), _jsx("h3", { children: selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes com maior peso na receita" })] }) }), selectedBucket && filteredCustomersQuery.isLoading ? (_jsx("div", { className: "page-loading", children: "Filtrando clientes da faixa selecionada..." })) : null, selectedBucket && filteredCustomersQuery.isError ? (_jsx("div", { className: "page-error", children: "Nao foi possivel carregar os clientes dessa faixa." })) : null, !selectedBucket || filteredCustomersQuery.data ? _jsx(CustomerTable, { customers: tableCustomers }) : null] })] }));
}

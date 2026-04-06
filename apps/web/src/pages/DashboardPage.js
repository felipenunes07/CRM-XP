import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Link } from "react-router-dom";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
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
export function DashboardPage() {
    const { token } = useAuth();
    const [selectedBucket, setSelectedBucket] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
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
    const agendaItems = getAgendaPreviewItems(agendaQuery.data);
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
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "hero-panel dashboard-hero", children: [_jsxs("div", { className: "hero-copy", children: [_jsx("p", { className: "eyebrow", children: "Operacao comercial" }), _jsx("h2", { children: "Prioridades de contato e saude da carteira" }), _jsx("p", { children: "Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada." }), _jsxs("div", { className: "hero-actions", children: [_jsx(Link, { className: "primary-button", to: "/agenda", children: "Abrir agenda do dia" }), _jsx("button", { className: "ghost-button", type: "button", disabled: isSyncing, onClick: handleSync, children: isSyncing ? "Sincronizando..." : "Sincronizar Agora" })] })] }), _jsxs("div", { className: "hero-meta", children: [_jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Ultima sincronizacao" }), _jsx("strong", { children: metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString("pt-BR") : "Sincronizacao pendente" })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Frequencia media" }), _jsxs("strong", { children: [metrics.averageFrequencyDays.toFixed(1), " dias"] })] }), _jsxs("div", { className: "hero-meta-item", children: [_jsx("span", { children: "Agenda de hoje" }), _jsxs("strong", { children: [metrics.dailyAgendaCount, " clientes"] })] })] })] }), _jsxs("section", { className: "stats-grid", children: [_jsx(StatCard, { title: "Total de clientes", value: formatNumber(metrics.totalCustomers), helper: "Base comercial consolidada" }), _jsx(StatCard, { title: "Clientes ativos", value: formatNumber(metrics.statusCounts.ACTIVE), tone: "success" }), _jsx(StatCard, { title: "Clientes em atencao", value: formatNumber(metrics.statusCounts.ATTENTION), tone: "warning" }), _jsx(StatCard, { title: "Clientes inativos", value: formatNumber(metrics.statusCounts.INACTIVE), tone: "danger" }), _jsx(StatCard, { title: "Frequencia media", value: `${metrics.averageFrequencyDays.toFixed(1)} dias`, helper: "Intervalo medio entre pedidos" })] }), _jsxs("section", { className: "grid-two dashboard-grid", children: [_jsxs("article", { className: "panel chart-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Faixas de inatividade" }), _jsxs("h3", { className: "header-with-info", children: ["Onde esta o risco de parada", _jsx(InfoHint, { text: "As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias." })] })] }) }), _jsx("p", { className: "panel-subcopy", children: "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias." }), _jsxs("div", { className: "status-guide-grid", children: [_jsxs("div", { className: "status-guide-card is-active", children: [_jsx("strong", { children: "Ativo" }), _jsx("span", { children: "Ate 30 dias sem comprar" })] }), _jsxs("div", { className: "status-guide-card is-attention", children: [_jsx("strong", { children: "Atencao" }), _jsx("span", { children: "De 31 a 89 dias sem comprar" })] }), _jsxs("div", { className: "status-guide-card is-inactive", children: [_jsx("strong", { children: "Inativo" }), _jsx("span", { children: "90 dias ou mais sem comprar" })] })] }), _jsx("div", { className: "chart-wrap", children: _jsx(ResponsiveContainer, { width: "100%", height: 280, children: _jsxs(BarChart, { data: metrics.inactivityBuckets, onClick: (state) => {
                                            const label = state?.activeLabel;
                                            if (!label || !(label in bucketFilters)) {
                                                return;
                                            }
                                            setSelectedBucket((current) => (current === label ? null : label));
                                        }, margin: { top: 12, right: 8, left: 0, bottom: 0 }, children: [_jsx(XAxis, { dataKey: "label", stroke: "#5f6f95" }), _jsx(Tooltip, { content: _jsx(InactivityTooltip, {}), cursor: { fill: "rgba(41, 86, 215, 0.04)" } }), _jsx(Bar, { dataKey: "count", radius: [8, 8, 0, 0], cursor: "pointer", children: metrics.inactivityBuckets.map((bucket) => (_jsx(Cell, { fill: bucketColor(bucket.label, selectedBucket === bucket.label) }, bucket.label))) })] }) }) }), selectedBucket ? (_jsxs("div", { className: "inline-actions", children: [_jsxs("span", { className: "tag", children: ["Filtro ativo: ", selectedBucket] }), _jsx("button", { className: "ghost-button", type: "button", onClick: () => setSelectedBucket(null), children: "Limpar filtro" })] })) : null] }), _jsxs("article", { className: "panel insight-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Agenda de hoje" }), _jsxs("h3", { children: [metrics.dailyAgendaCount, " clientes pedem contato agora"] }), _jsx("p", { className: "panel-subcopy", children: "Fila pronta para a vendedora agir sem sair da tela inicial." })] }), _jsx(Link, { className: "ghost-button", to: "/agenda", children: "Ver agenda completa" })] }), agendaQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Montando fila de contato..." }) : null, agendaQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar a agenda de hoje." }) : null, !agendaQuery.isLoading && !agendaQuery.isError ? (agendaItems.length ? (_jsx("div", { className: "stack-list agenda-scroll-list", children: agendaItems.map((customer) => (_jsx(ContactQueueCard, { item: customer, compact: true }, customer.id))) })) : (_jsx("div", { className: "empty-state", children: "Nenhum cliente precisa de contato imediato neste momento." }))) : null] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: selectedBucket ? "Clientes filtrados pelo grafico" : "Fila por prioridade" }), _jsx("h3", { children: selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes para o time abordar agora" }), _jsx("p", { className: "panel-subcopy", children: selectedBucket
                                        ? "A selecao do grafico mostra apenas clientes da faixa escolhida."
                                        : "Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras." })] }) }), tableQueryLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes priorizados..." }) : null, tableQueryError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar essa lista de clientes." }) : null, !tableQueryLoading && !tableQueryError ? _jsx(CustomerTable, { customers: tableCustomers }) : null] })] }));
}

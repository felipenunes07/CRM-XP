import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CircleHelp, FilterX, LayoutDashboard, ShieldAlert, Target, } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsFilters } from "../components/events/EventsFilters";
import { EventsListView } from "../components/events/EventsListView";
import { EventsSummaryPanel } from "../components/events/EventsSummaryPanel";
import { SentimentTrendChart } from "../components/events/SentimentTrendChart";
export function EventsPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [filters, setFilters] = useState({
        page: 1,
        pageSize: 20,
        isGroup: false,
    });
    const [dateRange, setDateRange] = useState({
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        to: new Date().toISOString().split("T")[0],
    });
    const metricsQuery = useQuery({
        queryKey: ["events-metrics", dateRange, filters.isGroup],
        queryFn: () => api.getEventsMetrics(token, { dateFrom: dateRange.from, dateTo: dateRange.to, isGroup: filters.isGroup }),
        enabled: Boolean(token),
    });
    const eventsQuery = useQuery({
        queryKey: ["events-list", filters, dateRange],
        queryFn: () => api.listEvents(token, { ...filters, dateFrom: dateRange.from, dateTo: dateRange.to }, { page: filters.page, pageSize: filters.pageSize }),
        enabled: Boolean(token),
    });
    const sentimentQuery = useQuery({
        queryKey: ["daily-sentiments", dateRange],
        queryFn: () => api.getDailySentiments(token, dateRange),
        enabled: Boolean(token),
    });
    const resolveMutation = useMutation({
        mutationFn: ({ id, note }) => api.resolveEvent(token, id, { resolutionNote: note }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["events-list"] });
            queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
        },
    });
    const executiveSummaryText = useMemo(() => {
        const executive = metricsQuery.data?.executiveSummary;
        if (!executive)
            return null;
        return [
            `${executive.complaintsCount} reclamacoes (${executive.vipComplaintsCount} VIP)`,
            `${executive.opportunitiesCount} oportunidades comerciais`,
            `${executive.questionCount} duvidas acionaveis`,
            `${executive.filteredNoiseCount} mensagens neutras filtradas`,
        ].join(" | ");
    }, [metricsQuery.data]);
    const handleResolve = (event) => {
        const note = prompt("Deseja adicionar uma nota de resolucao?", "Resolvido via atendimento.");
        if (note !== null) {
            resolveMutation.mutate({ id: event.id, note });
        }
    };
    const handleViewConversation = (dealId) => {
        navigate(`/mensagens?dealId=${dealId}`);
    };
    const metrics = metricsQuery.data;
    const executive = metrics?.executiveSummary;
    return (_jsxs("div", { className: "wa-events-page", children: [_jsxs("header", { className: "wa-page-header", children: [_jsxs("div", { className: "wa-header-content", children: [_jsxs("div", { className: "wa-title-row", children: [_jsx(ShieldAlert, { size: 28, className: "text-primary" }), _jsx("h1", { children: "Inteligencia de Mensagens" })] }), _jsx("p", { children: "Risco, oportunidade e sentimento sem misturar ruido operacional com reclamacao." })] }), _jsx("div", { className: "wa-header-actions", children: _jsxs("div", { className: "wa-date-picker-simple", children: [_jsx("input", { type: "date", value: dateRange.from, onChange: (event) => setDateRange((prev) => ({ ...prev, from: event.target.value })) }), _jsx("span", { children: "ate" }), _jsx("input", { type: "date", value: dateRange.to, onChange: (event) => setDateRange((prev) => ({ ...prev, to: event.target.value })) })] }) })] }), _jsxs("div", { className: "wa-events-content", children: [executive && executiveSummaryText && (_jsxs("div", { className: "wa-executive-summary-banner", children: [_jsxs("div", { className: "wa-executive-summary-title", children: [_jsx(LayoutDashboard, { size: 20 }), _jsx("span", { children: "Resumo Executivo para Gestao" })] }), _jsxs("p", { children: [executiveSummaryText, ". ", executive.unansweredOpportunitiesCount, " oportunidades estao sem resposta ha mais de 2h.", executive.bottleneckAgentText && (_jsxs("strong", { children: [" ", executive.bottleneckAgentText] }))] }), _jsxs("div", { className: "wa-executive-insights", children: [_jsxs("span", { children: [_jsx(AlertTriangle, { size: 15 }), executive.actionRequiredEvents, " acoes pendentes"] }), _jsxs("span", { children: [_jsx(Target, { size: 15 }), executive.opportunitiesCount, " oportunidades"] }), _jsxs("span", { children: [_jsx(CircleHelp, { size: 15 }), executive.questionCount, " duvidas"] }), _jsxs("span", { children: [_jsx(FilterX, { size: 15 }), executive.filteredNoiseCount, " filtradas"] })] })] })), _jsx("section", { className: "wa-section metrics", children: _jsx(EventsSummaryPanel, { metrics: metrics || null }) }), _jsxs("div", { className: "wa-dashboard-grid", children: [_jsx("section", { className: "wa-section chart-card", children: _jsx(SentimentTrendChart, { data: sentimentQuery.data || [] }) }), _jsxs("section", { className: "wa-section list-card", children: [_jsxs("div", { className: "wa-card-header", children: [_jsxs("div", { className: "wa-card-title", children: [_jsx(Bell, { size: 20 }), _jsx("h2", { children: "Eventos Recentes" })] }), _jsx(EventsFilters, { filters: filters, onChange: setFilters })] }), _jsx(EventsListView, { events: eventsQuery.data?.events || [], onResolve: handleResolve, onViewConversation: handleViewConversation }), eventsQuery.data && eventsQuery.data.total > filters.pageSize && (_jsxs("div", { className: "wa-pagination", children: [_jsx("button", { disabled: filters.page === 1, onClick: () => setFilters((current) => ({ ...current, page: current.page - 1 })), children: "Anterior" }), _jsxs("span", { children: ["Pagina ", filters.page] }), _jsx("button", { disabled: eventsQuery.data.events.length < filters.pageSize, onClick: () => setFilters((current) => ({ ...current, page: current.page + 1 })), children: "Proxima" })] }))] })] })] })] }));
}

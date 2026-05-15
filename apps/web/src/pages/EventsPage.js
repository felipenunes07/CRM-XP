import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsSummaryPanel } from "../components/events/EventsSummaryPanel";
import { SentimentTrendChart } from "../components/events/SentimentTrendChart";
import { EventsListView } from "../components/events/EventsListView";
import { EventsFilters } from "../components/events/EventsFilters";
export function EventsPage() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [filters, setFilters] = useState({
        page: 1,
        pageSize: 20
    });
    const [dateRange, setDateRange] = useState({
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
    });
    const metricsQuery = useQuery({
        queryKey: ["events-metrics", dateRange],
        queryFn: () => api.getEventsMetrics(token, dateRange),
        enabled: Boolean(token)
    });
    const eventsQuery = useQuery({
        queryKey: ["events-list", filters],
        queryFn: () => api.listEvents(token, filters, { page: filters.page, pageSize: filters.pageSize }),
        enabled: Boolean(token)
    });
    const sentimentQuery = useQuery({
        queryKey: ["daily-sentiments", dateRange],
        queryFn: () => api.getDailySentiments(token, dateRange),
        enabled: Boolean(token)
    });
    const resolveMutation = useMutation({
        mutationFn: ({ id, note }) => api.resolveEvent(token, id, { resolutionNote: note }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["events-list"] });
            queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
        }
    });
    const handleResolve = (event) => {
        const note = prompt("Deseja adicionar uma nota de resolução?", "Resolvido via atendimento.");
        if (note !== null) {
            resolveMutation.mutate({ id: event.id, note });
        }
    };
    const handleViewConversation = (dealId) => {
        navigate(`/mensagens?dealId=${dealId}`);
    };
    return (_jsxs("div", { className: "wa-events-page", children: [_jsxs("header", { className: "wa-page-header", children: [_jsxs("div", { className: "wa-header-content", children: [_jsxs("div", { className: "wa-title-row", children: [_jsx(ShieldAlert, { size: 28, className: "text-primary" }), _jsx("h1", { children: "Intelig\u00EAncia de Mensagens" })] }), _jsx("p", { children: "Monitoramento anal\u00EDtico de riscos, sentimentos e performance operacional" })] }), _jsx("div", { className: "wa-header-actions", children: _jsxs("div", { className: "wa-date-picker-simple", children: [_jsx("input", { type: "date", value: dateRange.from, onChange: (e) => setDateRange(prev => ({ ...prev, from: e.target.value })) }), _jsx("span", { children: "at\u00E9" }), _jsx("input", { type: "date", value: dateRange.to, onChange: (e) => setDateRange(prev => ({ ...prev, to: e.target.value })) })] }) })] }), _jsxs("div", { className: "wa-events-content", children: [_jsx("section", { className: "wa-section metrics", children: _jsx(EventsSummaryPanel, { metrics: metricsQuery.data || null }) }), _jsxs("div", { className: "wa-dashboard-grid", children: [_jsx("section", { className: "wa-section chart-card", children: _jsx(SentimentTrendChart, { data: sentimentQuery.data || [] }) }), _jsxs("section", { className: "wa-section list-card", children: [_jsxs("div", { className: "wa-card-header", children: [_jsxs("div", { className: "wa-card-title", children: [_jsx(Bell, { size: 20 }), _jsx("h2", { children: "Eventos Recentes" })] }), _jsx(EventsFilters, { filters: filters, onChange: setFilters })] }), _jsx(EventsListView, { events: eventsQuery.data?.events || [], onResolve: handleResolve, onViewConversation: handleViewConversation }), eventsQuery.data && eventsQuery.data.total > filters.pageSize && (_jsxs("div", { className: "wa-pagination", children: [_jsx("button", { disabled: filters.page === 1, onClick: () => setFilters((f) => ({ ...f, page: f.page - 1 })), children: "Anterior" }), _jsxs("span", { children: ["P\u00E1gina ", filters.page] }), _jsx("button", { disabled: eventsQuery.data.events.length < filters.pageSize, onClick: () => setFilters((f) => ({ ...f, page: f.page + 1 })), children: "Pr\u00F3xima" })] }))] })] })] })] }));
}

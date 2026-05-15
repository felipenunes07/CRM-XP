import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  CircleHelp,
  FilterX,
  LayoutDashboard,
  ShieldAlert,
  Target,
} from "lucide-react";
import type { MessageEvent } from "@olist-crm/shared";
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
  const [filters, setFilters] = useState<Record<string, any>>({
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
    queryFn: () => api.getEventsMetrics(token!, { dateFrom: dateRange.from, dateTo: dateRange.to, isGroup: filters.isGroup }),
    enabled: Boolean(token),
  });

  const eventsQuery = useQuery({
    queryKey: ["events-list", filters, dateRange],
    queryFn: () => api.listEvents(token!, { ...filters, dateFrom: dateRange.from, dateTo: dateRange.to }, { page: filters.page, pageSize: filters.pageSize }),
    enabled: Boolean(token),
  });

  const sentimentQuery = useQuery({
    queryKey: ["daily-sentiments", dateRange],
    queryFn: () => api.getDailySentiments(token!, dateRange),
    enabled: Boolean(token),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.resolveEvent(token!, id, { resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-list"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
    },
  });

  const executiveSummaryText = useMemo(() => {
    const executive = metricsQuery.data?.executiveSummary;
    if (!executive) return null;

    return [
      `${executive.complaintsCount} reclamacoes (${executive.vipComplaintsCount} VIP)`,
      `${executive.opportunitiesCount} oportunidades comerciais`,
      `${executive.questionCount} duvidas acionaveis`,
      `${executive.filteredNoiseCount} mensagens neutras filtradas`,
    ].join(" | ");
  }, [metricsQuery.data]);

  const handleResolve = (event: MessageEvent) => {
    const note = prompt("Deseja adicionar uma nota de resolucao?", "Resolvido via atendimento.");
    if (note !== null) {
      resolveMutation.mutate({ id: event.id, note });
    }
  };

  const handleViewConversation = (dealId: string) => {
    navigate(`/mensagens?dealId=${dealId}`);
  };

  const metrics = metricsQuery.data;
  const executive = metrics?.executiveSummary;

  return (
    <div className="wa-events-page">
      <header className="wa-page-header">
        <div className="wa-header-content">
          <div className="wa-title-row">
            <ShieldAlert size={28} className="text-primary" />
            <h1>Inteligencia de Mensagens</h1>
          </div>
          <p>Risco, oportunidade e sentimento sem misturar ruido operacional com reclamacao.</p>
        </div>

        <div className="wa-header-actions">
          <div className="wa-date-picker-simple">
            <input
              type="date"
              value={dateRange.from}
              onChange={(event) => setDateRange((prev) => ({ ...prev, from: event.target.value }))}
            />
            <span>ate</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(event) => setDateRange((prev) => ({ ...prev, to: event.target.value }))}
            />
          </div>
        </div>
      </header>

      <div className="wa-events-content">
        {executive && executiveSummaryText && (
          <div className="wa-executive-summary-banner">
            <div className="wa-executive-summary-title">
              <LayoutDashboard size={20} />
              <span>Resumo Executivo para Gestao</span>
            </div>
            <p>
              {executiveSummaryText}. {executive.unansweredOpportunitiesCount} oportunidades estao sem resposta ha mais de 2h.
              {executive.bottleneckAgentText && (
                <strong> {executive.bottleneckAgentText}</strong>
              )}
            </p>
            <div className="wa-executive-insights">
              <span>
                <AlertTriangle size={15} />
                {executive.actionRequiredEvents} acoes pendentes
              </span>
              <span>
                <Target size={15} />
                {executive.opportunitiesCount} oportunidades
              </span>
              <span>
                <CircleHelp size={15} />
                {executive.questionCount} duvidas
              </span>
              <span>
                <FilterX size={15} />
                {executive.filteredNoiseCount} filtradas
              </span>
            </div>
          </div>
        )}

        <section className="wa-section metrics">
          <EventsSummaryPanel metrics={metrics || null} />
        </section>

        <div className="wa-dashboard-grid">
          <section className="wa-section chart-card">
            <SentimentTrendChart data={sentimentQuery.data || []} />
          </section>

          <section className="wa-section list-card">
            <div className="wa-card-header">
              <div className="wa-card-title">
                <Bell size={20} />
                <h2>Eventos Recentes</h2>
              </div>
              <EventsFilters filters={filters} onChange={setFilters} />
            </div>

            <EventsListView
              events={eventsQuery.data?.events || []}
              onResolve={handleResolve}
              onViewConversation={handleViewConversation}
            />

            {eventsQuery.data && eventsQuery.data.total > filters.pageSize && (
              <div className="wa-pagination">
                <button
                  disabled={filters.page === 1}
                  onClick={() => setFilters((current: Record<string, any>) => ({ ...current, page: current.page - 1 }))}
                >
                  Anterior
                </button>
                <span>Pagina {filters.page}</span>
                <button
                  disabled={eventsQuery.data.events.length < filters.pageSize}
                  onClick={() => setFilters((current: Record<string, any>) => ({ ...current, page: current.page + 1 }))}
                >
                  Proxima
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

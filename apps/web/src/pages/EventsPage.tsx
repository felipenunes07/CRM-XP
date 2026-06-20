import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import type { MessageEvent } from "@olist-crm/shared";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsSummaryPanel } from "../components/events/EventsSummaryPanel";
import { SentimentTrendChart } from "../components/events/SentimentTrendChart";
import { EventsListView } from "../components/events/EventsListView";
import { EventsFilters } from "../components/events/EventsFilters";

function formatBatchTime(value: string | null | undefined) {
  if (!value) return "Aguardando primeiro lote comercial";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EventsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, any>>({
    page: 1,
    pageSize: 20,
  });

  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const metricsQuery = useQuery({
    queryKey: ["events-metrics", dateRange, filters.isGroup],
    queryFn: () => api.getEventsMetrics(token!, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      isGroup: filters.isGroup,
    }),
    enabled: Boolean(token),
  });

  const intelligenceQuery = useQuery({
    queryKey: ["events-intelligence", dateRange, filters.isGroup],
    queryFn: () => api.getEventsIntelligence(token!, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      isGroup: filters.isGroup,
    }),
    enabled: Boolean(token),
  });

  const eventsQuery = useQuery({
    queryKey: ["events-list", filters, dateRange],
    queryFn: () => api.listEvents(
      token!,
      { ...filters, dateFrom: dateRange.from, dateTo: dateRange.to },
      { page: filters.page, pageSize: filters.pageSize },
    ),
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
      queryClient.invalidateQueries({ queryKey: ["events-intelligence"] });
    },
  });

  const handleResolve = (event: MessageEvent) => {
    const note = prompt("Deseja adicionar uma nota de resolucao?", "Resolvido via atendimento.");
    if (note !== null) {
      resolveMutation.mutate({ id: event.id, note });
    }
  };

  const handleViewConversation = (dealId: string) => {
    navigate(`/mensagens?dealId=${dealId}`);
  };

  const intelligence = intelligenceQuery.data;
  const aiBatch = intelligence?.aiBatch;
  const latestAiSummary = aiBatch?.latestBatch?.summary;
  const aiExecutiveText = typeof latestAiSummary?.resumoExecutivo === "string"
    ? latestAiSummary.resumoExecutivo
    : null;

  return (
    <div className="wa-events-page">
      <header className="wa-page-header">
        <div className="wa-header-content">
          <div className="wa-title-row">
            <ShieldAlert size={28} className="text-primary" />
            <h1>Inteligencia de Mensagens</h1>
          </div>
          <p>Guia operacional para riscos, elogios, gargalos, estoque e sinais comerciais.</p>
        </div>

        <div className="wa-header-actions">
          <div className="wa-date-picker-simple">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
            />
            <span>ate</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>
        </div>
      </header>

      <div className="wa-events-content">
        {intelligence && (
          <section className="wa-intelligence-command">
            <div className="wa-command-main">
              <div className="wa-command-title">
                <LayoutDashboard size={20} />
                <span>Resumo executivo</span>
              </div>
              <p>{aiExecutiveText || intelligence.executiveSummary}</p>
              <div className="wa-command-stats">
                <span><AlertTriangle size={16} /> {intelligence.summary.criticalOpen} criticos abertos</span>
                <span><ThumbsDown size={16} /> {intelligence.summary.negativeSignals} sinais negativos</span>
                <span><ThumbsUp size={16} /> {intelligence.summary.positiveSignals} sinais positivos</span>
                <span><PackageSearch size={16} /> {intelligence.summary.opportunities} oportunidades</span>
              </div>
            </div>

            <div className="wa-command-side">
              <div className="wa-ai-status">
                <Sparkles size={18} />
                <div>
                  <strong>IA em lote</strong>
                  <span>
                    {aiBatch?.enabled
                      ? aiBatch.latestBatch?.finishedAt
                        ? `Ultimo lote: ${formatBatchTime(aiBatch.latestBatch.finishedAt)}`
                        : "Aguardando horario comercial"
                      : "Desligada ate configurar chave"}
                  </span>
                </div>
              </div>
              <div className="wa-source-split">
                <span><Users size={16} /> Grupos: {intelligence.sourceSplit.groups}</span>
                <span><MessageSquare size={16} /> Privado: {intelligence.sourceSplit.private}</span>
              </div>
            </div>
          </section>
        )}

        <section className="wa-section metrics">
          <EventsSummaryPanel metrics={metricsQuery.data || null} />
        </section>

        {intelligence && (
          <div className="wa-insight-grid">
            <section className="wa-section wa-themes-panel">
              <div className="wa-card-header compact">
                <div className="wa-card-title">
                  <PackageSearch size={20} />
                  <h2>Temas em alta</h2>
                </div>
              </div>
              <div className="wa-theme-list">
                {intelligence.topThemes.slice(0, 5).map((theme) => (
                  <article key={theme.key} className={`wa-theme-row ${theme.category}`}>
                    <div>
                      <strong>{theme.title}</strong>
                      <span>{theme.count} ocorrencias - {theme.unresolvedCount} abertas - {theme.groupCount} em grupos</span>
                    </div>
                    <small>{theme.severity}</small>
                  </article>
                ))}
                {intelligence.topThemes.length === 0 && (
                  <p className="wa-panel-empty">Nenhum tema recorrente encontrado neste periodo.</p>
                )}
              </div>
            </section>

            <section className="wa-section wa-alerts-panel">
              <div className="wa-card-header compact">
                <div className="wa-card-title">
                  <AlertTriangle size={20} />
                  <h2>Alertas de atencao</h2>
                </div>
              </div>
              <div className="wa-alert-list">
                {intelligence.criticalAlerts.slice(0, 4).map((alert) => (
                  <article key={alert.eventId} className={`wa-alert-row ${alert.severity.toLowerCase()}`}>
                    <strong>{alert.title}</strong>
                    <p>{alert.content}</p>
                    <span>{alert.contactName} - {alert.agentName || "Sem agente"}</span>
                  </article>
                ))}
                {intelligence.criticalAlerts.length === 0 && (
                  <p className="wa-panel-empty">Nenhum alerta alto aberto no periodo.</p>
                )}
              </div>
            </section>
          </div>
        )}

        <div className="wa-dashboard-grid">
          <section className="wa-section chart-card">
            <SentimentTrendChart data={sentimentQuery.data || []} />
          </section>

          <section className="wa-section list-card">
            <div className="wa-card-header">
              <div className="wa-card-title">
                <Bell size={20} />
                <h2>Eventos recentes</h2>
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
                  onClick={() => setFilters((f: Record<string, any>) => ({ ...f, page: f.page - 1 }))}
                >
                  Anterior
                </button>
                <span>Pagina {filters.page}</span>
                <button
                  disabled={eventsQuery.data.events.length < filters.pageSize}
                  onClick={() => setFilters((f: Record<string, any>) => ({ ...f, page: f.page + 1 }))}
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

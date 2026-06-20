import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Filter,
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
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

function toDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatBatchTime(value: string | null | undefined) {
  if (!value) return "Nenhum lote executado";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBlockedReason(reason: string | null | undefined) {
  switch (reason) {
    case "disabled":
      return "IA desligada";
    case "missing_api_key":
      return "Chave nao configurada";
    case "outside_business_hours":
      return "Fora do horario comercial";
    case "cadence_wait":
      return "Aguardando proximo lote";
    case "daily_request_cap":
      return "Limite diario de chamadas";
    case "daily_token_cap":
      return "Limite diario de tokens";
    default:
      return "Pronto para rodar";
  }
}

function formatManualResult(result: { status: string; reason?: string; eventCount?: number }) {
  if (result.status === "SUCCEEDED") {
    return `Lote concluido com ${result.eventCount ?? 0} eventos analisados.`;
  }
  if (result.status === "SKIPPED") {
    return `Lote nao executado: ${formatBlockedReason(result.reason)}.`;
  }
  return "Lote falhou. Verifique a chave ou tente novamente no horario comercial.";
}

export function EventsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Record<string, any>>({
    page: 1,
    pageSize: 20,
  });
  const [manualBatchMessage, setManualBatchMessage] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState({
    from: toDateInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    to: toDateInput(new Date()),
  });

  const scopedFilters = useMemo(() => ({
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    eventType: filters.eventType,
    severity: filters.severity,
    resolved: filters.resolved,
    search: filters.search,
    isGroup: filters.isGroup,
  }), [
    dateRange.from,
    dateRange.to,
    filters.eventType,
    filters.severity,
    filters.resolved,
    filters.search,
    filters.isGroup,
  ]);

  const metricsQuery = useQuery({
    queryKey: ["events-metrics", scopedFilters],
    queryFn: () => api.getEventsMetrics(token!, scopedFilters),
    enabled: Boolean(token),
  });

  const intelligenceQuery = useQuery({
    queryKey: ["events-intelligence", scopedFilters],
    queryFn: () => api.getEventsIntelligence(token!, scopedFilters),
    enabled: Boolean(token),
  });

  const eventsQuery = useQuery({
    queryKey: ["events-list", scopedFilters, filters.page, filters.pageSize],
    queryFn: () => api.listEvents(
      token!,
      scopedFilters,
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

  const aiBatchMutation = useMutation({
    mutationFn: () => api.runEventsAiBatch(token!),
    onSuccess: (result) => {
      setManualBatchMessage(formatManualResult(result));
      queryClient.invalidateQueries({ queryKey: ["events-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
    },
    onError: (error) => {
      setManualBatchMessage(error instanceof Error ? error.message : "Nao foi possivel executar o lote.");
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

  const setPresetDays = (days: number) => {
    setDateRange({
      from: toDateInput(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)),
      to: toDateInput(new Date()),
    });
    setFilters((current) => ({ ...current, page: 1 }));
  };

  const intelligence = intelligenceQuery.data;
  const aiBatch = intelligence?.aiBatch;
  const latestAiSummary = aiBatch?.latestBatch?.summary;
  const aiExecutiveText = typeof latestAiSummary?.resumoExecutivo === "string"
    ? latestAiSummary.resumoExecutivo
    : null;
  const visibleTotal = eventsQuery.data?.total ?? intelligence?.summary.totalEvents ?? 0;
  const canRunManualBatch = Boolean(aiBatch?.enabled && aiBatch.canRunManually && !aiBatchMutation.isPending);

  return (
    <div className="wa-events-page">
      <header className="wa-page-header">
        <div className="wa-header-content">
          <div className="wa-title-row">
            <ShieldAlert size={28} className="text-primary" />
            <h1>Inteligencia de Mensagens</h1>
          </div>
          <p>Resumo unico para grupos, privados, reclamacoes, oportunidades e gargalos.</p>
        </div>

        <div className="wa-header-actions">
          <div className="wa-period-presets" aria-label="Atalhos de periodo">
            <button type="button" onClick={() => setPresetDays(1)}>Hoje</button>
            <button type="button" onClick={() => setPresetDays(7)}>7 dias</button>
            <button type="button" onClick={() => setPresetDays(30)}>30 dias</button>
          </div>
          <div className="wa-date-picker-simple">
            <input
              type="date"
              value={dateRange.from}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, from: event.target.value }));
                setFilters((current) => ({ ...current, page: 1 }));
              }}
            />
            <span>ate</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, to: event.target.value }));
                setFilters((current) => ({ ...current, page: 1 }));
              }}
            />
          </div>
        </div>
      </header>

      <div className="wa-events-content">
        <section className="wa-command-center" aria-label="Resumo operacional">
          <div className="wa-command-summary">
            <div className="wa-command-title">
              <LayoutDashboard size={20} />
              <span>Resumo do periodo</span>
            </div>
            <p>{aiExecutiveText || intelligence?.executiveSummary || "Carregando resumo dos eventos filtrados..."}</p>
            <div className="wa-command-stats">
              <span><Filter size={16} /> {visibleTotal} eventos unicos</span>
              <span><AlertTriangle size={16} /> {intelligence?.summary.criticalOpen ?? 0} criticos abertos</span>
              <span><ThumbsDown size={16} /> {intelligence?.summary.negativeSignals ?? 0} negativos</span>
              <span><ThumbsUp size={16} /> {intelligence?.summary.positiveSignals ?? 0} positivos</span>
              <span><PackageSearch size={16} /> {intelligence?.summary.opportunities ?? 0} oportunidades</span>
            </div>
          </div>

          <div className="wa-next-actions">
            <div className="wa-command-title">
              <Bell size={20} />
              <span>Onde agir agora</span>
            </div>
            {intelligence?.criticalAlerts.length ? (
              intelligence.criticalAlerts.slice(0, 3).map((alert) => (
                <article
                  key={alert.eventId}
                  className={`wa-action-alert ${alert.severity.toLowerCase()}`}
                >
                  <strong>{alert.title}</strong>
                  <span>{alert.content}</span>
                </article>
              ))
            ) : (
              <div className="wa-action-empty">
                <CheckCircle2 size={18} />
                Nenhum alerta alto aberto no filtro atual.
              </div>
            )}
          </div>

          <div className="wa-ai-control">
            <div className="wa-ai-status">
              <Bot size={20} />
              <div>
                <strong>IA em lote</strong>
                <span>{formatBatchTime(aiBatch?.latestBatch?.finishedAt)}</span>
              </div>
            </div>
            <div className="wa-ai-meta">
              <span><Clock size={15} /> {formatBlockedReason(aiBatch?.manualBlockedReason)}</span>
              <span><Users size={15} /> Grupos: {intelligence?.sourceSplit.groups ?? 0}</span>
              <span><MessageSquare size={15} /> Privado: {intelligence?.sourceSplit.private ?? 0}</span>
            </div>
            <button
              type="button"
              className="wa-run-ai-button"
              disabled={!canRunManualBatch}
              onClick={() => aiBatchMutation.mutate()}
              title={formatBlockedReason(aiBatch?.manualBlockedReason)}
            >
              {aiBatchMutation.isPending ? <RefreshCw size={18} className="spin" /> : <PlayCircle size={18} />}
              Rodar IA agora
            </button>
            {manualBatchMessage && <p className="wa-ai-message">{manualBatchMessage}</p>}
          </div>
        </section>

        <section className="wa-section metrics">
          <EventsSummaryPanel metrics={metricsQuery.data || null} />
        </section>

        {intelligence && (
          <div className="wa-insight-grid">
            <section className="wa-section wa-themes-panel">
              <div className="wa-card-header compact">
                <div className="wa-card-title">
                  <PackageSearch size={20} />
                  <h2>Temas que estao se repetindo</h2>
                </div>
              </div>
              <div className="wa-theme-list">
                {intelligence.topThemes.slice(0, 5).map((theme) => (
                  <article key={theme.key} className={`wa-theme-row ${theme.category}`}>
                    <div>
                      <strong>{theme.title}</strong>
                      <span>{theme.count} ocorrencias unicas - {theme.unresolvedCount} abertas - {theme.groupCount} em grupos</span>
                      {theme.examples[0] && <p>{theme.examples[0].content}</p>}
                    </div>
                    <small>{theme.severity}</small>
                  </article>
                ))}
                {intelligence.topThemes.length === 0 && (
                  <p className="wa-panel-empty">Nenhum tema recorrente encontrado neste periodo.</p>
                )}
              </div>
            </section>

            <section className="wa-section chart-card">
              <SentimentTrendChart data={sentimentQuery.data || []} />
            </section>
          </div>
        )}

        <section className="wa-section list-card">
          <div className="wa-card-header events-workspace">
            <div className="wa-card-title">
              <Bell size={20} />
              <div>
                <h2>Eventos para revisar</h2>
                <span>{visibleTotal} eventos unicos no escopo atual</span>
              </div>
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
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Smartphone,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";
import type {
  MessageEvent,
  MessageInsightExample,
  MessageInsightTheme,
  WhatsappMonitorConversationDetail,
  WhatsappMonitorMessage,
} from "@olist-crm/shared";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsSummaryPanel, type EventsScopePatch } from "../components/events/EventsSummaryPanel";
import { EventsListView } from "../components/events/EventsListView";
import { EventsFilters, type EventFilterShortcut, type EventsFilterState } from "../components/events/EventsFilters";
import { MiniChatDrawer, type MiniChatMessage } from "../components/MiniChatDrawer";

interface ConversationSeed {
  dealId: string;
  content: string;
  detectedAt: string;
  contactName: string;
  contactPhone?: string;
  agentName?: string | null;
  isGroup?: boolean;
}

interface ChatState {
  open: boolean;
  loading: boolean;
  recipientId: string;
  customerName: string;
  customerPhone: string;
  jid: string;
  messages: MiniChatMessage[];
}

const emptyChatState: ChatState = {
  open: false,
  loading: false,
  recipientId: "",
  customerName: "",
  customerPhone: "",
  jid: "",
  messages: [],
};

function toDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  return "Lote falhou. Verifique a chave, o modelo ou tente novamente.";
}

function fallbackMessages(seed: ConversationSeed): MiniChatMessage[] {
  return [{
    id: `event-${seed.dealId}-${seed.detectedAt}`,
    content: seed.content,
    direction: "INBOUND",
    timestamp: seed.detectedAt,
    senderName: seed.contactName,
  }];
}

function mapMonitorMessages(messages: WhatsappMonitorMessage[]): MiniChatMessage[] {
  return [...messages]
    .filter((message) => message.direction !== "SYSTEM" && message.content.trim())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((message) => ({
      id: message.id,
      content: message.content,
      direction: message.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
      timestamp: message.createdAt,
      senderName: message.senderName,
      senderAvatarUrl: message.senderProfilePictureUrl,
    }));
}

function buildChatState(seed: ConversationSeed, detail: WhatsappMonitorConversationDetail | null, loading: boolean): ChatState {
  const mappedMessages = detail ? mapMonitorMessages(detail.messages) : [];
  const name = detail?.contactName || detail?.title || seed.contactName || "Conversa";
  const phone = detail?.contactPhone || seed.contactPhone || "";
  const jid = detail?.remoteJid || (seed.isGroup ? "Grupo" : "");

  return {
    open: true,
    loading,
    recipientId: detail?.id || seed.dealId,
    customerName: name,
    customerPhone: phone,
    jid,
    messages: mappedMessages.length > 0 ? mappedMessages : fallbackMessages(seed),
  };
}

function themeFilterPatch(theme: MessageInsightTheme): EventsScopePatch {
  switch (theme.key) {
    case "stock_shortage":
      return { search: "estoque", resolved: "false" };
    case "screen_quality":
      return { search: "tela", resolved: "false" };
    case "delivery_delay":
      return { search: "entrega", resolved: "false" };
    case "service_delay":
      return { search: "atendimento", resolved: "false" };
    case "price_objection":
      return { search: "preco", resolved: "false" };
    case "sales_demand":
      return { eventType: "SALES_OPPORTUNITY,QUESTION" };
    case "praise":
      return { eventType: "PRAISE,POSITIVE_FEEDBACK" };
    default:
      return theme.category === "positive"
        ? { eventType: "PRAISE,POSITIVE_FEEDBACK" }
        : { eventType: "COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,RISK,ESCALATION", resolved: "false" };
  }
}

function themeSummaryText(theme: MessageInsightTheme) {
  if (theme.category === "positive") {
    return `${theme.count} sinais positivos no periodo. Use os exemplos para entender o que esta sendo elogiado.`;
  }
  if (theme.category === "opportunity") {
    return `${theme.count} pedidos ou duvidas comerciais apareceram. Vale abrir as conversas para recuperar venda.`;
  }
  return `${theme.count} ocorrencias apareceram, com ${theme.unresolvedCount} ainda abertas. A prioridade vem dos casos em grupos e da severidade.`;
}

function seedFromEvent(event: MessageEvent): ConversationSeed {
  return {
    dealId: event.dealId,
    content: event.content,
    detectedAt: event.detectedAt,
    contactName: event.conversationContext?.contactName || "Cliente",
    contactPhone: event.conversationContext?.contactPhone || "",
    agentName: event.conversationContext?.agentName,
    isGroup: event.conversationContext?.isGroup,
  };
}

function seedFromExample(example: MessageInsightExample): ConversationSeed {
  return {
    dealId: example.dealId,
    content: example.content,
    detectedAt: example.detectedAt,
    contactName: example.contactName,
    agentName: example.agentName,
    isGroup: example.isGroup,
  };
}

export function EventsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<EventsFilterState>({
    page: 1,
    pageSize: 20,
  });
  const [manualBatchMessage, setManualBatchMessage] = useState<string | null>(null);
  const [selectedThemeKey, setSelectedThemeKey] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>(emptyChatState);

  const [dateRange, setDateRange] = useState({
    from: toDateInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    to: toDateInput(new Date()),
  });

  const overviewFilters = useMemo<Record<string, any>>(() => ({
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  }), [dateRange.from, dateRange.to]);

  const scopedFilters = useMemo<Record<string, any>>(() => ({
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

  const overviewMetricsQuery = useQuery({
    queryKey: ["events-metrics-overview", overviewFilters],
    queryFn: () => api.getEventsMetrics(token!, overviewFilters),
    enabled: Boolean(token),
  });

  const overviewIntelligenceQuery = useQuery({
    queryKey: ["events-intelligence-overview", overviewFilters],
    queryFn: () => api.getEventsIntelligence(token!, overviewFilters),
    enabled: Boolean(token),
  });

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
      { page: filters.page ?? 1, pageSize: filters.pageSize ?? 20 },
    ),
    enabled: Boolean(token),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.resolveEvent(token!, id, { resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-list"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics-overview"] });
      queryClient.invalidateQueries({ queryKey: ["events-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["events-intelligence-overview"] });
    },
  });

  const aiBatchMutation = useMutation({
    mutationFn: () => api.runEventsAiBatch(token!),
    onSuccess: (result) => {
      setManualBatchMessage(formatManualResult(result));
      queryClient.invalidateQueries({ queryKey: ["events-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["events-intelligence-overview"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["events-metrics-overview"] });
    },
    onError: (error) => {
      setManualBatchMessage(error instanceof Error ? error.message : "Nao foi possivel executar o lote.");
    },
  });

  const applyScopeFilter = (patch: EventsScopePatch) => {
    setFilters({
      page: 1,
      pageSize: filters.pageSize ?? 20,
      ...patch,
    });
  };

  const handleResolve = (event: MessageEvent) => {
    const note = prompt("Deseja adicionar uma nota de resolucao?", "Resolvido via atendimento.");
    if (note !== null) {
      resolveMutation.mutate({ id: event.id, note });
    }
  };

  const openConversation = async (seed: ConversationSeed) => {
    if (!token) return;

    setChatState(buildChatState(seed, null, true));

    try {
      const detail = await api.whatsappMonitorConversation(token, seed.dealId, { limit: 80 });
      setChatState(buildChatState(seed, detail, false));
    } catch {
      setChatState(buildChatState(seed, null, false));
    }
  };

  const setPresetDays = (days: number) => {
    setDateRange({
      from: toDateInput(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)),
      to: toDateInput(new Date()),
    });
    setFilters((current) => ({ ...current, page: 1 }));
  };

  const intelligence = intelligenceQuery.data;
  const overviewMetrics = overviewMetricsQuery.data;
  const overviewIntelligence = overviewIntelligenceQuery.data;
  const aiBatch = overviewIntelligence?.aiBatch ?? intelligence?.aiBatch;
  const latestAiSummary = aiBatch?.latestBatch?.summary;
  const aiExecutiveText = typeof latestAiSummary?.resumoExecutivo === "string"
    ? latestAiSummary.resumoExecutivo
    : null;
  const visibleTotal = eventsQuery.data?.total ?? intelligence?.summary.totalEvents ?? 0;
  const canRunManualBatch = Boolean(aiBatch?.enabled && aiBatch.canRunManually && !aiBatchMutation.isPending);

  const selectedTheme = useMemo(() => {
    if (!intelligence?.topThemes.length) return null;
    return intelligence.topThemes.find((theme) => theme.key === selectedThemeKey) ?? intelligence.topThemes[0];
  }, [intelligence?.topThemes, selectedThemeKey]);

  const shortcuts = useMemo<EventFilterShortcut[]>(() => {
    const summary = overviewMetrics?.summary;
    const groups = overviewIntelligence?.sourceSplit.groups ?? 0;
    const privateCount = overviewIntelligence?.sourceSplit.private ?? 0;
    const total = summary?.totalEvents ?? 0;
    const highRisk = (summary?.bySeverity?.CRITICAL || 0) + (summary?.bySeverity?.HIGH || 0);
    const complaints = (summary?.complaintsCount || 0) + (summary?.negativeFeedbacks || 0) + (summary?.riskEvents || 0);
    const opportunities = (summary?.opportunitiesCount || 0) + (summary?.questionCount || 0);

    return [
      { id: "all", label: "Tudo", count: total, patch: {}, tone: "neutral" },
      { id: "risk", label: "Criticos", count: highRisk, patch: { severity: "CRITICAL,HIGH", resolved: "false" }, tone: "danger" },
      { id: "complaints", label: "Reclamacoes", count: complaints, patch: { eventType: "COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,RISK,ESCALATION" }, tone: "warning" },
      { id: "sales", label: "Vendas", count: opportunities, patch: { eventType: "SALES_OPPORTUNITY,QUESTION" }, tone: "info" },
      { id: "pending", label: "Pendentes", count: summary?.unresolvedEvents || 0, patch: { resolved: "false" }, tone: "neutral" },
      { id: "groups", label: "Grupos", count: groups, patch: { isGroup: true }, tone: "neutral" },
      { id: "private", label: "Privado", count: privateCount, patch: { isGroup: false }, tone: "neutral" },
    ];
  }, [overviewMetrics, overviewIntelligence]);

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
            <p>{aiExecutiveText || intelligence?.executiveSummary || overviewIntelligence?.executiveSummary || "Carregando resumo dos eventos filtrados..."}</p>
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
              <span><Users size={15} /> Grupos: {overviewIntelligence?.sourceSplit.groups ?? 0}</span>
              <span><MessageSquare size={15} /> Privado: {overviewIntelligence?.sourceSplit.private ?? 0}</span>
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
          <EventsSummaryPanel metrics={overviewMetrics || null} onSelectScope={applyScopeFilter} />
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
                {intelligence.topThemes.slice(0, 6).map((theme) => (
                  <button
                    type="button"
                    key={theme.key}
                    className={`wa-theme-row ${theme.category} ${selectedTheme?.key === theme.key ? "active" : ""}`}
                    onClick={() => setSelectedThemeKey(theme.key)}
                  >
                    <div>
                      <strong>{theme.title}</strong>
                      <span>{theme.count} ocorrencias - {theme.unresolvedCount} abertas - {theme.groupCount} em grupos</span>
                      {theme.examples[0] && <p>{theme.examples[0].content}</p>}
                    </div>
                    <small>{theme.severity}</small>
                  </button>
                ))}
                {intelligence.topThemes.length === 0 && (
                  <p className="wa-panel-empty">Nenhum tema recorrente encontrado neste periodo.</p>
                )}
              </div>
            </section>

            <section className="wa-section wa-theme-detail-panel">
              {selectedTheme ? (
                <>
                  <div className="wa-card-header compact">
                    <div className="wa-card-title">
                      <Smartphone size={20} />
                      <div>
                        <h2>{selectedTheme.title}</h2>
                        <span>{selectedTheme.severity} - {selectedTheme.category}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="wa-theme-filter-button"
                      onClick={() => applyScopeFilter(themeFilterPatch(selectedTheme))}
                    >
                      <Filter size={16} />
                      Ver fila
                    </button>
                  </div>
                  <div className="wa-theme-detail-body">
                    <p className="wa-theme-summary">{themeSummaryText(selectedTheme)}</p>
                    <div className="wa-theme-detail-stats">
                      <span>{selectedTheme.count} total</span>
                      <span>{selectedTheme.unresolvedCount} abertas</span>
                      <span>{selectedTheme.groupCount} grupos</span>
                      <span>{selectedTheme.privateCount} privados</span>
                    </div>
                    <div className="wa-theme-examples">
                      {selectedTheme.examples.map((example) => (
                        <article key={`${example.eventId}-${example.dealId}`} className="wa-theme-example">
                          <div>
                            <strong>{example.contactName}</strong>
                            <span>{example.agentName || "Sem agente"} - {formatDateTime(example.detectedAt)}</span>
                          </div>
                          <p>{example.content}</p>
                          <button type="button" onClick={() => openConversation(seedFromExample(example))}>
                            <Smartphone size={15} />
                            Abrir celular
                          </button>
                        </article>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="wa-theme-detail-empty">
                  <PackageSearch size={34} />
                  <p>Nenhum tema selecionado no filtro atual.</p>
                </div>
              )}
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
            <EventsFilters filters={filters} shortcuts={shortcuts} onChange={setFilters} />
          </div>

          <EventsListView
            events={eventsQuery.data?.events || []}
            onResolve={handleResolve}
            onViewConversation={(event) => openConversation(seedFromEvent(event))}
          />

          {eventsQuery.data && eventsQuery.data.total > (filters.pageSize ?? 20) && (
            <div className="wa-pagination">
              <button
                disabled={(filters.page ?? 1) === 1}
                onClick={() => setFilters((current) => ({ ...current, page: (current.page ?? 1) - 1 }))}
              >
                Anterior
              </button>
              <span>Pagina {filters.page ?? 1}</span>
              <button
                disabled={eventsQuery.data.events.length < (filters.pageSize ?? 20)}
                onClick={() => setFilters((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
              >
                Proxima
              </button>
            </div>
          )}
        </section>
      </div>

      <MiniChatDrawer
        open={chatState.open}
        onClose={() => setChatState((current) => ({ ...current, open: false }))}
        recipientId={chatState.recipientId}
        customerName={chatState.customerName}
        customerPhone={chatState.customerPhone}
        jid={chatState.jid}
        messages={chatState.messages}
        loading={chatState.loading}
      />
    </div>
  );
}

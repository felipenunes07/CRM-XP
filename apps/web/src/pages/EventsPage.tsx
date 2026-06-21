import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  Filter,
  LayoutDashboard,
  PackageSearch,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type {
  MessageEvent,
  MessageInsightExample,
  MessageInsightTheme,
  WhatsappMonitorConversationDetail,
} from "@olist-crm/shared";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsSummaryPanel, type EventsScopePatch } from "../components/events/EventsSummaryPanel";
import { EventsListView } from "../components/events/EventsListView";
import { EventsFilters, type EventFilterShortcut, type EventsFilterState } from "../components/events/EventsFilters";
import { MiniChatDrawer, type MiniChatMessage } from "../components/MiniChatDrawer";
import { buildEventChatMessages, type EventConversationSeed } from "../lib/eventsChat";
import { buildAiBatchDisplay } from "../lib/eventsAiPanel";

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

function formatBatchPeriod(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return "Periodo nao registrado";
  return `${formatBatchTime(from)} ate ${formatBatchTime(to)}`;
}

function formatBatchStatus(status: string) {
  switch (status) {
    case "SUCCEEDED":
      return "Concluido";
    case "SKIPPED":
      return "Ignorado";
    case "FAILED":
      return "Falhou";
    default:
      return status;
  }
}

function formatRunSource(source: string | null | undefined) {
  return source === "manual" ? "Manual" : "Automatico";
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
    return `Lote manual concluido: ${result.eventCount ?? 0} eventos recentes foram analisados.`;
  }
  if (result.status === "SKIPPED") {
    return `Lote nao executado: ${formatBlockedReason(result.reason)}.`;
  }
  return "Lote falhou. Verifique a chave, o modelo ou tente novamente.";
}

function compactAiItem(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const title = [record.titulo, record.title, record.tema, record.nome]
      .find((entry) => typeof entry === "string" && entry.trim());
    const detail = [record.descricao, record.description, record.resumo, record.acao, record.action]
      .find((entry) => typeof entry === "string" && entry.trim());

    return [title, detail].filter(Boolean).join(" - ");
  }

  return "";
}

function readAiList(summary: Record<string, unknown> | null | undefined, key: string) {
  const value = summary?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(compactAiItem)
    .filter(Boolean)
    .slice(0, 5);
}

function buildAiSections(summary: Record<string, unknown> | null | undefined) {
  return [
    { title: "Alertas IA", items: readAiList(summary, "alertasCriticos") },
    { title: "Temas IA", items: readAiList(summary, "temasEmAlta") },
    { title: "Acoes IA", items: readAiList(summary, "acoesRecomendadas") },
    { title: "Gargalos IA", items: readAiList(summary, "gargalos") },
  ].filter((section) => section.items.length > 0);
}

function buildChatState(seed: EventConversationSeed, detail: WhatsappMonitorConversationDetail | null, loading: boolean): ChatState {
  const mappedMessages = buildEventChatMessages({
    seed,
    monitorMessages: detail?.messages ?? [],
  });
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
    messages: mappedMessages,
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
      return { eventType: "SALES_OPPORTUNITY" };
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

function formatThemeCategory(category: MessageInsightTheme["category"]) {
  switch (category) {
    case "negative":
      return "Problema";
    case "positive":
      return "Sinal positivo";
    case "opportunity":
      return "Oportunidade";
    case "risk":
      return "Risco";
    default:
      return category;
  }
}

function readStringMetadata(event: MessageEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function seedFromEvent(event: MessageEvent): EventConversationSeed {
  return {
    dealId: event.dealId,
    eventId: event.id,
    messageId: event.messageId,
    content: event.content,
    detectedAt: event.detectedAt,
    contactName: event.conversationContext?.contactName || "Cliente",
    contactPhone: event.conversationContext?.contactPhone || "",
    agentName: event.conversationContext?.agentName,
    isGroup: event.conversationContext?.isGroup,
    severity: event.severity,
    label: event.label,
    reason: readStringMetadata(event, "classificationReason"),
  };
}

function seedFromExample(example: MessageInsightExample, theme: MessageInsightTheme): EventConversationSeed {
  return {
    dealId: example.dealId,
    eventId: example.eventId,
    content: example.content,
    detectedAt: example.detectedAt,
    contactName: example.contactName,
    agentName: example.agentName,
    isGroup: example.isGroup,
    severity: theme.severity,
    label: theme.title,
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
    agentId: filters.agentId,
  }), [
    dateRange.from,
    dateRange.to,
    filters.eventType,
    filters.severity,
    filters.resolved,
    filters.search,
    filters.isGroup,
    filters.agentId,
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

  const openConversation = async (seed: EventConversationSeed) => {
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
  const aiSections = buildAiSections(latestAiSummary);
  const aiDisplay = buildAiBatchDisplay(aiBatch);
  const visibleTotal = eventsQuery.data?.total ?? intelligence?.summary.totalEvents ?? 0;
  const canRunManualBatch = Boolean(aiBatch?.enabled && aiBatch.canRunManually && !aiBatchMutation.isPending);

  const selectedTheme = useMemo(() => {
    if (!intelligence?.topThemes.length) return null;
    return intelligence.topThemes.find((theme) => theme.key === selectedThemeKey) ?? intelligence.topThemes[0];
  }, [intelligence?.topThemes, selectedThemeKey]);
  const visibleThemeExamples = selectedTheme?.examples.length ?? 0;

  const shortcuts = useMemo<EventFilterShortcut[]>(() => {
    const summary = overviewMetrics?.summary;
    const groups = overviewIntelligence?.sourceSplit.groups ?? 0;
    const privateCount = overviewIntelligence?.sourceSplit.private ?? 0;
    const total = summary?.totalEvents ?? 0;
    const highRisk = (summary?.bySeverity?.CRITICAL || 0) + (summary?.bySeverity?.HIGH || 0);
    const complaints = (summary?.complaintsCount || 0) + (summary?.negativeFeedbacks || 0) + (summary?.riskEvents || 0);
    const opportunities = summary?.opportunitiesCount || 0;

    return [
      { id: "all", label: "Tudo", count: total, patch: {}, tone: "neutral" },
      { id: "risk", label: "Criticos", count: highRisk, patch: { severity: "CRITICAL,HIGH", resolved: "false" }, tone: "danger" },
      { id: "complaints", label: "Reclamacoes", count: complaints, patch: { eventType: "COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,RISK,ESCALATION" }, tone: "warning" },
      { id: "sales", label: "Oportunidades", count: opportunities, patch: { eventType: "SALES_OPPORTUNITY" }, tone: "info" },
      { id: "questions", label: "Duvidas simples", count: summary?.questionCount || 0, patch: { eventType: "QUESTION" }, tone: "neutral" },
      {
        id: "pending",
        label: "Pendencias",
        count: summary?.actionRequiredEvents || 0,
        patch: {
          eventType: "RISK,ESCALATION,COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,SALES_OPPORTUNITY",
          resolved: "false",
        },
        tone: "neutral",
      },
      { id: "groups", label: "Grupos", count: groups, patch: { isGroup: true }, tone: "neutral" },
      { id: "private", label: "Privado", count: privateCount, patch: { isGroup: false }, tone: "neutral" },
    ].filter((shortcut) => shortcut.id === "all" || shortcut.count > 0);
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
              <span>Leitura do Sistema</span>
            </div>
            <p>{intelligence?.executiveSummary || overviewIntelligence?.executiveSummary || "Carregando sinais capturados por regras, deduplicacao e classificacao local..."}</p>
            <div className="wa-command-stats">
              <span><Filter size={16} /> {visibleTotal} eventos unicos</span>
              <span><AlertTriangle size={16} /> {intelligence?.summary.criticalOpen ?? 0} criticos abertos</span>
              <span><ThumbsDown size={16} /> {intelligence?.summary.negativeSignals ?? 0} negativos</span>
              <span><ThumbsUp size={16} /> {intelligence?.summary.positiveSignals ?? 0} positivos</span>
              <span><PackageSearch size={16} /> {intelligence?.summary.opportunities ?? 0} oportunidades</span>
            </div>
            <div className="wa-next-actions-inline">
              <div className="wa-command-title">
                <Bell size={20} />
                <span>Prioridades agora</span>
              </div>
              <div className="wa-action-list-inline">
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
            </div>
          </div>

          <div className="wa-ai-control">
            <div className="wa-ai-status">
              <Bot size={20} />
              <div>
                <strong>Central da IA</strong>
                <span>{aiDisplay.sourceLabel} - {aiDisplay.statusLabel}</span>
              </div>
            </div>
            <div className="wa-ai-run-card">
              <div>
                <strong>{aiDisplay.headline}</strong>
                <span>{aiDisplay.details}</span>
              </div>
              <small>{aiDisplay.actionHint}</small>
            </div>
            <div className="wa-ai-scope">
              <span>
                <strong>Base</strong>
                Eventos capturados por regras
              </span>
              <span>
                <strong>Escopo</strong>
                {formatBatchPeriod(aiBatch?.latestBatch?.periodFrom, aiBatch?.latestBatch?.periodTo)}
              </span>
            </div>
            <div className="wa-ai-result">
              <strong>O que a IA devolveu</strong>
              <p>{aiExecutiveText || "Ainda sem resumo de IA para o periodo. Clique em rodar para atualizar a leitura gerencial."}</p>
              {aiSections.length > 0 && (
                <div className="wa-ai-section-list">
                  {aiSections.map((section) => (
                    <details key={section.title} open>
                      <summary>{section.title}</summary>
                      {section.items.map((item) => <span key={item}>{item}</span>)}
                    </details>
                  ))}
                </div>
              )}
            </div>
            {aiBatch?.recentBatches?.length ? (
              <div className="wa-ai-history">
                <strong>Ultimas execucoes</strong>
                {aiBatch.recentBatches.slice(0, 3).map((batch) => (
                  <span key={`${batch.finishedAt}-${batch.status}-${batch.runSource}`}>
                    {formatRunSource(batch.runSource)} - {formatBatchStatus(batch.status)} - {batch.eventCount} eventos - {formatBatchTime(batch.finishedAt)}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="wa-run-ai-button"
              disabled={!canRunManualBatch}
              onClick={() => aiBatchMutation.mutate()}
              title={formatBlockedReason(aiBatch?.manualBlockedReason)}
            >
              {aiBatchMutation.isPending ? <RefreshCw size={18} className="spin" /> : <PlayCircle size={18} />}
              Rodar lote manual
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
                    <span className="wa-theme-count-pill">
                      <strong>{theme.count}</strong>
                      <span>casos</span>
                      <small>{theme.severity}</small>
                    </span>
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
                        <span>{selectedTheme.severity} - {formatThemeCategory(selectedTheme.category)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="wa-theme-filter-button"
                      onClick={() => applyScopeFilter(themeFilterPatch(selectedTheme))}
                    >
                      <Filter size={16} />
                      Filtrar tabela
                    </button>
                  </div>
                  <div className="wa-theme-detail-body">
                    <p className="wa-theme-summary">{themeSummaryText(selectedTheme)}</p>
                    <div className="wa-theme-detail-stats">
                      <span><strong>{selectedTheme.count}</strong> total detectado</span>
                      <span><strong>{visibleThemeExamples}</strong> visiveis aqui</span>
                      <span><strong>{selectedTheme.unresolvedCount}</strong> abertas</span>
                      <span><strong>{selectedTheme.groupCount}</strong> grupos</span>
                      <span><strong>{selectedTheme.privateCount}</strong> privados</span>
                    </div>
                    {visibleThemeExamples < selectedTheme.count && (
                      <p className="wa-theme-sample-note">
                        Mostrando {visibleThemeExamples} conversas recentes de {selectedTheme.count} detectadas neste tema.
                      </p>
                    )}
                    <div className="wa-theme-examples">
                      {selectedTheme.examples.map((example) => (
                        <article key={`${example.eventId}-${example.dealId}`} className="wa-theme-example">
                          <div>
                            <strong>{example.contactName}</strong>
                            <span>{example.agentName || "Sem agente"} - {formatDateTime(example.detectedAt)}</span>
                          </div>
                          <p>{example.content}</p>
                          <button type="button" onClick={() => openConversation(seedFromExample(example, selectedTheme))}>
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

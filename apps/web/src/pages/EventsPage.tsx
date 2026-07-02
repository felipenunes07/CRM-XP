import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Eye,
  Flame,
  Frown,
  LayoutList,
  Meh,
  MessageSquare,
  Newspaper,
  PlayCircle,
  Radar as RadarIcon,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  Smile,
  Sparkles,
  ThumbsUp,
  Users,
} from "lucide-react";
import type {
  ConversationAttentionLevel,
  ConversationInsight,
  ConversationIntelligenceRunResult,
  DailyBriefing,
  MessageEvent,
  WhatsappMonitorConversationDetail,
} from "@olist-crm/shared";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { EventsListView } from "../components/events/EventsListView";
import { EventsFilters, type EventsFilterState } from "../components/events/EventsFilters";
import { MiniChatDrawer, type MiniChatMessage } from "../components/MiniChatDrawer";
import { buildEventChatMessages, type EventConversationSeed } from "../lib/eventsChat";

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

const ATTENTION_LABELS: Record<ConversationAttentionLevel, string> = {
  none: "Sem alerta",
  low: "Baixo",
  medium: "Medio",
  high: "Alto",
  critical: "Critico",
};

const FLAG_LABELS: Record<string, string> = {
  reclamacao: "Reclamacao",
  risco_perda: "Risco de perda",
  urgente: "Urgente",
  sem_resposta: "Sem resposta",
  oportunidade: "Oportunidade",
  elogio: "Elogio",
  problema_entrega: "Entrega",
  problema_produto: "Produto",
  problema_pagamento: "Pagamento",
  vip: "VIP",
};

const BRIEFING_SECTIONS: Array<{ key: string; title: string }> = [
  { key: "alertas", title: "Alertas" },
  { key: "reclamacoes", title: "Reclamacoes" },
  { key: "pendencias", title: "Pendencias" },
  { key: "oportunidades", title: "Oportunidades" },
  { key: "elogios", title: "Elogios" },
  { key: "vendedoras", title: "Vendedoras" },
];

interface InsightListFilters {
  attention?: string;
  flag?: string;
  isGroup?: string;
  search: string;
  page: number;
}

const defaultInsightFilters: InsightListFilters = { search: "", page: 1 };

function toDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function sentimentEmoji(score: number | null) {
  if (score === null) return { icon: <Meh size={16} />, label: "sem leitura", tone: "neutral" };
  if (score <= -0.6) return { icon: <Flame size={16} />, label: "muito negativo", tone: "critical" };
  if (score <= -0.2) return { icon: <Frown size={16} />, label: "negativo", tone: "negative" };
  if (score < 0.2) return { icon: <Meh size={16} />, label: "neutro", tone: "neutral" };
  if (score < 0.6) return { icon: <Smile size={16} />, label: "positivo", tone: "positive" };
  return { icon: <ThumbsUp size={16} />, label: "muito positivo", tone: "positive" };
}

function formatBlockedReason(reason: string | null | undefined) {
  switch (reason) {
    case "disabled":
      return "IA desligada (EVENTS_AI_BATCH_ENABLED)";
    case "missing_api_key":
      return "Chave de IA nao configurada";
    case "outside_business_hours":
      return "Fora do horario comercial";
    case "cadence_wait":
      return "Aguardando proximo ciclo";
    case "daily_request_cap":
      return "Limite diario de chamadas atingido";
    case "daily_token_cap":
      return "Limite diario de tokens atingido";
    case "no_conversations":
      return "Nenhuma conversa nova para analisar";
    default:
      return reason || "Pronto para rodar";
  }
}

function formatRunResult(result: ConversationIntelligenceRunResult) {
  if (result.status === "SUCCEEDED") {
    const briefing = result.briefingUpdated ? " Briefing do dia atualizado." : "";
    return `Analise concluida: ${result.analyzedConversations ?? 0} conversas lidas pela IA.${briefing}`;
  }
  if (result.status === "SKIPPED") {
    return `Analise nao executada: ${formatBlockedReason(result.reason)}.`;
  }
  return `Analise falhou: ${result.error || "erro no provedor de IA"}.`;
}

function briefingItemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    const title = [record.titulo, record.title, record.nome].find((entry) => typeof entry === "string" && entry.trim());
    const detail = [record.detalhe, record.descricao, record.observacao, record.detail]
      .find((entry) => typeof entry === "string" && entry.trim());
    return [title, detail].filter(Boolean).join(" — ");
  }
  return "";
}

function readBriefingSection(briefing: DailyBriefing | null, key: string): string[] {
  const value = briefing?.payload?.[key];
  if (!Array.isArray(value)) return [];
  return value.map(briefingItemText).filter(Boolean).slice(0, 6);
}

function seedFromInsight(insight: ConversationInsight): EventConversationSeed {
  const quote = insight.highlights[0];
  return {
    dealId: insight.dealId ?? "",
    content: quote?.texto || insight.summary,
    detectedAt: insight.lastMessageAt ?? insight.analyzedAt,
    contactName: insight.chatName || "Conversa",
    agentName: insight.agentName,
    isGroup: insight.isGroup,
    severity: insight.attentionLevel === "critical" ? "CRITICAL" : insight.attentionLevel === "high" ? "HIGH" : "MODERATE",
    label: insight.attentionReason || "Conversa analisada pela IA",
    reason: insight.summary,
  };
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
  };
}

function buildChatState(
  seed: EventConversationSeed,
  detail: WhatsappMonitorConversationDetail | null,
  loading: boolean,
): ChatState {
  const mappedMessages = buildEventChatMessages({
    seed,
    monitorMessages: detail?.messages ?? [],
  });
  return {
    open: true,
    loading,
    recipientId: detail?.id || seed.dealId,
    customerName: detail?.contactName || detail?.title || seed.contactName || "Conversa",
    customerPhone: detail?.contactPhone || seed.contactPhone || "",
    jid: detail?.remoteJid || (seed.isGroup ? "Grupo" : ""),
    messages: mappedMessages,
  };
}

export function EventsPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = user?.role !== "SELLER";

  const [dateRange, setDateRange] = useState({
    from: toDateInput(new Date()),
    to: toDateInput(new Date()),
  });
  const [insightFilters, setInsightFilters] = useState<InsightListFilters>(defaultInsightFilters);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [chatState, setChatState] = useState<ChatState>(emptyChatState);
  const [legacyFilters, setLegacyFilters] = useState<EventsFilterState>({ page: 1, pageSize: 20 });
  const [legacyOpen, setLegacyOpen] = useState(false);

  const period = useMemo(() => ({ dateFrom: dateRange.from, dateTo: dateRange.to }), [dateRange]);

  const overviewQuery = useQuery({
    queryKey: ["events-overview", period],
    queryFn: () => api.getEventsOverview(token!, period),
    enabled: Boolean(token),
    refetchInterval: 120_000,
  });

  const insightsQuery = useQuery({
    queryKey: ["events-conversations", period, insightFilters],
    queryFn: () => api.listConversationInsights(token!, {
      ...period,
      attention: insightFilters.attention,
      flag: insightFilters.flag,
      isGroup: insightFilters.isGroup === undefined ? undefined : insightFilters.isGroup === "true",
      search: insightFilters.search || undefined,
    }, { page: insightFilters.page, pageSize: 20 }),
    enabled: Boolean(token),
  });

  const legacyEventsQuery = useQuery({
    queryKey: ["events-list", period, legacyFilters],
    queryFn: () => api.listEvents(token!, {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      eventType: legacyFilters.eventType,
      severity: legacyFilters.severity,
      resolved: legacyFilters.resolved,
      search: legacyFilters.search,
      isGroup: legacyFilters.isGroup,
      agentId: legacyFilters.agentId,
    }, { page: legacyFilters.page ?? 1, pageSize: legacyFilters.pageSize ?? 20 }),
    enabled: Boolean(token) && legacyOpen,
  });

  const invalidateIntelligence = () => {
    queryClient.invalidateQueries({ queryKey: ["events-overview"] });
    queryClient.invalidateQueries({ queryKey: ["events-conversations"] });
  };

  const runMutation = useMutation({
    mutationFn: () => api.runEventsAnalysis(token!),
    onSuccess: (result) => {
      setRunMessage(formatRunResult(result));
      invalidateIntelligence();
    },
    onError: (error) => {
      setRunMessage(error instanceof Error ? error.message : "Nao foi possivel rodar a analise.");
    },
  });

  const ackMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => api.ackConversationInsight(token!, id),
    onSuccess: invalidateIntelligence,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.resolveEvent(token!, id, { resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-list"] });
    },
  });

  const openConversation = async (seed: EventConversationSeed) => {
    if (!token || !seed.dealId) return;
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
    setInsightFilters((current) => ({ ...current, page: 1 }));
  };

  const applyStatFilter = (patch: Partial<InsightListFilters>) => {
    setInsightFilters({ ...defaultInsightFilters, ...patch });
    document.getElementById("wa-intel-conversations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const overview = overviewQuery.data;
  const briefing = overview?.briefing ?? null;
  const status = overview?.status;
  const stats = overview?.stats;
  const radar = overview?.radar ?? [];
  const topics = overview?.topics ?? [];
  const agents = overview?.agents ?? [];
  const insights = insightsQuery.data?.insights ?? [];
  const insightsTotal = insightsQuery.data?.total ?? 0;
  const briefingSections = BRIEFING_SECTIONS
    .map((section) => ({ ...section, items: readBriefingSection(briefing, section.key) }))
    .filter((section) => section.items.length > 0);
  const overallSentiment = sentimentEmoji(stats?.averageSentiment ?? null);

  return (
    <div className="wa-events-page">
      <header className="wa-page-header">
        <div className="wa-header-content">
          <div className="wa-title-row">
            <ShieldAlert size={28} className="text-primary" />
            <h1>Inteligencia de Mensagens</h1>
          </div>
          <p>A IA le as conversas do WhatsApp e entrega o que importa: reclamacoes, riscos, oportunidades e elogios.</p>
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
                setInsightFilters((current) => ({ ...current, page: 1 }));
              }}
            />
            <span>ate</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, to: event.target.value }));
                setInsightFilters((current) => ({ ...current, page: 1 }));
              }}
            />
          </div>
        </div>
      </header>

      <div className="wa-events-content">
        {/* ── Briefing do dia ── */}
        {isManager && (
          <section className="wa-intel-briefing" aria-label="Briefing do dia">
            <div className="wa-intel-briefing-main">
              <div className="wa-intel-section-title">
                <Newspaper size={20} />
                <h2>Briefing do dia</h2>
                {briefing && <span className="wa-intel-subtle">atualizado {formatDateTime(briefing.generatedAt)}</span>}
              </div>
              {briefing?.narrative ? (
                <div className="wa-intel-narrative">
                  {briefing.narrative.split(/\n{1,2}/).filter(Boolean).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="wa-intel-empty-text">
                  {status?.enabled
                    ? "Ainda nao ha briefing para o periodo. A IA gera a leitura do dia conforme analisa as conversas — ou clique em \"Analisar agora\"."
                    : "A IA esta desligada. Ative EVENTS_AI_BATCH_ENABLED e configure a chave (GEMINI_API_KEY) para o briefing funcionar."}
                </p>
              )}
              {briefingSections.length > 0 && (
                <div className="wa-intel-briefing-grid">
                  {briefingSections.map((section) => (
                    <div key={section.key} className={`wa-intel-briefing-block ${section.key}`}>
                      <strong>{section.title}</strong>
                      <ul>
                        {section.items.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="wa-intel-engine">
              <div className="wa-intel-engine-header">
                <Bot size={18} />
                <strong>Motor de analise</strong>
                <span className={`wa-intel-dot ${status?.enabled ? "on" : "off"}`} />
              </div>
              <dl>
                <div><dt>Ultima analise</dt><dd>{status?.lastAnalysisAt ? formatDateTime(status.lastAnalysisAt) : "nunca"}</dd></div>
                <div><dt>Conversas hoje</dt><dd>{status?.conversationsAnalyzedToday ?? 0}</dd></div>
                <div><dt>Uso do dia</dt><dd>{status ? `${status.usage.requestCount}/${status.usage.requestLimit} chamadas` : "-"}</dd></div>
                <div><dt>Retencao</dt><dd>{status ? `${status.retentionDays} dias` : "-"}</dd></div>
              </dl>
              {status?.lastError && (
                <p className="wa-intel-engine-error" title={status.lastError}>
                  <AlertTriangle size={14} /> Ultimo erro: {status.lastError.slice(0, 120)}
                </p>
              )}
              <button
                type="button"
                className="wa-intel-run-button"
                disabled={!status?.canRunManually || runMutation.isPending}
                title={status?.manualBlockedReason ? formatBlockedReason(status.manualBlockedReason) : "Analisar conversas agora"}
                onClick={() => runMutation.mutate()}
              >
                {runMutation.isPending ? <RefreshCw size={16} className="spin" /> : <PlayCircle size={16} />}
                Analisar agora
              </button>
              {runMessage && <p className="wa-intel-run-message">{runMessage}</p>}
            </aside>
          </section>
        )}

        {/* ── Numeros do periodo ── */}
        <section className="wa-intel-stats" aria-label="Numeros do periodo">
          <button type="button" className="wa-intel-stat" onClick={() => applyStatFilter({})}>
            <MessageSquare size={17} />
            <strong>{stats?.conversations ?? 0}</strong>
            <span>conversas analisadas</span>
          </button>
          <button type="button" className="wa-intel-stat danger" onClick={() => applyStatFilter({ attention: "high,critical" })}>
            <AlertTriangle size={17} />
            <strong>{(stats?.byAttention.high ?? 0) + (stats?.byAttention.critical ?? 0)}</strong>
            <span>precisam de atencao</span>
          </button>
          <button type="button" className="wa-intel-stat danger" onClick={() => applyStatFilter({ flag: "reclamacao" })}>
            <Flame size={17} />
            <strong>{stats?.complaints ?? 0}</strong>
            <span>reclamacoes</span>
          </button>
          <button type="button" className="wa-intel-stat warning" onClick={() => applyStatFilter({ flag: "risco_perda" })}>
            <ShieldAlert size={17} />
            <strong>{stats?.churnRisks ?? 0}</strong>
            <span>risco de perda</span>
          </button>
          <button type="button" className="wa-intel-stat warning" onClick={() => applyStatFilter({ flag: "sem_resposta" })}>
            <Eye size={17} />
            <strong>{stats?.unanswered ?? 0}</strong>
            <span>cliente sem resposta</span>
          </button>
          <button type="button" className="wa-intel-stat info" onClick={() => applyStatFilter({ flag: "oportunidade" })}>
            <Sparkles size={17} />
            <strong>{stats?.opportunities ?? 0}</strong>
            <span>oportunidades</span>
          </button>
          <button type="button" className="wa-intel-stat positive" onClick={() => applyStatFilter({ flag: "elogio" })}>
            <ThumbsUp size={17} />
            <strong>{stats?.praises ?? 0}</strong>
            <span>elogios</span>
          </button>
          <div className={`wa-intel-stat sentiment ${overallSentiment.tone}`}>
            {overallSentiment.icon}
            <strong>{overallSentiment.label}</strong>
            <span>humor geral dos clientes</span>
          </div>
        </section>

        {/* ── Radar de atencao ── */}
        <section className="wa-section wa-intel-radar" aria-label="Radar de atencao">
          <div className="wa-intel-section-title">
            <RadarIcon size={20} />
            <h2>Radar de atencao</h2>
            <span className="wa-intel-subtle">{radar.length} conversas abertas que o gestor precisa ver</span>
          </div>
          {radar.length === 0 ? (
            <div className="wa-intel-radar-empty">
              <CheckCircle2 size={22} />
              <p>Nenhuma conversa critica em aberto no periodo. Tudo sob controle.</p>
            </div>
          ) : (
            <div className="wa-intel-radar-grid">
              {radar.map((insight) => {
                const quote = insight.highlights[0];
                const sentiment = sentimentEmoji(insight.sentimentScore);
                return (
                  <article key={insight.id} className={`wa-intel-alert ${insight.attentionLevel}`}>
                    <header>
                      <span className={`wa-intel-attention ${insight.attentionLevel}`}>
                        {insight.attentionLevel === "critical" ? <Flame size={13} /> : <AlertTriangle size={13} />}
                        {ATTENTION_LABELS[insight.attentionLevel]}
                      </span>
                      <span className="wa-intel-chat-kind">{insight.isGroup ? "Grupo" : "Privado"}</span>
                      {insight.flags.vip && <span className="wa-intel-flag vip">VIP</span>}
                      <span className="wa-intel-time">{formatTime(insight.lastMessageAt)}</span>
                    </header>
                    <h3>{insight.chatName || "Conversa sem nome"}</h3>
                    <span className="wa-intel-agent">{insight.agentName ? `Vendedora: ${insight.agentName}` : "Sem vendedora atribuida"} - {insight.customerMessageCount} msgs do cliente</span>
                    <p className="wa-intel-summary">{insight.summary}</p>
                    {insight.attentionReason && (
                      <p className="wa-intel-reason"><strong>Por que olhar:</strong> {insight.attentionReason}</p>
                    )}
                    {quote && (
                      <blockquote>
                        &ldquo;{quote.texto}&rdquo;
                        <cite>{quote.autor}</cite>
                      </blockquote>
                    )}
                    <div className="wa-intel-chips">
                      <span className={`wa-intel-sentiment ${sentiment.tone}`}>{sentiment.icon} {sentiment.label}</span>
                      {Object.entries(insight.flags).filter(([key, value]) => value && key !== "vip").map(([key]) => (
                        <span key={key} className="wa-intel-flag">{FLAG_LABELS[key] ?? key}</span>
                      ))}
                    </div>
                    {insight.actionItems.length > 0 && (
                      <ul className="wa-intel-actions-list">
                        {insight.actionItems.slice(0, 3).map((action) => <li key={action}>{action}</li>)}
                      </ul>
                    )}
                    <footer>
                      <button type="button" className="wa-intel-open-chat" onClick={() => openConversation(seedFromInsight(insight))}>
                        <Smartphone size={15} /> Abrir conversa
                      </button>
                      <button
                        type="button"
                        className="wa-intel-ack"
                        disabled={ackMutation.isPending}
                        onClick={() => ackMutation.mutate({ id: insight.id })}
                      >
                        <CheckCircle2 size={15} /> Marcar visto
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Temas + vendedoras ── */}
        <div className="wa-intel-middle-grid">
          <section className="wa-section wa-intel-topics" aria-label="Temas do periodo">
            <div className="wa-intel-section-title">
              <Sparkles size={20} />
              <h2>Temas das conversas</h2>
              <span className="wa-intel-subtle">o que os clientes estao falando (gerado pela IA)</span>
            </div>
            {topics.length === 0 ? (
              <p className="wa-intel-empty-text">Nenhum tema identificado ainda no periodo.</p>
            ) : (
              <div className="wa-intel-topic-cloud">
                {topics.map((topic) => {
                  const negativeRatio = topic.count > 0 ? topic.negativeCount / topic.count : 0;
                  const tone = negativeRatio >= 0.5 ? "negative" : negativeRatio >= 0.25 ? "warning" : "neutral";
                  return (
                    <button
                      key={topic.topic}
                      type="button"
                      className={`wa-intel-topic ${tone}`}
                      title={`${topic.count} conversas (${topic.negativeCount} com clima negativo)`}
                      onClick={() => applyStatFilter({ search: topic.topic })}
                    >
                      {topic.topic}
                      <strong>{topic.count}</strong>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="wa-section wa-intel-agents" aria-label="Visao por vendedora">
            <div className="wa-intel-section-title">
              <Users size={20} />
              <h2>Por vendedora</h2>
            </div>
            {agents.length === 0 ? (
              <p className="wa-intel-empty-text">Sem dados por vendedora no periodo.</p>
            ) : (
              <table className="wa-intel-agents-table">
                <thead>
                  <tr>
                    <th>Vendedora</th>
                    <th>Conversas</th>
                    <th>Reclam.</th>
                    <th>Oportun.</th>
                    <th>Elogios</th>
                    <th>Humor</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const sentiment = sentimentEmoji(agent.averageSentiment);
                    return (
                      <tr key={agent.agentName}>
                        <td>{agent.agentName}</td>
                        <td>{agent.conversations}</td>
                        <td className={agent.complaints > 0 ? "danger" : ""}>{agent.complaints}</td>
                        <td>{agent.opportunities}</td>
                        <td>{agent.praises}</td>
                        <td><span className={`wa-intel-sentiment ${sentiment.tone}`}>{sentiment.icon}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* ── Conversas analisadas ── */}
        <section className="wa-section wa-intel-conversations" id="wa-intel-conversations" aria-label="Conversas analisadas">
          <div className="wa-intel-section-title">
            <LayoutList size={20} />
            <h2>Conversas analisadas</h2>
            <span className="wa-intel-subtle">{insightsTotal} no escopo atual</span>
          </div>

          <div className="wa-intel-list-filters">
            <div className="wa-intel-search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Buscar por nome, resumo ou tema..."
                value={insightFilters.search}
                onChange={(event) => setInsightFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
              />
            </div>
            <select
              value={insightFilters.attention ?? ""}
              onChange={(event) => setInsightFilters((current) => ({ ...current, attention: event.target.value || undefined, page: 1 }))}
            >
              <option value="">Atencao: todas</option>
              <option value="critical">Critico</option>
              <option value="high,critical">Alto + critico</option>
              <option value="medium">Medio</option>
              <option value="none,low">Sem alerta</option>
            </select>
            <select
              value={insightFilters.flag ?? ""}
              onChange={(event) => setInsightFilters((current) => ({ ...current, flag: event.target.value || undefined, page: 1 }))}
            >
              <option value="">Sinal: todos</option>
              <option value="reclamacao">Reclamacao</option>
              <option value="risco_perda">Risco de perda</option>
              <option value="sem_resposta">Sem resposta</option>
              <option value="oportunidade">Oportunidade</option>
              <option value="elogio">Elogio</option>
              <option value="problema_entrega">Problema de entrega</option>
              <option value="problema_produto">Problema de produto</option>
              <option value="problema_pagamento">Problema de pagamento</option>
            </select>
            <select
              value={insightFilters.isGroup ?? ""}
              onChange={(event) => setInsightFilters((current) => ({ ...current, isGroup: event.target.value || undefined, page: 1 }))}
            >
              <option value="">Origem: todas</option>
              <option value="true">Grupos</option>
              <option value="false">Privado</option>
            </select>
          </div>

          {insightsQuery.isLoading ? (
            <p className="wa-intel-empty-text">Carregando conversas analisadas...</p>
          ) : insights.length === 0 ? (
            <div className="wa-intel-radar-empty">
              <MessageSquare size={22} />
              <p>
                {status?.enabled
                  ? "Nenhuma conversa analisada neste filtro. A IA analisa automaticamente ao longo do dia."
                  : "A IA esta desligada — nenhuma conversa foi analisada."}
              </p>
            </div>
          ) : (
            <div className="wa-intel-conversation-list">
              {insights.map((insight) => {
                const sentiment = sentimentEmoji(insight.sentimentScore);
                const activeFlags = Object.entries(insight.flags).filter(([, value]) => value);
                return (
                  <article key={insight.id} className="wa-intel-conversation-row">
                    <div className="wa-intel-conv-head">
                      <div className="wa-intel-conv-title">
                        <strong>{insight.chatName || "Conversa sem nome"}</strong>
                        <span className="wa-intel-chat-kind">{insight.isGroup ? "Grupo" : "Privado"}</span>
                        {insight.attentionLevel !== "none" && (
                          <span className={`wa-intel-attention ${insight.attentionLevel}`}>
                            {ATTENTION_LABELS[insight.attentionLevel]}
                          </span>
                        )}
                        <span className={`wa-intel-sentiment ${sentiment.tone}`}>{sentiment.icon} {sentiment.label}</span>
                        {insight.acknowledgedAt && (
                          <span className="wa-intel-flag seen"><Eye size={12} /> visto</span>
                        )}
                      </div>
                      <div className="wa-intel-conv-meta">
                        <span>{insight.agentName || "Sem vendedora"}</span>
                        <span>{formatDateTime(insight.lastMessageAt)}</span>
                        <span>{insight.customerMessageCount} msgs do cliente</span>
                      </div>
                    </div>
                    <p className="wa-intel-summary">{insight.summary}</p>
                    <div className="wa-intel-conv-footer">
                      <div className="wa-intel-chips">
                        {insight.topics.slice(0, 5).map((topic) => (
                          <span key={topic} className="wa-intel-topic-chip">{topic}</span>
                        ))}
                        {activeFlags.map(([key]) => (
                          <span key={key} className={`wa-intel-flag ${key === "vip" ? "vip" : ""}`}>{FLAG_LABELS[key] ?? key}</span>
                        ))}
                      </div>
                      <button type="button" className="wa-intel-open-chat" onClick={() => openConversation(seedFromInsight(insight))}>
                        <Smartphone size={15} /> Abrir conversa
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {insightsTotal > 20 && (
            <div className="wa-pagination">
              <button
                disabled={insightFilters.page === 1}
                onClick={() => setInsightFilters((current) => ({ ...current, page: current.page - 1 }))}
              >
                Anterior
              </button>
              <span>Pagina {insightFilters.page} de {Math.max(1, Math.ceil(insightsTotal / 20))}</span>
              <button
                disabled={insightFilters.page >= Math.ceil(insightsTotal / 20)}
                onClick={() => setInsightFilters((current) => ({ ...current, page: current.page + 1 }))}
              >
                Proxima
              </button>
            </div>
          )}
        </section>

        {/* ── Registro bruto (regras, mensagem a mensagem) ── */}
        <section className="wa-section wa-intel-legacy">
          <button type="button" className="wa-intel-legacy-toggle" onClick={() => setLegacyOpen((open) => !open)}>
            <ChevronDown size={16} className={legacyOpen ? "open" : ""} />
            Registro detalhado por mensagem (deteccao por regras)
          </button>
          {legacyOpen && (
            <div className="wa-intel-legacy-body">
              <EventsFilters filters={legacyFilters} shortcuts={[]} onChange={setLegacyFilters} />
              <EventsListView
                events={legacyEventsQuery.data?.events || []}
                onResolve={(event) => {
                  const note = prompt("Deseja adicionar uma nota de resolucao?", "Resolvido via atendimento.");
                  if (note !== null) resolveMutation.mutate({ id: event.id, note });
                }}
                onViewConversation={(event) => openConversation(seedFromEvent(event))}
              />
              {legacyEventsQuery.data && legacyEventsQuery.data.total > (legacyFilters.pageSize ?? 20) && (
                <div className="wa-pagination">
                  <button
                    disabled={(legacyFilters.page ?? 1) === 1}
                    onClick={() => setLegacyFilters((current) => ({ ...current, page: (current.page ?? 1) - 1 }))}
                  >
                    Anterior
                  </button>
                  <span>Pagina {legacyFilters.page ?? 1}</span>
                  <button
                    disabled={(legacyEventsQuery.data.events.length) < (legacyFilters.pageSize ?? 20)}
                    onClick={() => setLegacyFilters((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
                  >
                    Proxima
                  </button>
                </div>
              )}
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

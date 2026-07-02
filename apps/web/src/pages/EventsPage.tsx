import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Flame,
  Frown,
  Meh,
  MessageSquare,
  Radio,
  ShieldCheck,
  Smartphone,
  Smile,
  Sparkles,
  ThumbsUp,
  Users,
  Zap,
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
  none: "Tranquila",
  low: "Leve",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const FLAG_LABELS: Record<string, string> = {
  reclamacao: "Reclamação",
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
  { key: "reclamacoes", title: "Reclamações" },
  { key: "pendencias", title: "Pendências" },
  { key: "oportunidades", title: "Oportunidades" },
  { key: "elogios", title: "Elogios" },
  { key: "vendedoras", title: "Vendedoras" },
];

const ATTENTION_SEGMENTS: Array<{ id: string; label: string; value?: string }> = [
  { id: "all", label: "Todas" },
  { id: "critical", label: "Críticas", value: "critical" },
  { id: "high", label: "Alta +", value: "high,critical" },
  { id: "medium", label: "Média", value: "medium" },
  { id: "calm", label: "Tranquilas", value: "none,low" },
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
  return date.toISOString().slice(0, 10);
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

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year?.slice(2)}`;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function sentimentInfo(score: number | null) {
  if (score === null) return { icon: <Meh size={15} />, label: "sem leitura", tone: "neutral" };
  if (score <= -0.6) return { icon: <Flame size={15} />, label: "muito negativo", tone: "negative" };
  if (score <= -0.2) return { icon: <Frown size={15} />, label: "negativo", tone: "negative" };
  if (score < 0.2) return { icon: <Meh size={15} />, label: "neutro", tone: "neutral" };
  if (score < 0.6) return { icon: <Smile size={15} />, label: "positivo", tone: "positive" };
  return { icon: <ThumbsUp size={15} />, label: "muito positivo", tone: "positive" };
}

function formatBlockedReason(reason: string | null | undefined) {
  switch (reason) {
    case "disabled":
      return "A IA está desligada no servidor (EVENTS_AI_BATCH_ENABLED)";
    case "missing_api_key":
      return "Nenhuma chave de IA configurada no servidor";
    case "outside_business_hours":
      return "Fora do horário comercial — a análise automática volta no próximo dia útil";
    case "cadence_wait":
      return "Aguardando o próximo ciclo automático";
    case "daily_request_cap":
      return "Limite diário de chamadas de IA atingido — volta amanhã";
    case "daily_token_cap":
      return "Limite diário de tokens de IA atingido — volta amanhã";
    case "no_conversations":
      return "Nenhuma conversa nova desde a última análise";
    default:
      return reason || "Pronto para rodar";
  }
}

function formatRunResult(result: ConversationIntelligenceRunResult) {
  if (result.status === "SUCCEEDED") {
    const briefing = result.briefingUpdated ? " O briefing do dia foi atualizado." : "";
    return `Pronto: a IA leu ${result.analyzedConversations ?? 0} conversas.${briefing}`;
  }
  if (result.status === "SKIPPED") {
    return formatBlockedReason(result.reason) + ".";
  }
  return `A análise falhou: ${result.error || "erro no provedor de IA"}.`;
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
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [chatState, setChatState] = useState<ChatState>(emptyChatState);
  const [legacyFilters, setLegacyFilters] = useState<EventsFilterState>({ page: 1, pageSize: 20 });
  const [legacyOpen, setLegacyOpen] = useState(false);

  const period = useMemo(() => ({ dateFrom: dateRange.from, dateTo: dateRange.to }), [dateRange]);
  const isToday = dateRange.from === dateRange.to && dateRange.to === toDateInput(new Date());
  const periodLabel = isToday
    ? "Hoje no WhatsApp"
    : dateRange.from === dateRange.to
      ? `Dia ${formatShortDate(dateRange.from)}`
      : `De ${formatShortDate(dateRange.from)} a ${formatShortDate(dateRange.to)}`;

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
      setRunMessage(error instanceof Error ? error.message : "Não foi possível rodar a análise.");
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
    document.getElementById("itl-conversas")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const maxTopicCount = topics.reduce((max, topic) => Math.max(max, topic.count), 0);

  const criticalCount = stats?.byAttention.critical ?? 0;
  const highCount = stats?.byAttention.high ?? 0;
  const mood = !stats || stats.conversations === 0
    ? { tone: "waiting", title: "Aguardando leituras", detail: "A IA ainda não analisou conversas neste período." }
    : criticalCount > 0
      ? { tone: "critical", title: "Dia com pontos críticos", detail: `${criticalCount} conversa${criticalCount > 1 ? "s" : ""} crítica${criticalCount > 1 ? "s" : ""} em aberto.` }
      : highCount > 0 || (stats.complaints ?? 0) > 0
        ? { tone: "warning", title: "Dia pede atenção", detail: `${highCount + criticalCount} alerta${highCount + criticalCount === 1 ? "" : "s"} e ${stats.complaints} reclamação${stats.complaints === 1 ? "" : "ões"}.` }
        : { tone: "calm", title: "Dia tranquilo", detail: "Nenhum alerta relevante nas conversas analisadas." };

  const usagePercent = status && status.usage.requestLimit > 0
    ? Math.min(100, Math.round((status.usage.requestCount / status.usage.requestLimit) * 100))
    : 0;

  const runBlockedHint = status?.manualBlockedReason ? formatBlockedReason(status.manualBlockedReason) : null;
  const hasAnyIntel = (stats?.conversations ?? 0) > 0 || Boolean(briefing?.narrative);

  return (
    <div className="itl-page">
      {/* ── Hero: briefing + pulso do dia ── */}
      <section className={`itl-hero ${mood.tone}`}>
        <div className="itl-hero-top">
          <div>
            <div className="itl-hero-eyebrow">
              <Bot size={14} />
              Inteligência de Mensagens
              <button type="button" className="itl-how-link" onClick={() => setHowItWorksOpen((open) => !open)}>
                como funciona?
              </button>
            </div>
            <h1>{periodLabel}</h1>
            <p className="itl-hero-status">
              <Radio size={13} className={status?.enabled ? "itl-live" : "itl-off"} />
              {status?.enabled
                ? <>{(status.messagesToday ?? 0).toLocaleString("pt-BR")} mensagens capturadas hoje · {status.conversationsAnalyzedToday} conversas lidas pela IA · última análise {status.lastAnalysisAt ? formatTime(status.lastAnalysisAt) : "ainda não rodou"}</>
                : "IA desligada no servidor — ative EVENTS_AI_BATCH_ENABLED e configure a chave."}
            </p>
          </div>

          <div className="itl-hero-controls">
            <div className="itl-presets">
              <button type="button" className={isToday ? "active" : ""} onClick={() => setPresetDays(1)}>Hoje</button>
              <button type="button" onClick={() => setPresetDays(7)}>7 dias</button>
              <button type="button" onClick={() => setPresetDays(30)}>30 dias</button>
            </div>
            <div className="itl-dates">
              <input
                type="date"
                value={dateRange.from}
                onChange={(event) => {
                  setDateRange((prev) => ({ ...prev, from: event.target.value }));
                  setInsightFilters((current) => ({ ...current, page: 1 }));
                }}
              />
              <span>—</span>
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
        </div>

        {howItWorksOpen && (
          <div className="itl-how">
            <div className="itl-how-step">
              <span className="itl-how-icon"><MessageSquare size={16} /></span>
              <div>
                <strong>1. Captura</strong>
                <p>Toda mensagem dos grupos e privados das vendedoras entra no monitor automaticamente, o dia inteiro.</p>
              </div>
            </div>
            <div className="itl-how-step">
              <span className="itl-how-icon"><Bot size={16} /></span>
              <div>
                <strong>2. Leitura por IA</strong>
                <p>A cada ciclo (horário comercial), a IA lê as conversas com mensagens novas de cliente — as com sinal de reclamação/risco primeiro — e resume: humor, alertas, temas e ações.</p>
              </div>
            </div>
            <div className="itl-how-step">
              <span className="itl-how-icon"><Zap size={16} /></span>
              <div>
                <strong>3. Entrega</strong>
                <p>Você recebe o briefing do dia e o radar de atenção aqui, sem precisar acompanhar o WhatsApp. Tudo é apagado após {status?.retentionDays ?? 30} dias. O botão &ldquo;Analisar agora&rdquo; roda a leitura na hora, sem esperar o ciclo.</p>
              </div>
            </div>
          </div>
        )}

        <div className="itl-hero-body">
          <div className="itl-briefing">
            {isManager && briefing?.narrative ? (
              <>
                <div className="itl-briefing-head">
                  <Sparkles size={15} />
                  <span>Briefing do dia · gerado {formatDateTime(briefing.generatedAt)}</span>
                </div>
                {briefing.narrative.split(/\n{1,2}/).filter(Boolean).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {briefingSections.length > 0 && (
                  <div className="itl-briefing-sections">
                    {briefingSections.map((section) => (
                      <details key={section.key} className={`itl-briefing-sec ${section.key}`} open={section.key === "alertas"}>
                        <summary>{section.title} <em>{section.items.length}</em></summary>
                        <ul>
                          {section.items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="itl-briefing-empty">
                <Sparkles size={18} />
                <div>
                  <strong>{isManager ? "O briefing do dia aparece aqui" : "Suas conversas analisadas aparecem abaixo"}</strong>
                  <p>
                    {status?.enabled
                      ? (status.messagesToday ?? 0) > 0
                        ? `Já capturamos ${status.messagesToday.toLocaleString("pt-BR")} mensagens hoje. Assim que a IA rodar (automático, ou pelo botão ao lado), o resumo gerencial do dia aparece neste espaço.`
                        : "Nenhuma mensagem capturada hoje ainda. Assim que os grupos e privados movimentarem, a IA começa a leitura."
                      : "A IA está desligada no servidor, então nada será analisado por enquanto."}
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="itl-pulse">
            <div className={`itl-mood ${mood.tone}`}>
              {mood.tone === "critical" ? <Flame size={22} /> : mood.tone === "warning" ? <AlertTriangle size={22} /> : mood.tone === "calm" ? <ShieldCheck size={22} /> : <Bot size={22} />}
              <div>
                <strong>{mood.title}</strong>
                <span>{mood.detail}</span>
              </div>
            </div>

            {isManager && (
              <div className="itl-run">
                <button
                  type="button"
                  disabled={!status?.canRunManually || runMutation.isPending}
                  onClick={() => runMutation.mutate()}
                >
                  {runMutation.isPending ? <span className="itl-spinner" /> : <Zap size={16} />}
                  {runMutation.isPending ? "Lendo conversas..." : "Analisar agora"}
                </button>
                <p className="itl-run-hint">
                  {runMutation.isPending
                    ? "A IA está lendo as conversas de hoje que ainda não foram analisadas."
                    : runMessage
                      ? runMessage
                      : runBlockedHint && !status?.canRunManually
                        ? runBlockedHint
                        : "Lê agora as conversas novas de hoje (críticas primeiro) e atualiza briefing e radar. Leva menos de um minuto."}
                </p>
                {status && status.usage.requestLimit > 0 && (
                  <div className="itl-usage" title={`${status.usage.requestCount} de ${status.usage.requestLimit} chamadas de IA usadas hoje`}>
                    <div className="itl-usage-bar"><span style={{ width: `${usagePercent}%` }} /></div>
                    <small>{status.usage.requestCount}/{status.usage.requestLimit} chamadas de IA hoje</small>
                  </div>
                )}
                {status?.lastError && (
                  <p className="itl-run-error" title={status.lastError}>
                    <AlertTriangle size={12} /> Último erro da IA: {status.lastError.slice(0, 90)}...
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>

        <div className="itl-hero-stats">
          <button type="button" onClick={() => applyStatFilter({})}>
            <strong>{stats?.conversations ?? 0}</strong> conversas lidas
          </button>
          <button type="button" className="danger" onClick={() => applyStatFilter({ attention: "high,critical" })}>
            <strong>{(stats?.byAttention.high ?? 0) + (stats?.byAttention.critical ?? 0)}</strong> precisam de atenção
          </button>
          <button type="button" className="danger" onClick={() => applyStatFilter({ flag: "reclamacao" })}>
            <strong>{stats?.complaints ?? 0}</strong> reclamações
          </button>
          <button type="button" className="warning" onClick={() => applyStatFilter({ flag: "risco_perda" })}>
            <strong>{stats?.churnRisks ?? 0}</strong> risco de perda
          </button>
          <button type="button" className="warning" onClick={() => applyStatFilter({ flag: "sem_resposta" })}>
            <strong>{stats?.unanswered ?? 0}</strong> sem resposta
          </button>
          <button type="button" className="info" onClick={() => applyStatFilter({ flag: "oportunidade" })}>
            <strong>{stats?.opportunities ?? 0}</strong> oportunidades
          </button>
          <button type="button" className="positive" onClick={() => applyStatFilter({ flag: "elogio" })}>
            <strong>{stats?.praises ?? 0}</strong> elogios
          </button>
        </div>
      </section>

      {/* ── Radar de atenção ── */}
      <section className="itl-card" aria-label="Radar de atenção">
        <header className="itl-card-head">
          <span className="itl-card-icon danger"><Flame size={17} /></span>
          <div>
            <h2>Radar de atenção</h2>
            <p>Conversas que a IA marcou como alta ou crítica e ninguém marcou como vistas</p>
          </div>
          {radar.length > 0 && <span className="itl-count-pill">{radar.length}</span>}
        </header>

        {radar.length === 0 ? (
          <div className="itl-empty calm">
            <ShieldCheck size={20} />
            <p>{hasAnyIntel ? "Nenhuma conversa crítica em aberto. Tudo sob controle." : "Quando a IA encontrar uma conversa que exige ação do gestor, ela aparece aqui em destaque."}</p>
          </div>
        ) : (
          <div className="itl-radar-grid">
            {radar.map((insight) => {
              const quote = insight.highlights[0];
              const sentiment = sentimentInfo(insight.sentimentScore);
              return (
                <article key={insight.id} className={`itl-alert ${insight.attentionLevel}`}>
                  <header>
                    <span className={`itl-attention ${insight.attentionLevel}`}>
                      {insight.attentionLevel === "critical" ? <Flame size={12} /> : <AlertTriangle size={12} />}
                      {ATTENTION_LABELS[insight.attentionLevel]}
                    </span>
                    {insight.flags.vip && <span className="itl-chip vip">VIP</span>}
                    <span className="itl-alert-time">{formatTime(insight.lastMessageAt)}</span>
                  </header>
                  <div className="itl-alert-title">
                    <span className="itl-avatar">{initialsOf(insight.chatName || "?")}</span>
                    <div>
                      <strong>{insight.chatName || "Conversa sem nome"}</strong>
                      <small>{insight.isGroup ? "Grupo" : "Privado"} · {insight.agentName || "sem vendedora"}</small>
                    </div>
                  </div>
                  <p className="itl-alert-summary">{insight.summary}</p>
                  {insight.attentionReason && (
                    <p className="itl-alert-why">{insight.attentionReason}</p>
                  )}
                  {quote && (
                    <div className="itl-quote">
                      <p>{quote.texto}</p>
                      <span>— {quote.autor}</span>
                    </div>
                  )}
                  {insight.actionItems.length > 0 && (
                    <div className="itl-next">
                      <strong>Próximo passo</strong>
                      <span>{insight.actionItems[0]}</span>
                    </div>
                  )}
                  <footer>
                    <span className={`itl-sentiment ${sentiment.tone}`}>{sentiment.icon} {sentiment.label}</span>
                    <div className="itl-alert-buttons">
                      <button type="button" className="itl-btn-primary" onClick={() => openConversation(seedFromInsight(insight))}>
                        <Smartphone size={14} /> Abrir conversa
                      </button>
                      <button
                        type="button"
                        className="itl-btn-ghost"
                        disabled={ackMutation.isPending}
                        onClick={() => ackMutation.mutate({ id: insight.id })}
                        title="Tira do radar (volta se a conversa piorar)"
                      >
                        <CheckCircle2 size={14} /> Visto
                      </button>
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Temas + vendedoras ── */}
      <div className="itl-two-col">
        <section className="itl-card" aria-label="Temas das conversas">
          <header className="itl-card-head">
            <span className="itl-card-icon info"><Sparkles size={17} /></span>
            <div>
              <h2>Do que os clientes estão falando</h2>
              <p>Temas identificados pela IA — clique para filtrar as conversas</p>
            </div>
          </header>
          {topics.length === 0 ? (
            <div className="itl-empty"><p>Os temas aparecem depois das primeiras análises.</p></div>
          ) : (
            <div className="itl-topics">
              {topics.slice(0, 12).map((topic) => {
                const width = maxTopicCount > 0 ? Math.max(8, Math.round((topic.count / maxTopicCount) * 100)) : 0;
                const negWidth = topic.count > 0 ? Math.round((topic.negativeCount / topic.count) * width) : 0;
                return (
                  <button key={topic.topic} type="button" className="itl-topic-row" onClick={() => applyStatFilter({ search: topic.topic })}>
                    <span className="itl-topic-name">{topic.topic}</span>
                    <span className="itl-topic-bar">
                      <span className="itl-topic-fill" style={{ width: `${width}%` }} />
                      {negWidth > 0 && <span className="itl-topic-neg" style={{ width: `${negWidth}%` }} />}
                    </span>
                    <span className="itl-topic-count" title={topic.negativeCount > 0 ? `${topic.negativeCount} com clima negativo` : undefined}>
                      {topic.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="itl-card" aria-label="Visão por vendedora">
          <header className="itl-card-head">
            <span className="itl-card-icon violet"><Users size={17} /></span>
            <div>
              <h2>Por vendedora</h2>
              <p>Como estão as conversas de cada uma</p>
            </div>
          </header>
          {agents.length === 0 ? (
            <div className="itl-empty"><p>Sem dados por vendedora neste período.</p></div>
          ) : (
            <div className="itl-agents">
              {agents.map((agent) => {
                const sentiment = sentimentInfo(agent.averageSentiment);
                return (
                  <div key={agent.agentName} className="itl-agent-row">
                    <span className="itl-avatar violet">{initialsOf(agent.agentName)}</span>
                    <div className="itl-agent-info">
                      <strong>{agent.agentName}</strong>
                      <small>{agent.conversations} conversa{agent.conversations === 1 ? "" : "s"} lida{agent.conversations === 1 ? "" : "s"}</small>
                    </div>
                    <div className="itl-agent-nums">
                      <span className={agent.complaints > 0 ? "bad" : ""} title="Reclamações">{agent.complaints} <small>recl.</small></span>
                      <span title="Oportunidades">{agent.opportunities} <small>oport.</small></span>
                      <span className={agent.praises > 0 ? "good" : ""} title="Elogios">{agent.praises} <small>elog.</small></span>
                      <span className={`itl-sentiment ${sentiment.tone}`} title={`Humor médio: ${sentiment.label}`}>{sentiment.icon}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Conversas analisadas ── */}
      <section className="itl-card" id="itl-conversas" aria-label="Conversas analisadas">
        <header className="itl-card-head">
          <span className="itl-card-icon"><MessageSquare size={17} /></span>
          <div>
            <h2>Todas as conversas analisadas</h2>
            <p>{insightsTotal} conversa{insightsTotal === 1 ? "" : "s"} no período — cada uma com a leitura completa da IA</p>
          </div>
        </header>

        <div className="itl-filters">
          <div className="itl-segments">
            {ATTENTION_SEGMENTS.map((segment) => (
              <button
                key={segment.id}
                type="button"
                className={(insightFilters.attention ?? "") === (segment.value ?? "") ? "active" : ""}
                onClick={() => setInsightFilters((current) => ({ ...current, attention: segment.value, page: 1 }))}
              >
                {segment.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="itl-search"
            placeholder="Buscar nome, resumo ou tema..."
            value={insightFilters.search}
            onChange={(event) => setInsightFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
          />
          <select
            value={insightFilters.flag ?? ""}
            onChange={(event) => setInsightFilters((current) => ({ ...current, flag: event.target.value || undefined, page: 1 }))}
          >
            <option value="">Todos os sinais</option>
            <option value="reclamacao">Reclamação</option>
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
            <option value="">Grupos e privados</option>
            <option value="true">Só grupos</option>
            <option value="false">Só privados</option>
          </select>
        </div>

        {insightsQuery.isLoading ? (
          <div className="itl-empty"><p>Carregando conversas...</p></div>
        ) : insights.length === 0 ? (
          <div className="itl-empty">
            <MessageSquare size={20} />
            <p>
              {hasAnyIntel
                ? "Nenhuma conversa neste filtro."
                : status?.enabled
                  ? "As conversas aparecem aqui conforme a IA analisa o dia. Use \"Analisar agora\" para não esperar o ciclo."
                  : "A IA está desligada — nenhuma conversa foi analisada."}
            </p>
          </div>
        ) : (
          <div className="itl-conv-list">
            {insights.map((insight) => {
              const sentiment = sentimentInfo(insight.sentimentScore);
              const activeFlags = Object.entries(insight.flags).filter(([, value]) => value);
              return (
                <article key={insight.id} className={`itl-conv-row rail-${insight.attentionLevel}`}>
                  <div className={`itl-conv-mood ${sentiment.tone}`} title={`Humor do cliente: ${sentiment.label}`}>
                    {sentiment.icon}
                  </div>
                  <div className="itl-conv-main">
                    <div className="itl-conv-title">
                      <strong>{insight.chatName || "Conversa sem nome"}</strong>
                      <span className="itl-chip subtle">{insight.isGroup ? "Grupo" : "Privado"}</span>
                      {insight.attentionLevel !== "none" && insight.attentionLevel !== "low" && (
                        <span className={`itl-attention ${insight.attentionLevel}`}>{ATTENTION_LABELS[insight.attentionLevel]}</span>
                      )}
                      {insight.acknowledgedAt && <span className="itl-chip seen">visto</span>}
                    </div>
                    <p className="itl-conv-summary">{insight.summary}</p>
                    <div className="itl-conv-chips">
                      {insight.topics.slice(0, 4).map((topic) => (
                        <span key={topic} className="itl-chip subtle">{topic}</span>
                      ))}
                      {activeFlags.map(([key]) => (
                        <span key={key} className={`itl-chip ${key === "vip" ? "vip" : key === "elogio" ? "good" : key === "oportunidade" ? "info" : "flag"}`}>
                          {FLAG_LABELS[key] ?? key}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="itl-conv-side">
                    <small>{insight.agentName || "sem vendedora"}</small>
                    <small>{formatDateTime(insight.lastMessageAt)}</small>
                    <button type="button" className="itl-btn-ghost" onClick={() => openConversation(seedFromInsight(insight))}>
                      <Smartphone size={14} /> Abrir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {insightsTotal > 20 && (
          <div className="itl-pagination">
            <button
              disabled={insightFilters.page === 1}
              onClick={() => setInsightFilters((current) => ({ ...current, page: current.page - 1 }))}
            >
              Anterior
            </button>
            <span>Página {insightFilters.page} de {Math.max(1, Math.ceil(insightsTotal / 20))}</span>
            <button
              disabled={insightFilters.page >= Math.ceil(insightsTotal / 20)}
              onClick={() => setInsightFilters((current) => ({ ...current, page: current.page + 1 }))}
            >
              Próxima
            </button>
          </div>
        )}
      </section>

      {/* ── Registro bruto (regras, mensagem a mensagem) ── */}
      <section className="itl-legacy">
        <button type="button" className="itl-legacy-toggle" onClick={() => setLegacyOpen((open) => !open)}>
          <ChevronDown size={15} className={legacyOpen ? "open" : ""} />
          Registro técnico por mensagem (detecção por regras)
        </button>
        {legacyOpen && (
          <div className="itl-legacy-body">
            <EventsFilters filters={legacyFilters} shortcuts={[]} onChange={setLegacyFilters} />
            <EventsListView
              events={legacyEventsQuery.data?.events || []}
              onResolve={(event) => {
                const note = prompt("Deseja adicionar uma nota de resolução?", "Resolvido via atendimento.");
                if (note !== null) resolveMutation.mutate({ id: event.id, note });
              }}
              onViewConversation={(event) => openConversation(seedFromEvent(event))}
            />
            {legacyEventsQuery.data && legacyEventsQuery.data.total > (legacyFilters.pageSize ?? 20) && (
              <div className="itl-pagination">
                <button
                  disabled={(legacyFilters.page ?? 1) === 1}
                  onClick={() => setLegacyFilters((current) => ({ ...current, page: (current.page ?? 1) - 1 }))}
                >
                  Anterior
                </button>
                <span>Página {legacyFilters.page ?? 1}</span>
                <button
                  disabled={(legacyEventsQuery.data.events.length) < (legacyFilters.pageSize ?? 20)}
                  onClick={() => setLegacyFilters((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        )}
      </section>

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

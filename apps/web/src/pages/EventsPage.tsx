import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Flame,
  Frown,
  Loader2,
  Meh,
  MessageSquare,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Smile,
  Sparkles,
  ThumbsUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import type {
  ConversationAttentionLevel,
  ConversationInsight,
  ConversationInsightsListResponse,
  DailyBriefing,
  EventsIntelligenceProgress,
  MessageEvent,
  RadarWhatsappAlertLimit,
  RadarWhatsappDetailLevel,
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

interface AckFeedback {
  kind: "success" | "error";
  message: string;
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
  problema_entrega: "Problema de entrega",
  problema_produto: "Problema de produto",
  problema_pagamento: "Problema de pagamento",
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

type FeedTabId = "radar" | "completed" | "all" | "reclamacao" | "oportunidade" | "elogio" | "sem_resposta";

const FEED_TABS: Array<{ id: FeedTabId; label: string; flag?: string }> = [
  { id: "radar", label: "Radar" },
  { id: "completed", label: "Concluídos" },
  { id: "all", label: "Todas" },
  { id: "reclamacao", label: "Reclamações", flag: "reclamacao" },
  { id: "oportunidade", label: "Oportunidades", flag: "oportunidade" },
  { id: "elogio", label: "Elogios", flag: "elogio" },
  { id: "sem_resposta", label: "Sem resposta", flag: "sem_resposta" },
];

const AVATAR_COLORS = ["#0e7490", "#7c3aed", "#be185d", "#b45309", "#047857", "#1d4ed8", "#b91c1c", "#4d7c0f"];

const PROGRESS_STEPS: Array<{ phases: EventsIntelligenceProgress["phase"][]; label: string }> = [
  { phases: ["queued", "selecting"], label: "Coletando conversas" },
  { phases: ["reading"], label: "Montando transcripts" },
  { phases: ["analyzing"], label: "IA lendo as conversas" },
  { phases: ["briefing"], label: "Gerando briefing" },
];

const RADAR_DETAIL_OPTIONS: Array<{
  id: RadarWhatsappDetailLevel;
  label: string;
  description: string;
}> = [
  { id: "summary", label: "Resumido", description: "Somente prioridade e motivo principal." },
  { id: "standard", label: "Padrão", description: "Inclui responsável e próximo passo." },
  { id: "complete", label: "Completo", description: "Inclui resumo, canal, temas e até 3 ações." },
];

const RADAR_ALERT_LIMITS: RadarWhatsappAlertLimit[] = [3, 5, 10, 20];

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

function formatPhoneFromJid(jid: string | null) {
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@lid")) return null;
  const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return digits || null;
  const hasCountry = digits.startsWith("55") && digits.length >= 12;
  const rest = hasCountry ? digits.slice(2) : digits;
  const ddd = rest.slice(0, 2);
  const num = rest.slice(2);
  const split = num.length > 4 ? `${num.slice(0, num.length - 4)}-${num.slice(-4)}` : num;
  return `${hasCountry ? "+55 " : ""}(${ddd}) ${split}`;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function avatarColor(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function sentimentInfo(score: number | null) {
  if (score === null) return { icon: <Meh size={15} />, label: "sem leitura", tone: "neutral" };
  if (score <= -0.6) return { icon: <Flame size={15} />, label: "muito negativo", tone: "negative" };
  if (score <= -0.2) return { icon: <Frown size={15} />, label: "negativo", tone: "negative" };
  if (score < 0.2) return { icon: <Meh size={15} />, label: "neutro", tone: "neutral" };
  if (score < 0.6) return { icon: <Smile size={15} />, label: "positivo", tone: "positive" };
  return { icon: <ThumbsUp size={15} />, label: "muito positivo", tone: "positive" };
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

function blockedReasonLabel(reason: string | null | undefined) {
  switch (reason) {
    case "disabled":
      return "IA desligada no servidor (EVENTS_AI_BATCH_ENABLED)";
    case "missing_api_key":
      return "Sem chave de IA no servidor (CEREBRAS_API_KEY ou GEMINI_API_KEY)";
    case "daily_request_cap":
      return "Limite diário de chamadas de IA atingido — volta amanhã (env EVENTS_AI_DAILY_REQUEST_LIMIT)";
    case "daily_token_cap":
      return "Limite diário de tokens de IA atingido — volta amanhã (env EVENTS_AI_DAILY_TOKEN_LIMIT)";
    default:
      return reason ? `Indisponível: ${reason}` : "Indisponível no momento";
  }
}

function originLabel(insight: ConversationInsight) {
  if (insight.isGroup) {
    return { kind: "GRUPO", detail: insight.agentName ? `vendedora ${insight.agentName}` : null };
  }
  const phone = formatPhoneFromJid(insight.remoteJid);
  return {
    kind: "PRIVADO",
    detail: [phone, insight.agentName ? `vendedora ${insight.agentName}` : null].filter(Boolean).join(" · ") || null,
  };
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
  const [feedTab, setFeedTab] = useState<FeedTabId>("radar");
  const [feedSearch, setFeedSearch] = useState("");
  const [feedTopic, setFeedTopic] = useState<string | null>(null);
  const [feedPage, setFeedPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [progressDismissed, setProgressDismissed] = useState(false);
  const [chatState, setChatState] = useState<ChatState>(emptyChatState);
  const [legacyFilters, setLegacyFilters] = useState<EventsFilterState>({ page: 1, pageSize: 20 });
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [radarWhatsappOpen, setRadarWhatsappOpen] = useState(false);
  const [radarDetailLevel, setRadarDetailLevel] = useState<RadarWhatsappDetailLevel>("standard");
  const [radarAlertLimit, setRadarAlertLimit] = useState<RadarWhatsappAlertLimit>(5);
  const [ackFeedback, setAckFeedback] = useState<AckFeedback | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const wasActiveRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);

  const period = useMemo(() => ({ dateFrom: dateRange.from, dateTo: dateRange.to }), [dateRange]);
  const activeTab = FEED_TABS.find((tab) => tab.id === feedTab) ?? FEED_TABS[0]!;

  const overviewQuery = useQuery({
    queryKey: ["events-overview", period],
    queryFn: () => api.getEventsOverview(token!, period),
    enabled: Boolean(token),
    refetchInterval: 120_000,
  });

  const insightsQuery = useQuery({
    queryKey: ["events-conversations", period, feedTab, feedSearch, feedTopic, feedPage],
    queryFn: () => api.listConversationInsights(token!, {
      ...period,
      flag: activeTab.flag,
      attention: feedTab === "radar" ? "high,critical" : undefined,
      onlyOpen: feedTab === "radar" ? true : undefined,
      acknowledged: feedTab === "completed" ? true : undefined,
      topic: feedTopic || undefined,
      search: feedSearch || undefined,
    }, { page: feedPage, pageSize: 25 }),
    enabled: Boolean(token),
  });

  const progressQuery = useQuery({
    queryKey: ["events-analysis-progress"],
    queryFn: () => api.getEventsAnalysisProgress(token!),
    enabled: Boolean(token),
    refetchInterval: (query) => (query.state.data?.active ? 1200 : false),
  });

  const progress = progressQuery.data ?? null;

  const invalidateIntelligence = () => {
    queryClient.invalidateQueries({ queryKey: ["events-overview"] });
    queryClient.invalidateQueries({ queryKey: ["events-conversations"] });
  };

  useEffect(() => {
    if (!ackFeedback) return;
    const timeout = window.setTimeout(() => setAckFeedback(null), ackFeedback.kind === "success" ? 6500 : 9000);
    return () => window.clearTimeout(timeout);
  }, [ackFeedback]);

  useEffect(() => () => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
  }, []);

  // Quando o run termina (ativo → inativo), recarrega os dados na hora.
  useEffect(() => {
    if (progress?.active) {
      wasActiveRef.current = true;
      setProgressDismissed(false);
      return;
    }
    if (wasActiveRef.current && progress && !progress.active) {
      wasActiveRef.current = false;
      invalidateIntelligence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.active]);

  const todayStr = toDateInput(new Date());
  const isSinglePastDay = dateRange.from === dateRange.to && dateRange.from < todayStr;

  const runMutation = useMutation({
    // Dia passado selecionado → analise retroativa daquele dia inteiro.
    mutationFn: () => api.runEventsAnalysis(token!, isSinglePastDay ? dateRange.from : undefined),
    onSuccess: () => {
      setProgressDismissed(false);
      queryClient.invalidateQueries({ queryKey: ["events-analysis-progress"] });
    },
  });

  const ackMutation = useMutation({
    mutationFn: ({ id }: { id: string; chatName: string }) => api.ackConversationInsight(token!, id),
    onMutate: () => {
      setAckFeedback(null);
      setCompletingId(null);
    },
    onSuccess: (acknowledged, variables) => {
      queryClient.setQueriesData<ConversationInsightsListResponse>(
        { queryKey: ["events-conversations"] },
        (current) => current
          ? {
              ...current,
              insights: current.insights.map((insight) =>
                insight.id === acknowledged.id ? acknowledged : insight),
            }
          : current,
      );
      setCompletingId(acknowledged.id);
      setAckFeedback({
        kind: "success",
        message: `${variables.chatName} foi concluída e guardada na aba Concluídos. Se o caso piorar, ela volta automaticamente ao Radar.`,
      });
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = window.setTimeout(() => {
        setCompletingId(null);
        invalidateIntelligence();
      }, 900);
    },
    onError: (error) => {
      setAckFeedback({
        kind: "error",
        message: error instanceof Error
          ? `Não foi possível marcar como visto: ${error.message}`
          : "Não foi possível marcar como visto. Tente novamente.",
      });
    },
  });

  const radarWhatsappPreviewMutation = useMutation({
    mutationFn: (options: { detailLevel: RadarWhatsappDetailLevel; alertLimit: RadarWhatsappAlertLimit }) =>
      api.previewRadarWhatsapp(token!, { ...period, ...options }),
  });

  const radarWhatsappSendMutation = useMutation({
    mutationFn: () => api.sendRadarWhatsapp(token!, {
      ...period,
      detailLevel: radarDetailLevel,
      alertLimit: radarAlertLimit,
    }),
  });

  const refreshRadarWhatsappPreview = (
    detailLevel: RadarWhatsappDetailLevel,
    alertLimit: RadarWhatsappAlertLimit,
  ) => {
    setRadarDetailLevel(detailLevel);
    setRadarAlertLimit(alertLimit);
    radarWhatsappSendMutation.reset();
    radarWhatsappPreviewMutation.mutate({ detailLevel, alertLimit });
  };

  const openRadarWhatsappPreview = () => {
    radarWhatsappSendMutation.reset();
    radarWhatsappPreviewMutation.reset();
    setRadarWhatsappOpen(true);
    radarWhatsappPreviewMutation.mutate({ detailLevel: radarDetailLevel, alertLimit: radarAlertLimit });
  };

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.resolveEvent(token!, id, { resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-list"] });
    },
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
    setFeedPage(1);
  };

  const selectTab = (tab: FeedTabId) => {
    setFeedTab(tab);
    setFeedPage(1);
    setSelectedId(null);
    // Trocar de aba e uma intencao nova: filtros de texto/tema anteriores
    // ficariam "grudados" invisiveis e fariam a lista parecer quebrada.
    setFeedSearch("");
    setFeedTopic(null);
  };

  const overview = overviewQuery.data;
  const overviewFailed = overviewQuery.isError;
  const overviewErrorMessage = overviewQuery.error instanceof Error ? overviewQuery.error.message : "";
  const briefing = overview?.briefing ?? null;
  const status = overview?.status;
  const stats = overview?.stats;
  const capture = overview?.capture;
  const runs = overview?.runs ?? [];
  const coveragePercent = capture && capture.conversationsWithCustomer > 0
    ? Math.min(100, Math.round((capture.analyzedToday / capture.conversationsWithCustomer) * 100))
    : 0;
  const maxHourly = capture?.hourly.reduce((max, point) => Math.max(max, point.count), 0) ?? 0;
  const hourlyBars = useMemo(() => {
    if (!capture) return [] as Array<{ hour: number; count: number }>;
    const byHour = new Map(capture.hourly.map((point) => [point.hour, point.count]));
    const bars: Array<{ hour: number; count: number }> = [];
    for (let hour = 7; hour <= 20; hour += 1) {
      bars.push({ hour, count: byHour.get(hour) ?? 0 });
    }
    return bars;
  }, [capture]);
  const radarCount = stats?.openRadar ?? 0;
  const completedCount = stats?.completed ?? 0;
  const topics = overview?.topics ?? [];
  const insights = insightsQuery.data?.insights ?? [];
  const insightsTotal = insightsQuery.data?.total ?? 0;
  const maxTopicCount = topics.reduce((max, topic) => Math.max(max, topic.count), 0);
  const briefingSections = BRIEFING_SECTIONS
    .map((section) => ({ ...section, items: readBriefingSection(briefing, section.key) }))
    .filter((section) => section.items.length > 0);
  const briefingComplete = Boolean(briefing?.narrative) && (stats?.conversations ?? 0) > 0 && radarCount === 0;

  const selected = useMemo(() => {
    if (!insights.length) return null;
    return insights.find((insight) => insight.id === selectedId) ?? insights[0]!;
  }, [insights, selectedId]);

  const criticalCount = stats?.byAttention.critical ?? 0;
  const highCount = stats?.byAttention.high ?? 0;
  const mood = !stats || stats.conversations === 0
    ? { tone: "waiting", icon: <Bot size={19} />, title: "Aguardando leituras", detail: "A IA ainda não leu conversas neste período." }
    : radarCount === 0
      ? { tone: "calm", icon: <CheckCheck size={19} />, title: "Tudo concluído", detail: "Todas as conversas que exigiam atenção foram revisadas." }
    : criticalCount > 0
      ? { tone: "critical", icon: <Flame size={19} />, title: "Dia com pontos críticos", detail: criticalCount === 1 ? "1 conversa crítica em aberto" : `${criticalCount} conversas críticas em aberto` }
      : highCount > 0 || (stats.complaints ?? 0) > 0
        ? { tone: "warning", icon: <AlertTriangle size={19} />, title: "Dia pede atenção", detail: `${highCount + criticalCount === 1 ? "1 alerta" : `${highCount + criticalCount} alertas`} · ${stats.complaints === 1 ? "1 reclamação" : `${stats.complaints} reclamações`}` }
        : { tone: "calm", icon: <ShieldCheck size={19} />, title: "Dia tranquilo", detail: "Nenhum alerta relevante nas conversas lidas" };

  const showProgress = Boolean(progress) && !progressDismissed && (
    progress!.active || (progress!.finishedAt && Date.now() - new Date(progress!.finishedAt).getTime() < 5 * 60 * 1000)
  );

  const currentStepIndex = progress
    ? progress.phase === "done" || progress.phase === "error"
      ? PROGRESS_STEPS.length
      : Math.max(0, PROGRESS_STEPS.findIndex((step) => step.phases.includes(progress.phase)))
    : 0;

  const selectedOrigin = selected ? originLabel(selected) : null;
  const selectedSentiment = selected ? sentimentInfo(selected.sentimentScore) : null;
  const selectedFlags = selected ? Object.entries(selected.flags).filter(([, value]) => value) : [];

  return (
    <div className="wtl-page">
      {ackFeedback && (
        <div
          className={`wtl-ack-toast ${ackFeedback.kind}`}
          role={ackFeedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span className="wtl-ack-toast-icon">
            {ackFeedback.kind === "success" ? <CheckCheck size={18} /> : <AlertTriangle size={18} />}
          </span>
          <div>
            <strong>{ackFeedback.kind === "success" ? "Conversa concluída" : "Ação não concluída"}</strong>
            <span>{ackFeedback.message}</span>
          </div>
          <button type="button" aria-label="Fechar aviso" onClick={() => setAckFeedback(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Faixa superior ── */}
      <header className="wtl-band">
        <div className="wtl-band-left">
          <span className="wtl-band-logo"><MessageSquare size={22} /></span>
          <div>
            <h1>Inteligência do WhatsApp</h1>
            <p>
              {overviewFailed
                ? <>
                    <span className="wtl-live-dot off" />
                    Sem resposta do servidor de inteligência — o backend precisa do deploy novo
                  </>
                : status?.enabled
                  ? <>
                      <span className="wtl-live-dot" />
                      {(status.messagesToday ?? 0).toLocaleString("pt-BR")} mensagens hoje · {status.conversationsAnalyzedToday} conversas lidas pela IA · leitura automática às {status.dailyRunHour}h
                      <button type="button" className="wtl-how-link" onClick={() => setHowOpen((open) => !open)}>como funciona?</button>
                    </>
                  : <>
                      <span className="wtl-live-dot off" />
                      Captura ativa · IA desligada — veja como ligar logo abaixo
                    </>}
            </p>
          </div>
        </div>

        <div className="wtl-band-right">
          <div className="wtl-presets">
            <button type="button" className={dateRange.from === toDateInput(new Date()) && dateRange.to === dateRange.from ? "active" : ""} onClick={() => setPresetDays(1)}>Hoje</button>
            <button type="button" onClick={() => setPresetDays(7)}>7 dias</button>
            <button type="button" onClick={() => setPresetDays(30)}>30 dias</button>
          </div>
          <div className="wtl-dates" title="Escolha um dia ou período específico">
            <input
              type="date"
              value={dateRange.from}
              max={toDateInput(new Date())}
              onChange={(event) => {
                const from = event.target.value;
                setDateRange((prev) => ({ from, to: prev.to < from ? from : prev.to }));
                setFeedPage(1);
              }}
            />
            <span>—</span>
            <input
              type="date"
              value={dateRange.to}
              max={toDateInput(new Date())}
              onChange={(event) => {
                const to = event.target.value;
                setDateRange((prev) => ({ from: prev.from > to ? to : prev.from, to }));
                setFeedPage(1);
              }}
            />
          </div>
          {isManager && (
            <button
              type="button"
              className="wtl-radar-whatsapp-btn"
              onClick={openRadarWhatsappPreview}
              title="Ver o resumo antes de enviar para o WhatsApp da Lili"
            >
              <Send size={16} /> Enviar radar
            </button>
          )}
          {isManager && (
            <div className="wtl-run-wrap">
              <button
                type="button"
                className="wtl-run-btn"
                disabled={Boolean(progress?.active) || runMutation.isPending || !status?.canRunManually}
                title={status?.canRunManually
                  ? isSinglePastDay
                    ? `A IA lê todas as conversas de ${dateRange.from.split("-").reverse().join("/")} (análise retroativa)`
                    : "Pede para a IA reler as conversas de hoje agora"
                  : blockedReasonLabel(status?.manualBlockedReason)}
                onClick={() => runMutation.mutate()}
              >
                {progress?.active || runMutation.isPending ? <Loader2 size={17} className="spin" /> : <Zap size={17} />}
                {progress?.active
                  ? "Analisando..."
                  : isSinglePastDay
                    ? `Analisar ${dateRange.from.split("-").reverse().slice(0, 2).join("/")}`
                    : "Analisar agora"}
              </button>
              {overviewFailed ? (
                <small className="wtl-run-blocked" title={overviewErrorMessage}>
                  O servidor não respondeu a rota de inteligência — faça o deploy do backend no EasyPanel (o front já está na versão nova).
                </small>
              ) : status && !status.canRunManually && (
                <small className="wtl-run-blocked">{blockedReasonLabel(status.manualBlockedReason)}</small>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Como funciona ── */}
      {howOpen && (
        <div className="wtl-how">
          <div><strong>1 · Captura</strong><p>Toda mensagem dos grupos e privados das vendedoras entra no monitor, o dia inteiro, sozinha.</p></div>
          <div><strong>2 · Leitura</strong><p>Às {status?.dailyRunHour ?? 16}h a IA lê as conversas do dia (reclamações e riscos primeiro) e resume cada uma: humor do cliente, alerta, tema e próximo passo. O botão &ldquo;Analisar agora&rdquo; faz essa mesma leitura na hora, relendo o dia inteiro.</p></div>
          <div><strong>3 · Entrega</strong><p>O que exige ação aparece no Radar; o resumo gerencial vira o briefing. Tudo é apagado após {status?.retentionDays ?? 30} dias.</p></div>
        </div>
      )}

      {/* ── Esteira de progresso da IA ── */}
      {showProgress && progress && (
        <div className={`wtl-progress ${progress.phase}`}>
          <div className="wtl-progress-steps">
            {PROGRESS_STEPS.map((step, index) => {
              const state = index < currentStepIndex ? "done" : index === currentStepIndex && progress.active ? "current" : "pending";
              return (
                <div key={step.label} className={`wtl-step ${state}`}>
                  <span className="wtl-step-dot">
                    {state === "done" ? <Check size={12} /> : state === "current" ? <Loader2 size={12} className="spin" /> : index + 1}
                  </span>
                  <span className="wtl-step-label">
                    {step.label}
                    {state === "current" && progress.phase === "analyzing" && progress.chunkCount > 0 && (
                      <em> lote {progress.chunkIndex}/{progress.chunkCount}</em>
                    )}
                  </span>
                </div>
              );
            })}
            <div className={`wtl-step ${progress.phase === "done" ? "done final" : progress.phase === "error" ? "error final" : "pending"}`}>
              <span className="wtl-step-dot">{progress.phase === "done" ? <CheckCheck size={12} /> : progress.phase === "error" ? "!" : PROGRESS_STEPS.length + 1}</span>
              <span className="wtl-step-label">Pronto</span>
            </div>
          </div>
          <div className="wtl-progress-msg">
            <span>{progress.message}</span>
            {!progress.active && (
              <button type="button" onClick={() => setProgressDismissed(true)}>fechar</button>
            )}
          </div>
        </div>
      )}

      {/* ── Backend desatualizado / fora do ar ── */}
      {isManager && overviewFailed && (
        <div className="wtl-setup">
          <span className="wtl-setup-icon"><AlertTriangle size={20} /></span>
          <div>
            <strong>O servidor ainda não tem a versão nova da inteligência</strong>
            <p>
              Esta tela é nova, mas a API no servidor não respondeu a rota da inteligência
              {overviewErrorMessage ? <> (erro: <code>{overviewErrorMessage.slice(0, 80)}</code>)</> : null}.
              Quase sempre é o deploy do backend que não rodou: no EasyPanel, abra o serviço da API e verifique
              se o último deploy da branch <code>main</code> concluiu (aba Deployments) — se falhou, rode de novo.
              O front na Vercel já está atualizado.
            </p>
          </div>
        </div>
      )}

      {/* ── IA desligada: como ligar ── */}
      {isManager && status && !status.enabled && (
        <div className="wtl-setup">
          <span className="wtl-setup-icon"><Bot size={20} /></span>
          <div>
            <strong>A inteligência está desligada neste servidor</strong>
            <p>
              As mensagens continuam sendo capturadas normalmente (veja a &ldquo;Coleta ao vivo&rdquo; abaixo), mas a IA não está lendo as conversas.
              Para ligar: no painel do servidor, defina <code>EVENTS_AI_BATCH_ENABLED=true</code> e configure a chave <code>CEREBRAS_API_KEY</code> (ou <code>GEMINI_API_KEY</code>).
              No próximo restart, tudo aqui liga sozinho.
            </p>
          </div>
        </div>
      )}

      {/* ── Pulso + números ── */}
      <div className="wtl-pulseband">
        <div className={`wtl-mood ${mood.tone}`}>
          <span className="wtl-mood-icon">{mood.icon}</span>
          <div>
            <strong>{mood.title}</strong>
            <span>{mood.detail}</span>
          </div>
        </div>
        <div className="wtl-counters">
          <button type="button" onClick={() => selectTab("all")}>
            <span className="wtl-counter-ic neutral"><MessageSquare size={16} /></span>
            <span className="wtl-counter-txt"><strong>{stats?.conversations ?? 0}</strong><span>conversas lidas</span></span>
          </button>
          <button type="button" className="danger" onClick={() => selectTab("radar")}>
            <span className="wtl-counter-ic danger"><Flame size={16} /></span>
            <span className="wtl-counter-txt"><strong>{radarCount}</strong><span>no radar</span></span>
          </button>
          <button type="button" className="danger" onClick={() => selectTab("reclamacao")}>
            <span className="wtl-counter-ic danger"><AlertTriangle size={16} /></span>
            <span className="wtl-counter-txt"><strong>{stats?.complaints ?? 0}</strong><span>reclamações</span></span>
          </button>
          <button type="button" className="warning" onClick={() => selectTab("sem_resposta")}>
            <span className="wtl-counter-ic warning"><Frown size={16} /></span>
            <span className="wtl-counter-txt"><strong>{stats?.unanswered ?? 0}</strong><span>sem resposta</span></span>
          </button>
          <button type="button" className="info" onClick={() => selectTab("oportunidade")}>
            <span className="wtl-counter-ic info"><Sparkles size={16} /></span>
            <span className="wtl-counter-txt"><strong>{stats?.opportunities ?? 0}</strong><span>oportunidades</span></span>
          </button>
          <button type="button" className="positive" onClick={() => selectTab("elogio")}>
            <span className="wtl-counter-ic positive"><ThumbsUp size={16} /></span>
            <span className="wtl-counter-txt"><strong>{stats?.praises ?? 0}</strong><span>elogios</span></span>
          </button>
        </div>
      </div>

      {/* ── Prova de coleta + atividade da IA ── */}
      {isManager && capture && (
        <div className="wtl-datacheck">
          <div className="wtl-capture">
            <header>
              <span className="wtl-live-dot" />
              <strong>Coleta ao vivo · hoje</strong>
              <small>
                {capture.lastMessageAt
                  ? `última mensagem capturada às ${formatTime(capture.lastMessageAt)}`
                  : "nenhuma mensagem capturada ainda"}
              </small>
            </header>
            <div className="wtl-capture-numbers">
              <div><strong>{capture.messagesToday.toLocaleString("pt-BR")}</strong><span>mensagens capturadas</span></div>
              <div><strong>{capture.conversationsWithCustomer}</strong><span>conversas com cliente</span></div>
              <div><strong>{capture.groupConversations}</strong><span>grupos ativos</span></div>
              <div><strong>{capture.privateConversations}</strong><span>privados ativos</span></div>
            </div>
            <div className="wtl-hourly" title="Mensagens capturadas por hora (7h às 20h)">
              {hourlyBars.map((bar) => (
                <span key={bar.hour} className="wtl-hourly-col" title={`${bar.hour}h: ${bar.count} mensagens`}>
                  <span
                    className="wtl-hourly-bar"
                    style={{ height: `${maxHourly > 0 ? Math.max(bar.count > 0 ? 8 : 2, Math.round((bar.count / maxHourly) * 100)) : 2}%` }}
                  />
                  <em>{bar.hour}</em>
                </span>
              ))}
            </div>
            <div className="wtl-coverage">
              <div className="wtl-coverage-bar">
                <span style={{ width: `${coveragePercent}%` }} />
              </div>
              <small>
                {status?.enabled ? (
                  <>
                    IA leu <strong>{capture.analyzedToday}</strong> de <strong>{capture.conversationsWithCustomer}</strong> conversas com cliente ({coveragePercent}%)
                    {capture.pendingToday > 0 && <> · <strong>{capture.pendingToday}</strong> aguardando a leitura das {status?.dailyRunHour ?? 16}h ou o botão</>}
                  </>
                ) : (
                  <>Captura funcionando — <strong>{capture.conversationsWithCustomer}</strong> conversas com cliente prontas para a IA ler quando for ligada.</>
                )}
              </small>
            </div>
          </div>

          <div className="wtl-runs">
            <header>
              <Bot size={14} />
              <strong>Atividade da IA</strong>
            </header>
            {runs.length === 0 ? (
              <p className="wtl-runs-empty">A IA ainda não rodou. A primeira leitura acontece às {status?.dailyRunHour ?? 16}h ou pelo botão &ldquo;Analisar agora&rdquo;.</p>
            ) : (
              <ul>
                {runs.slice(0, 6).map((run, index) => (
                  <li key={`${run.finishedAt}-${index}`} className={run.status.toLowerCase()}>
                    <span className="wtl-run-dot" />
                    <span className="wtl-run-text">
                      {formatDateTime(run.finishedAt)} · {run.runSource === "manual" ? "manual" : "automática"} · {run.kind === "briefing" ? "briefing do dia" : `${run.eventCount} conversas lidas`}
                      {run.status === "FAILED" && <em title={run.errorMessage ?? undefined}> — falhou{run.errorMessage ? `: ${run.errorMessage.slice(0, 60)}...` : ""}</em>}
                      {run.status === "SKIPPED" && <em> — sem novidade</em>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {status?.lastError && (
              <p className="wtl-runs-error" title={status.lastError}>
                <AlertTriangle size={12} /> Último erro: {status.lastError.slice(0, 110)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Briefing: mensagem do assistente ── */}
      {isManager && (
        <section className={`wtl-assistant ${briefingComplete ? "completed" : ""}`}>
          <span className="wtl-assistant-avatar"><Bot size={19} /></span>
          <div className="wtl-assistant-bubble">
            <div className="wtl-assistant-head">
              <strong>Assistente XP · Briefing do dia</strong>
              <div className="wtl-assistant-head-status">
                {briefingComplete && (
                  <span className="wtl-briefing-complete"><CheckCheck size={13} /> Tudo concluído</span>
                )}
                <small>{briefing ? formatDateTime(briefing.generatedAt) : ""}</small>
              </div>
            </div>
            {briefing?.narrative ? (
              <>
                {briefing.narrative.split(/\n{1,2}/).filter(Boolean).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {briefingSections.length > 0 && (
                  <div className="wtl-assistant-sections">
                    {briefingSections.map((section) => (
                      <details key={section.key} className={section.key}>
                        <summary>{section.title} <em>{section.items.length}</em></summary>
                        <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
                      </details>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="wtl-assistant-empty">
                {status?.enabled
                  ? (status.messagesToday ?? 0) > 0
                    ? `Já capturei ${status.messagesToday.toLocaleString("pt-BR")} mensagens hoje. Às ${status.dailyRunHour}h eu leio tudo e escrevo aqui o resumo do dia — ou clique em "Analisar agora" para eu ler já.`
                    : "Ainda não chegou mensagem hoje. Assim que os grupos movimentarem, eu começo a leitura."
                  : "Estou de olho nas mensagens que chegam, mas minha leitura está desligada. Assim que ligarem a chave de IA no servidor, eu escrevo aqui o resumo do dia."}
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Inbox: feed + detalhe ── */}
      <div className="wtl-inbox">
        <aside className="wtl-feed">
          <div className="wtl-tabs">
            {FEED_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={feedTab === tab.id ? "active" : ""}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
                {tab.id === "radar" && radarCount > 0 && <em>{radarCount}</em>}
                {tab.id === "completed" && completedCount > 0 && <em className="completed">{completedCount}</em>}
              </button>
            ))}
          </div>
          <div className="wtl-feed-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Buscar conversa, resumo ou tema..."
              value={feedSearch}
              onChange={(event) => {
                setFeedSearch(event.target.value);
                setFeedPage(1);
              }}
            />
            {feedTopic && (
              <button
                type="button"
                className="wtl-topic-filter-chip"
                title="Remover filtro de tema"
                onClick={() => {
                  setFeedTopic(null);
                  setFeedPage(1);
                }}
              >
                tema: {feedTopic} ✕
              </button>
            )}
          </div>

          <div className="wtl-feed-list">
            {insightsQuery.isLoading ? (
              <div className="wtl-feed-empty"><Loader2 size={18} className="spin" /> Carregando...</div>
            ) : insights.length === 0 ? (
              <div className="wtl-feed-empty">
                {feedTab === "radar"
                  ? <><ShieldCheck size={18} /> Nada no radar. Tudo sob controle.</>
                  : feedTab === "completed"
                    ? <><CheckCheck size={18} /> Nenhuma conversa concluída neste período.</>
                  : <><MessageSquare size={18} /> Nenhuma conversa aqui {status?.enabled ? "— a IA preenche conforme lê o dia." : "— a IA está desligada."}</>}
              </div>
            ) : (
              insights.map((insight) => {
                const origin = originLabel(insight);
                const sentiment = sentimentInfo(insight.sentimentScore);
                const isSelected = selected?.id === insight.id;
                return (
                  <button
                    key={insight.id}
                    type="button"
                    className={`wtl-feed-item ${isSelected ? "selected" : ""} ${insight.acknowledgedAt ? "completed" : ""} ${completingId === insight.id ? "completing" : ""} sev-${insight.attentionLevel}`}
                    onClick={() => setSelectedId(insight.id)}
                  >
                    <span className="wtl-avatar" style={{ background: avatarColor(insight.chatName || "?") }}>
                      {initialsOf(insight.chatName || "?")}
                    </span>
                    <span className="wtl-feed-main">
                      <span className="wtl-feed-top">
                        <strong>{insight.chatName || "Conversa sem nome"}</strong>
                        <time>{formatTime(insight.lastMessageAt)}</time>
                      </span>
                      <span className="wtl-feed-origin">
                        <em className={`wtl-kind ${insight.isGroup ? "group" : "private"}`}>{origin.kind}</em>
                        {origin.detail && <span>{origin.detail}</span>}
                      </span>
                      <span className="wtl-feed-summary">{insight.summary}</span>
                      <span className="wtl-feed-badges">
                        {(insight.attentionLevel === "high" || insight.attentionLevel === "critical") && (
                          <em className={`wtl-att ${insight.attentionLevel}`}>{ATTENTION_LABELS[insight.attentionLevel]}</em>
                        )}
                        {insight.topics[0] && <em className="wtl-topic-chip">{insight.topics[0]}</em>}
                        <em className={`wtl-sent ${sentiment.tone}`}>{sentiment.icon}</em>
                        {insight.acknowledgedAt && (
                          <em className="wtl-seen" title={`Visto em ${formatDateTime(insight.acknowledgedAt)}`}>
                            <CheckCheck size={12} /> Concluído
                          </em>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {insightsTotal > 25 && (
            <div className="wtl-feed-pager">
              <button disabled={feedPage === 1} onClick={() => setFeedPage((page) => page - 1)}>‹</button>
              <span>{feedPage} / {Math.max(1, Math.ceil(insightsTotal / 25))}</span>
              <button disabled={feedPage >= Math.ceil(insightsTotal / 25)} onClick={() => setFeedPage((page) => page + 1)}>›</button>
            </div>
          )}
        </aside>

        <section className="wtl-detail">
          {!selected ? (
            <div className="wtl-detail-empty">
              <Bot size={34} />
              <p>Selecione uma conversa na lista para ver a leitura completa da IA.</p>
            </div>
          ) : (
            <>
              <header className="wtl-detail-head">
                <span className="wtl-avatar big" style={{ background: avatarColor(selected.chatName || "?") }}>
                  {initialsOf(selected.chatName || "?")}
                </span>
                <div className="wtl-detail-id">
                  <h2>{selected.chatName || "Conversa sem nome"}</h2>
                  <div className="wtl-detail-meta">
                    <em className={`wtl-kind ${selected.isGroup ? "group" : "private"}`}>{selectedOrigin?.kind}</em>
                    {!selected.isGroup && formatPhoneFromJid(selected.remoteJid) && (
                      <span><Phone size={12} /> {formatPhoneFromJid(selected.remoteJid)}</span>
                    )}
                    {selected.agentName && <span><Users size={12} /> vendedora {selected.agentName}</span>}
                    <span>
                      {selected.messageCount} mensagens ({selected.customerMessageCount} do cliente)
                      {selected.firstMessageAt && selected.lastMessageAt && (
                        <> · das {formatTime(selected.firstMessageAt)} às {formatTime(selected.lastMessageAt)}</>
                      )}
                    </span>
                  </div>
                  <div className="wtl-detail-proof">
                    <Bot size={11} /> Lida pela IA às {formatDateTime(selected.analyzedAt)}
                    {selected.model && <> · {selected.model}</>}
                  </div>
                </div>
                {selectedSentiment && (
                  <span className={`wtl-detail-sent ${selectedSentiment.tone}`}>
                    {selectedSentiment.icon} {selectedSentiment.label}
                  </span>
                )}
              </header>

              {selected.attentionLevel !== "none" && selected.attentionLevel !== "low" && (
                <div className={`wtl-detail-alert ${selected.attentionLevel}`}>
                  {selected.attentionLevel === "critical" ? <Flame size={15} /> : <AlertTriangle size={15} />}
                  <div>
                    <strong>Atenção {ATTENTION_LABELS[selected.attentionLevel].toLowerCase()}</strong>
                    {selected.attentionReason && <span>{selected.attentionReason}</span>}
                  </div>
                </div>
              )}

              <div className="wtl-detail-block">
                <h3><Sparkles size={13} /> O que aconteceu</h3>
                <p>{selected.summary}</p>
              </div>

              {selected.highlights.length > 0 && (
                <div className="wtl-detail-block">
                  <h3><MessageSquare size={13} /> Falas marcantes</h3>
                  <div className="wtl-quotes">
                    {selected.highlights.map((quote, index) => (
                      <div key={index} className="wtl-quote-bubble">
                        <p>{quote.texto}</p>
                        <span>{quote.autor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.actionItems.length > 0 && (
                <div className="wtl-detail-block">
                  <h3><Zap size={13} /> Próximos passos sugeridos</h3>
                  <ul className="wtl-actions">
                    {selected.actionItems.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </div>
              )}

              {(selected.topics.length > 0 || selectedFlags.length > 0) && (
                <div className="wtl-detail-tags">
                  {selected.topics.map((topic) => <em key={topic} className="wtl-topic-chip">{topic}</em>)}
                  {selectedFlags.map(([key]) => (
                    <em key={key} className={`wtl-flag ${key}`}>{FLAG_LABELS[key] ?? key}</em>
                  ))}
                </div>
              )}

              <footer className="wtl-detail-actions">
                <button type="button" className="wtl-btn-whats" onClick={() => openConversation(seedFromInsight(selected))}>
                  <Smartphone size={15} /> Abrir a conversa
                </button>
                {selected.acknowledgedAt ? (
                  <div className="wtl-acknowledged-state" role="status">
                    <span><CheckCheck size={16} /></span>
                    <div>
                      <strong>Conversa concluída</strong>
                      <small>Concluída em {formatDateTime(selected.acknowledgedAt)}. O histórico fica na aba Concluídos e volta ao Radar somente se piorar.</small>
                    </div>
                  </div>
                ) : (selected.attentionLevel === "high" || selected.attentionLevel === "critical") && (
                  <button
                    type="button"
                    className="wtl-btn-plain wtl-btn-complete"
                    disabled={ackMutation.isPending}
                    title="Conclui e guarda na aba Concluídos"
                    onClick={() => ackMutation.mutate({
                      id: selected.id,
                      chatName: selected.chatName || "A conversa",
                    })}
                  >
                    {ackMutation.isPending && ackMutation.variables?.id === selected.id
                      ? <Loader2 size={15} className="spin" />
                      : <CheckCheck size={15} />}
                    {ackMutation.isPending && ackMutation.variables?.id === selected.id
                      ? "Marcando..."
                      : "Marcar como concluído"}
                  </button>
                )}
              </footer>
            </>
          )}
        </section>
      </div>

      {/* ── Temas ── */}
      <section className="wtl-topics">
        <header>
          <Sparkles size={16} />
          <div>
            <h2>Do que os clientes falaram</h2>
            <p>Um tema por conversa · <em className="wtl-legend ok">verde</em> tranquilo · <em className="wtl-legend mixed">amarelo</em> teve reclamação · <em className="wtl-legend bad">vermelho</em> clima ruim</p>
          </div>
        </header>
        {topics.length === 0 ? (
          <p className="wtl-topics-empty">Os temas aparecem depois das primeiras leituras.</p>
        ) : (
          <div className="wtl-topic-rows">
            {topics.slice(0, 10).map((topic) => {
              const width = maxTopicCount > 0 ? Math.max(8, Math.round((topic.count / maxTopicCount) * 100)) : 0;
              const tone = topic.negativeCount === 0
                ? "ok"
                : topic.negativeCount >= topic.count / 2 ? "bad" : "mixed";
              return (
                <button
                  key={topic.topic}
                  type="button"
                  title={topic.negativeCount > 0
                    ? `${topic.count} conversas — ${topic.negativeCount} com clima negativo`
                    : `${topic.count} conversas, clima tranquilo`}
                  onClick={() => {
                    setFeedTab("all");
                    setFeedSearch("");
                    setFeedTopic(topic.topic);
                    setFeedPage(1);
                    setSelectedId(null);
                  }}
                >
                  <span className="wtl-topic-name">{topic.topic}</span>
                  <span className={`wtl-topic-bar ${tone}`}>
                    <span className="fill" style={{ width: `${width}%` }} />
                  </span>
                  <span className="wtl-topic-count">
                    {topic.count}
                    {topic.negativeCount > 0 && <em className="wtl-topic-neg-count">{topic.negativeCount} 😠</em>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Registro técnico (regras) ── */}
      <section className="wtl-legacy">
        <button type="button" className="wtl-legacy-toggle" onClick={() => setLegacyOpen((open) => !open)}>
          <ChevronDown size={15} className={legacyOpen ? "open" : ""} />
          Registro técnico por mensagem (detecção por regras)
        </button>
        {legacyOpen && (
          <div className="wtl-legacy-body">
            <EventsFilters filters={legacyFilters} shortcuts={[]} onChange={setLegacyFilters} />
            <EventsListView
              events={legacyEventsQuery.data?.events || []}
              onResolve={(event) => {
                const note = prompt("Deseja adicionar uma nota de resolução?", "Resolvido via atendimento.");
                if (note !== null) resolveMutation.mutate({ id: event.id, note });
              }}
              onViewConversation={(event) => openConversation(seedFromEvent(event))}
            />
          </div>
        )}
      </section>

      {radarWhatsappOpen && (
        <div className="wtl-radar-modal-backdrop" role="presentation" onMouseDown={() => {
          if (!radarWhatsappSendMutation.isPending) setRadarWhatsappOpen(false);
        }}>
          <section
            className="wtl-radar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wtl-radar-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="wtl-radar-modal-head">
              <span className="wtl-radar-modal-icon"><Send size={19} /></span>
              <div>
                <h2 id="wtl-radar-modal-title">Preview do radar</h2>
                <p>Confira exatamente o que será enviado antes de confirmar.</p>
              </div>
              <button
                type="button"
                className="wtl-radar-modal-close"
                aria-label="Fechar preview"
                disabled={radarWhatsappSendMutation.isPending}
                onClick={() => setRadarWhatsappOpen(false)}
              >
                <X size={18} />
              </button>
            </header>

            {radarWhatsappPreviewMutation.isPending ? (
              <div className="wtl-radar-modal-loading"><Loader2 size={22} className="spin" /> Montando resumo do radar...</div>
            ) : radarWhatsappPreviewMutation.isError ? (
              <div className="wtl-radar-modal-error">
                <AlertTriangle size={18} />
                <div>
                  <strong>Não foi possível montar o preview</strong>
                  <span>{radarWhatsappPreviewMutation.error instanceof Error ? radarWhatsappPreviewMutation.error.message : "Tente novamente."}</span>
                </div>
              </div>
            ) : radarWhatsappPreviewMutation.data ? (
              <>
                <div className="wtl-radar-route">
                  <div><span>Instância de envio</span><strong>{radarWhatsappPreviewMutation.data.instanceLabel}</strong></div>
                  <span className="wtl-radar-route-arrow">→</span>
                  <div><span>Destino padrão</span><strong>Lili · (11) 99743-1733</strong></div>
                </div>

                <div className="wtl-radar-options">
                  <div className="wtl-radar-option-group">
                    <div className="wtl-radar-option-label">
                      <strong>Nível de detalhe</strong>
                      <span>{RADAR_DETAIL_OPTIONS.find((option) => option.id === radarDetailLevel)?.description}</span>
                    </div>
                    <div className="wtl-radar-segments" role="group" aria-label="Nível de detalhe da mensagem">
                      {RADAR_DETAIL_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={radarDetailLevel === option.id ? "active" : ""}
                          disabled={radarWhatsappPreviewMutation.isPending || radarWhatsappSendMutation.isPending}
                          title={option.description}
                          onClick={() => refreshRadarWhatsappPreview(option.id, radarAlertLimit)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="wtl-radar-option-group alerts">
                    <div className="wtl-radar-option-label">
                      <strong>Quantidade de alertas</strong>
                      <span>Sempre em ordem: Crítico → Alto → mais recente.</span>
                    </div>
                    <div className="wtl-radar-segments compact" role="group" aria-label="Quantidade máxima de alertas">
                      {RADAR_ALERT_LIMITS.map((limit) => (
                        <button
                          key={limit}
                          type="button"
                          className={radarAlertLimit === limit ? "active" : ""}
                          disabled={radarWhatsappPreviewMutation.isPending || radarWhatsappSendMutation.isPending}
                          onClick={() => refreshRadarWhatsappPreview(radarDetailLevel, limit)}
                        >
                          {limit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="wtl-radar-preview-label" htmlFor="wtl-radar-preview-message">
                  Mensagem que será enviada
                  <span>
                    {radarWhatsappPreviewMutation.data.includedAlertCount} de {radarWhatsappPreviewMutation.data.radarCount} {radarWhatsappPreviewMutation.data.radarCount === 1 ? "alerta" : "alertas"}
                  </span>
                </label>
                <textarea
                  id="wtl-radar-preview-message"
                  className="wtl-radar-preview-message"
                  value={radarWhatsappPreviewMutation.data.message}
                  readOnly
                  rows={18}
                />

                {radarWhatsappSendMutation.isSuccess && (
                  <div className="wtl-radar-modal-success">
                    <CheckCheck size={18} />
                    <div><strong>Resumo enviado com sucesso</strong><span>Enviado pela {radarWhatsappSendMutation.data.instanceLabel} para (11) 99743-1733.</span></div>
                  </div>
                )}
                {radarWhatsappSendMutation.isError && (
                  <div className="wtl-radar-modal-error compact">
                    <AlertTriangle size={18} />
                    <div><strong>O envio falhou</strong><span>{radarWhatsappSendMutation.error instanceof Error ? radarWhatsappSendMutation.error.message : "Tente novamente."}</span></div>
                  </div>
                )}

                <footer className="wtl-radar-modal-actions">
                  <button type="button" className="wtl-radar-cancel" disabled={radarWhatsappSendMutation.isPending} onClick={() => setRadarWhatsappOpen(false)}>
                    {radarWhatsappSendMutation.isSuccess ? "Fechar" : "Cancelar"}
                  </button>
                  {!radarWhatsappSendMutation.isSuccess && (
                    <button
                      type="button"
                      className="wtl-radar-confirm"
                      disabled={radarWhatsappSendMutation.isPending}
                      onClick={() => radarWhatsappSendMutation.mutate()}
                    >
                      {radarWhatsappSendMutation.isPending ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
                      {radarWhatsappSendMutation.isPending ? "Enviando..." : "Confirmar e enviar"}
                    </button>
                  )}
                </footer>
              </>
            ) : null}
          </section>
        </div>
      )}

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

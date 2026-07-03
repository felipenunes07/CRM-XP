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
  DailyBriefing,
  EventsIntelligenceProgress,
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

type FeedTabId = "radar" | "all" | "reclamacao" | "oportunidade" | "elogio" | "sem_resposta";

const FEED_TABS: Array<{ id: FeedTabId; label: string; flag?: string }> = [
  { id: "radar", label: "Radar" },
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
  const [feedPage, setFeedPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [progressDismissed, setProgressDismissed] = useState(false);
  const [chatState, setChatState] = useState<ChatState>(emptyChatState);
  const [legacyFilters, setLegacyFilters] = useState<EventsFilterState>({ page: 1, pageSize: 20 });
  const [legacyOpen, setLegacyOpen] = useState(false);
  const wasActiveRef = useRef(false);

  const period = useMemo(() => ({ dateFrom: dateRange.from, dateTo: dateRange.to }), [dateRange]);
  const activeTab = FEED_TABS.find((tab) => tab.id === feedTab) ?? FEED_TABS[0]!;

  const overviewQuery = useQuery({
    queryKey: ["events-overview", period],
    queryFn: () => api.getEventsOverview(token!, period),
    enabled: Boolean(token),
    refetchInterval: 120_000,
  });

  const insightsQuery = useQuery({
    queryKey: ["events-conversations", period, feedTab, feedSearch, feedPage],
    queryFn: () => api.listConversationInsights(token!, {
      ...period,
      flag: activeTab.flag,
      attention: feedTab === "radar" ? "high,critical" : undefined,
      onlyOpen: feedTab === "radar" ? true : undefined,
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

  const runMutation = useMutation({
    mutationFn: () => api.runEventsAnalysis(token!),
    onSuccess: () => {
      setProgressDismissed(false);
      queryClient.invalidateQueries({ queryKey: ["events-analysis-progress"] });
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
  };

  const overview = overviewQuery.data;
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
  const topics = overview?.topics ?? [];
  const insights = insightsQuery.data?.insights ?? [];
  const insightsTotal = insightsQuery.data?.total ?? 0;
  const maxTopicCount = topics.reduce((max, topic) => Math.max(max, topic.count), 0);
  const briefingSections = BRIEFING_SECTIONS
    .map((section) => ({ ...section, items: readBriefingSection(briefing, section.key) }))
    .filter((section) => section.items.length > 0);

  const selected = useMemo(() => {
    if (!insights.length) return null;
    return insights.find((insight) => insight.id === selectedId) ?? insights[0]!;
  }, [insights, selectedId]);

  const criticalCount = stats?.byAttention.critical ?? 0;
  const highCount = stats?.byAttention.high ?? 0;
  const mood = !stats || stats.conversations === 0
    ? { tone: "waiting", icon: <Bot size={19} />, title: "Aguardando leituras", detail: "A IA ainda não leu conversas neste período." }
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
      {/* ── Faixa superior ── */}
      <header className="wtl-band">
        <div className="wtl-band-left">
          <span className="wtl-band-logo"><MessageSquare size={22} /></span>
          <div>
            <h1>Inteligência do WhatsApp</h1>
            <p>
              {status?.enabled
                ? <>
                    <span className="wtl-live-dot" />
                    {(status.messagesToday ?? 0).toLocaleString("pt-BR")} mensagens hoje · {status.conversationsAnalyzedToday} conversas lidas pela IA · leitura automática às {status.dailyRunHour}h
                    <button type="button" className="wtl-how-link" onClick={() => setHowOpen((open) => !open)}>como funciona?</button>
                  </>
                : "IA desligada no servidor — ative EVENTS_AI_BATCH_ENABLED e configure a chave."}
            </p>
          </div>
        </div>

        <div className="wtl-band-right">
          <div className="wtl-presets">
            <button type="button" className={dateRange.from === toDateInput(new Date()) && dateRange.to === dateRange.from ? "active" : ""} onClick={() => setPresetDays(1)}>Hoje</button>
            <button type="button" onClick={() => setPresetDays(7)}>7 dias</button>
            <button type="button" onClick={() => setPresetDays(30)}>30 dias</button>
          </div>
          {isManager && (
            <button
              type="button"
              className="wtl-run-btn"
              disabled={Boolean(progress?.active) || runMutation.isPending || !status?.canRunManually}
              title={status?.canRunManually ? "Pede para a IA reler as conversas de hoje agora" : "Sem orçamento de IA disponível agora"}
              onClick={() => runMutation.mutate()}
            >
              {progress?.active || runMutation.isPending ? <Loader2 size={17} className="spin" /> : <Zap size={17} />}
              {progress?.active ? "Analisando..." : "Analisar agora"}
            </button>
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

      {/* ── Pulso + números ── */}
      <div className="wtl-pulseband">
        <div className={`wtl-mood ${mood.tone}`}>
          {mood.icon}
          <div>
            <strong>{mood.title}</strong>
            <span>{mood.detail}</span>
          </div>
        </div>
        <div className="wtl-counters">
          <button type="button" onClick={() => selectTab("all")}><strong>{stats?.conversations ?? 0}</strong><span>conversas lidas</span></button>
          <button type="button" className="danger" onClick={() => selectTab("radar")}><strong>{radarCount}</strong><span>no radar</span></button>
          <button type="button" className="danger" onClick={() => selectTab("reclamacao")}><strong>{stats?.complaints ?? 0}</strong><span>reclamações</span></button>
          <button type="button" className="warning" onClick={() => selectTab("sem_resposta")}><strong>{stats?.unanswered ?? 0}</strong><span>sem resposta</span></button>
          <button type="button" className="info" onClick={() => selectTab("oportunidade")}><strong>{stats?.opportunities ?? 0}</strong><span>oportunidades</span></button>
          <button type="button" className="positive" onClick={() => selectTab("elogio")}><strong>{stats?.praises ?? 0}</strong><span>elogios</span></button>
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
                IA leu <strong>{capture.analyzedToday}</strong> de <strong>{capture.conversationsWithCustomer}</strong> conversas com cliente ({coveragePercent}%)
                {capture.pendingToday > 0 && <> · <strong>{capture.pendingToday}</strong> aguardando a leitura das {status?.dailyRunHour ?? 16}h ou o botão</>}
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
        <section className="wtl-assistant">
          <span className="wtl-assistant-avatar"><Bot size={19} /></span>
          <div className="wtl-assistant-bubble">
            <div className="wtl-assistant-head">
              <strong>Assistente XP · Briefing do dia</strong>
              <small>{briefing ? formatDateTime(briefing.generatedAt) : ""}</small>
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
                  : "Estou desligado no servidor — sem chave de IA configurada, não consigo ler as conversas."}
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
          </div>

          <div className="wtl-feed-list">
            {insightsQuery.isLoading ? (
              <div className="wtl-feed-empty"><Loader2 size={18} className="spin" /> Carregando...</div>
            ) : insights.length === 0 ? (
              <div className="wtl-feed-empty">
                {feedTab === "radar"
                  ? <><ShieldCheck size={18} /> Nada no radar. Tudo sob controle.</>
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
                    className={`wtl-feed-item ${isSelected ? "selected" : ""} sev-${insight.attentionLevel}`}
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
                        {insight.acknowledgedAt && <em className="wtl-seen"><CheckCheck size={12} /></em>}
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
                {!selected.acknowledgedAt && (selected.attentionLevel === "high" || selected.attentionLevel === "critical") && (
                  <button
                    type="button"
                    className="wtl-btn-plain"
                    disabled={ackMutation.isPending}
                    title="Tira do radar (volta se a conversa piorar)"
                    onClick={() => ackMutation.mutate({ id: selected.id })}
                  >
                    <CheckCheck size={15} /> Marcar como visto
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
            <p>Um tema por conversa · barra vermelha = clima negativo</p>
          </div>
        </header>
        {topics.length === 0 ? (
          <p className="wtl-topics-empty">Os temas aparecem depois das primeiras leituras.</p>
        ) : (
          <div className="wtl-topic-rows">
            {topics.slice(0, 10).map((topic) => {
              const width = maxTopicCount > 0 ? Math.max(8, Math.round((topic.count / maxTopicCount) * 100)) : 0;
              const negWidth = topic.count > 0 ? Math.round((topic.negativeCount / topic.count) * width) : 0;
              return (
                <button
                  key={topic.topic}
                  type="button"
                  onClick={() => {
                    setFeedTab("all");
                    setFeedSearch(topic.topic);
                    setFeedPage(1);
                  }}
                >
                  <span className="wtl-topic-name">{topic.topic}</span>
                  <span className="wtl-topic-bar">
                    <span className="fill" style={{ width: `${width}%` }} />
                    {negWidth > 0 && <span className="neg" style={{ width: `${negWidth}%` }} />}
                  </span>
                  <span className="wtl-topic-count">{topic.count}</span>
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

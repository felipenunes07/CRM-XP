import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  WhatsappAgentActivityCell,
  WhatsappAgentActivityConversation,
  WhatsappAgentActivityDailyPoint,
  WhatsappAgentActivityReport,
} from "@olist-crm/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, BarChart3, Clock3, Download, MessageCircle, RefreshCw, Smartphone, TrendingDown, TrendingUp, Users, UserCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type ActivityWindowDays = 1 | 7 | 14 | 30;
type ActivityTab = "overview" | "conversations" | "agents";

const windowOptions: ActivityWindowDays[] = [1, 7, 14, 30];
const tabs: Array<{ id: ActivityTab; label: string }> = [
  { id: "overview", label: "Visao geral" },
  { id: "conversations", label: "Conversas" },
  { id: "agents", label: "Agentes" },
];

const EMPTY_SUMMARY = {
  attendedConversations: 0,
  attendedGroups: 0,
  attendedPrivates: 0,
  customerGroups: 0,
  internalGroups: 0,
  otherGroups: 0,
  sentMessages: 0,
  sentMessagesPrivate: 0,
  sentMessagesGroup: 0,
  receivedMessages: 0,
  receivedMessagesPrivate: 0,
  receivedMessagesGroup: 0,
  receivedUniqueMessages: 0,
  receivedUniqueMessagesPrivate: 0,
  receivedUniqueMessagesGroup: 0,
  responseCount: 0,
  averageFirstResponseSeconds: null as number | null,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatSeconds(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  if (value < 60) {
    return `${Math.round(value)} Sec`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  if (minutes < 60) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function calculateGrowth(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

function GrowthIndicator({ current, previous, inverse = false }: { current: number; previous: number | null | undefined; inverse?: boolean }) {
  const growth = calculateGrowth(current, previous);
  if (growth === 0) return null;

  const isPositive = growth > 0;
  const isGood = inverse ? !isPositive : isPositive;
  const Icon = isPositive ? ArrowUp : ArrowDown;

  return (
    <div className={`activity-growth-badge ${isGood ? "positive" : "negative"}`}>
      <Icon size={12} />
      <span>{Math.abs(Math.round(growth))}%</span>
    </div>
  );
}

function formatPhone(value: string | null) {
  if (!value) {
    return "Sem telefone";
  }

  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    const area = digits.slice(2, 4);
    const number = digits.slice(4);
    const prefix = number.length > 8 ? number.slice(0, 5) : number.slice(0, 4);
    const suffix = number.length > 8 ? number.slice(5) : number.slice(4);
    return `+55 (${area}) ${prefix}-${suffix}`;
  }

  return digits || value;
}

function shortWeekday(value: string) {
  return value.replace("-feira", "").slice(0, 3);
}

function mergeConversations(conversations: WhatsappAgentActivityConversation[]) {
  const merged = new Map<string, WhatsappAgentActivityConversation>();

  for (const conversation of conversations) {
    const current =
      merged.get(conversation.remoteJid) ??
      ({
        ...conversation,
        sentMessages: 0,
        receivedMessages: 0,
      } as WhatsappAgentActivityConversation);

    current.name = current.name || conversation.name;
    current.kind = current.kind === "internal_group" ? current.kind : conversation.kind;
    current.sentMessages = (current.sentMessages || 0) + (conversation.sentMessages || 0);
    current.receivedMessages = (current.receivedMessages || 0) + (conversation.receivedMessages || 0);
    merged.set(conversation.remoteJid, current);
  }

  return Array.from(merged.values())
    .sort((left, right) => right.sentMessages - left.sentMessages || left.name.localeCompare(right.name))
    .slice(0, 100);
}

function summarizeCells(cells: WhatsappAgentActivityCell[]) {
  const conversations = mergeConversations(cells.flatMap((cell) => cell.conversations || []));
  const responseSecondsTotal = cells.reduce(
    (sum, cell) => sum + (cell.averageFirstResponseSeconds ?? 0) * (cell.responseCount || 0),
    0,
  );
  const responseCount = cells.reduce((sum, cell) => sum + (cell.responseCount || 0), 0);
  const sentMessages = cells.reduce((sum, cell) => sum + (cell.sentMessages || 0), 0);
  const receivedMessages = cells.reduce((sum, cell) => sum + (cell.receivedMessages || 0), 0);
  const receivedUniqueMessages = conversations.filter((c) => (c.receivedMessages || 0) > 0 && c.kind !== "internal_group").length;
  const receivedUniqueMessagesPrivate = conversations.filter((c) => c.kind === "private" && (c.receivedMessages || 0) > 0).length;
  const receivedUniqueMessagesGroup = conversations.filter((c) => (c.kind === "customer_group" || c.kind === "other_group") && (c.receivedMessages || 0) > 0).length;
  const sentUniqueMessages = conversations.filter((c) => (c.sentMessages || 0) > 0 && c.kind !== "internal_group").length;
  const sentUniqueMessagesPrivate = conversations.filter((c) => c.kind === "private" && (c.sentMessages || 0) > 0).length;
  const sentUniqueMessagesGroup = conversations.filter((c) => (c.kind === "customer_group" || c.kind === "other_group") && (c.sentMessages || 0) > 0).length;
  const attended = conversations.filter((conversation) => (conversation.sentMessages || 0) > 0 && (conversation.receivedMessages || 0) > 0);
  const attendedGroups = attended.filter(
    (conversation) => conversation.kind === "customer_group" || conversation.kind === "other_group",
  );
  const customerGroups = attended.filter((conversation) => conversation.kind === "customer_group");
  const internalGroups = attended.filter((conversation) => conversation.kind === "internal_group");
  const otherGroups = attended.filter((conversation) => conversation.kind === "other_group");
  const privates = attended.filter((conversation) => conversation.kind === "private");

  return {
    attendedConversations: attendedGroups.length + privates.length,
    attendedGroups: attendedGroups.length,
    attendedPrivates: privates.length,
    customerGroups: customerGroups.length,
    internalGroups: internalGroups.length,
    otherGroups: otherGroups.length,
    sentMessages,
    sentMessagesPrivate: cells.reduce((sum, cell) => sum + (cell.sentMessagesPrivate || 0), 0),
    sentMessagesGroup: cells.reduce((sum, cell) => sum + (cell.sentMessagesGroup || 0), 0),
    receivedMessages,
    receivedMessagesPrivate: cells.reduce((sum, cell) => sum + (cell.receivedMessagesPrivate || 0), 0),
    receivedMessagesGroup: cells.reduce((sum, cell) => sum + (cell.receivedMessagesGroup || 0), 0),
    receivedUniqueMessages,
    receivedUniqueMessagesPrivate,
    receivedUniqueMessagesGroup,
    sentUniqueMessages,
    sentUniqueMessagesPrivate,
    sentUniqueMessagesGroup,
    responseCount,
    averageFirstResponseSeconds: responseCount ? responseSecondsTotal / responseCount : null,
    conversations,
  };
}

function buildDailySeries(report: WhatsappAgentActivityReport, cells: WhatsappAgentActivityCell[]) {
  return report.days.map((day): WhatsappAgentActivityDailyPoint => {
    const summary = summarizeCells(cells.filter((cell) => cell.date === day.date));
    return {
      date: day.date,
      label: day.label,
      attendedConversations: summary.attendedConversations,
      attendedGroups: summary.attendedGroups,
      attendedPrivates: summary.attendedPrivates,
      sentMessages: summary.sentMessages,
      sentMessagesPrivate: summary.sentMessagesPrivate,
      sentMessagesGroup: summary.sentMessagesGroup,
      receivedMessages: summary.receivedMessages,
      receivedMessagesPrivate: summary.receivedMessagesPrivate,
      receivedMessagesGroup: summary.receivedMessagesGroup,
      receivedUniqueMessages: summary.receivedUniqueMessages,
      receivedUniqueMessagesPrivate: summary.receivedUniqueMessagesPrivate,
      receivedUniqueMessagesGroup: summary.receivedUniqueMessagesGroup,
      sentUniqueMessages: summary.sentUniqueMessages,
      sentUniqueMessagesPrivate: summary.sentUniqueMessagesPrivate,
      sentUniqueMessagesGroup: summary.sentUniqueMessagesGroup,
      averageFirstResponseSeconds: summary.averageFirstResponseSeconds,
    };
  });
}

function heatLevel(value: number, max: number) {
  if (!value) return 0;
  const ratio = value / Math.max(1, max);
  if (ratio >= 0.8) return 5;
  if (ratio >= 0.6) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

function conversationKindLabel(kind: WhatsappAgentActivityConversation["kind"]) {
  if (kind === "private") return "Privado";
  if (kind === "customer_group") return "Grupo cliente";
  if (kind === "internal_group") return "Grupo interno";
  return "Grupo nao classificado";
}

function chartTicks(value: number | string) {
  return typeof value === "number" ? formatNumber(value) : value;
}

function responseTick(value: number | string) {
  return typeof value === "number" ? formatSeconds(value) : value;
}

function downloadReportCsv(report: WhatsappAgentActivityReport, agentLabel: string, data: WhatsappAgentActivityDailyPoint[]) {
  const header = [
    "Periodo",
    "Filtro",
    "Data",
    "Conversas atendidas",
    "Grupos atendidos",
    "Privados atendidos",
    "Mensagens enviadas",
    "Mensagens recebidas",
    "Tempo medio primeira resposta",
  ];
  const rows = data.map((item) => [
    `${report.period.startDate} ate ${report.period.endDate}`,
    agentLabel,
    item.date,
    String(item.attendedConversations),
    String(item.attendedGroups),
    String(item.attendedPrivates),
    String(item.sentMessages),
    String(item.receivedMessages),
    formatSeconds(item.averageFirstResponseSeconds),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `relatorio-whatsapp-${report.period.startDate}-${report.period.endDate}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ActivityChart({
  title,
  value,
  dataKey,
  data,
  response,
  growth,
}: {
  title: string;
  value: string;
  dataKey: keyof WhatsappAgentActivityDailyPoint;
  data: WhatsappAgentActivityDailyPoint[];
  response?: boolean;
  growth?: number | null;
}) {
  return (
    <div className="activity-chart-tile">
      <div className="activity-chart-header">
        <div>
          <span>{title}</span>
          <strong>{value}</strong>
        </div>
        {growth !== undefined && growth !== null && (
          <div className={`activity-growth-pill ${growth >= 0 ? "positive" : "negative"}`}>
            {growth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(Math.round(growth))}%
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} margin={{ top: 18, right: 18, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#edf0f5" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#d8dde7" }} tick={{ fontSize: 12 }} />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: "#d8dde7" }}
            tickFormatter={response ? responseTick : chartTicks}
            tick={{ fontSize: 12 }}
            width={response ? 48 : 32}
          />
          <Tooltip
            formatter={(tooltipValue) =>
              response ? formatSeconds(Number(tooltipValue ?? 0)) : formatNumber(Number(tooltipValue ?? 0))
            }
            labelFormatter={(label) => String(label)}
            cursor={{ fill: "#f1f4f9" }}
          />
          <Bar
            dataKey={dataKey}
            fill="#287ee7"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WhatsappActivityPage() {
  const { token } = useAuth();
  const [days, setDays] = useState<ActivityWindowDays>(7);
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [activeTab, setActiveTab] = useState<ActivityTab>("overview");
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [showHeatmapNumbers, setShowHeatmapNumbers] = useState(true);
  const [heatmapMetric, setHeatmapMetric] = useState<
    "total" | "sent" | "received" | "received_unique" | "sent_unique" | "conversations"
  >("total");
  const [isUniqueMetric, setIsUniqueMetric] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "private" | "group">("all");

  const reportQuery = useQuery({
    queryKey: ["whatsapp-agent-activity-report", days],
    queryFn: () => api.whatsappAgentActivityReport(token!, { days }),
    enabled: Boolean(token),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const report = reportQuery.data;
  const selectedAgent = report?.agents.find((agent) => agent.agentId === selectedAgentId) ?? null;
  const visibleCells = useMemo(() => {
    if (!report) return [];
    if (selectedAgentId === "all") return report.hourlyCells;
    return report.hourlyCells.filter((cell) => cell.agentId === selectedAgentId);
  }, [report, selectedAgentId]);
  const visibleSummary = useMemo(() => {
    if (!report) return { ...EMPTY_SUMMARY, conversations: [] };
    const summary = selectedAgentId === "all"
      ? { ...report.summary, conversations: summarizeCells(report.hourlyCells).conversations }
      : summarizeCells(visibleCells);

    if (typeFilter === "all") return summary;

    return {
      ...summary,
      attendedConversations: typeFilter === "private" ? summary.attendedPrivates : summary.attendedGroups,
      attendedGroups: typeFilter === "private" ? 0 : summary.attendedGroups,
      attendedPrivates: typeFilter === "group" ? 0 : summary.attendedPrivates,
      customerGroups: typeFilter === "private" ? 0 : summary.customerGroups,
      internalGroups: typeFilter === "private" ? 0 : summary.internalGroups,
      otherGroups: typeFilter === "private" ? 0 : summary.otherGroups,
      sentMessages: typeFilter === "private" ? summary.sentMessagesPrivate : summary.sentMessagesGroup,
      receivedMessages: typeFilter === "private" ? summary.receivedMessagesPrivate : summary.receivedMessagesGroup,
      receivedUniqueMessages: typeFilter === "private" ? summary.receivedUniqueMessagesPrivate : summary.receivedUniqueMessagesGroup,
    };
  }, [report, selectedAgentId, visibleCells, typeFilter]);
  const dailySeries = useMemo(() => {
    if (!report) return [];
    const series = selectedAgentId === "all" ? report.dailySeries : buildDailySeries(report, visibleCells);

    if (typeFilter === "all") return series;

    return series.map((item) => ({
      ...item,
      attendedConversations: typeFilter === "private" ? item.attendedPrivates : item.attendedGroups,
      attendedGroups: typeFilter === "private" ? 0 : item.attendedGroups,
      attendedPrivates: typeFilter === "group" ? 0 : item.attendedPrivates,
      sentMessages: typeFilter === "private" ? item.sentMessagesPrivate : item.sentMessagesGroup,
      receivedMessages: typeFilter === "private" ? item.receivedMessagesPrivate : item.receivedMessagesGroup,
      receivedUniqueMessages: typeFilter === "private" ? item.receivedUniqueMessagesPrivate : item.receivedUniqueMessagesGroup,
    }));
  }, [report, selectedAgentId, visibleCells, typeFilter]);
  const cellsBySlot = useMemo(() => {
    const map = new Map<string, WhatsappAgentActivityCell[]>();
    for (const cell of visibleCells) {
      const key = `${cell.date}:${cell.hour}`;
      map.set(key, [...(map.get(key) ?? []), cell]);
    }
    return map;
  }, [visibleCells]);
  const cellMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeCells>>();
    if (!report) return map;

    for (const day of report.days) {
      for (const hour of report.hours) {
        const key = `${day.date}:${hour}`;
        map.set(key, summarizeCells(cellsBySlot.get(key) ?? []));
      }
    }

    return map;
  }, [report, cellsBySlot]);
  const maxCellValue = useMemo(
    () => Math.max(1, ...Array.from(cellMap.values()).map((cell) => {
      if (typeFilter === "private") {
        if (heatmapMetric === "sent") return isUniqueMetric ? (cell.sentUniqueMessagesPrivate ?? 0) : cell.sentMessagesPrivate;
        if (heatmapMetric === "received") return isUniqueMetric ? (cell.receivedUniqueMessagesPrivate ?? 0) : cell.receivedMessagesPrivate;
        if (heatmapMetric === "conversations") return cell.attendedPrivates;
        return (cell.sentMessagesPrivate || 0) + (cell.receivedMessagesPrivate || 0);
      }
      if (typeFilter === "group") {
        if (heatmapMetric === "sent") return isUniqueMetric ? (cell.sentUniqueMessagesGroup ?? 0) : cell.sentMessagesGroup;
        if (heatmapMetric === "received") return isUniqueMetric ? (cell.receivedUniqueMessagesGroup ?? 0) : cell.receivedMessagesGroup;
        if (heatmapMetric === "conversations") return cell.attendedGroups;
        return (cell.sentMessagesGroup || 0) + (cell.receivedMessagesGroup || 0);
      }
      if (heatmapMetric === "sent") return isUniqueMetric ? (cell.sentUniqueMessages ?? 0) : cell.sentMessages;
      if (heatmapMetric === "received") return isUniqueMetric ? (cell.receivedUniqueMessages ?? 0) : cell.receivedMessages;
      if (heatmapMetric === "conversations") return cell.attendedConversations;
      return isUniqueMetric 
        ? (cell.sentUniqueMessages ?? 0) + (cell.receivedUniqueMessages ?? 0)
        : (cell.sentMessages || 0) + (cell.receivedMessages || 0);
    })),
    [cellMap, heatmapMetric, typeFilter],
  );
  const selectedCellSummary = selectedCellKey ? cellMap.get(selectedCellKey) ?? null : null;
  const selectedCellRows = selectedCellKey ? cellsBySlot.get(selectedCellKey) ?? [] : null;

  const growthMetrics = useMemo(() => {
    if (!report?.previousSummary) return null;
    const s = report.summary;
    const p = report.previousSummary;
    return {
      attendedConversations: calculateGrowth(s.attendedConversations, p.attendedConversations),
      receivedMessages: calculateGrowth(s.receivedMessages, p.receivedMessages),
      sentMessages: calculateGrowth(s.sentMessages, p.sentMessages),
      receivedUniqueMessages: calculateGrowth(s.receivedUniqueMessages, p.receivedUniqueMessages),
      averageFirstResponseSeconds: calculateGrowth(s.averageFirstResponseSeconds ?? 0, p.averageFirstResponseSeconds ?? 0),
      attendedGroups: calculateGrowth(s.attendedGroups, p.attendedGroups),
      attendedPrivates: calculateGrowth(s.attendedPrivates, p.attendedPrivates),
      activeAgents: calculateGrowth(s.activeAgents, p.activeAgents),
    };
  }, [report]);

  const cards: Array<{
    key: string;
    label: string;
    value: number | null;
    previous: number | undefined;
    detail: string;
    icon: any;
    isTime?: boolean;
    inverse?: boolean;
  }> = [
    {
      key: "conversations",
      label: "Conversas atendidas",
      value: visibleSummary.attendedConversations,
      previous: selectedAgentId === "all" ? report?.previousSummary?.attendedConversations : undefined,
      detail: "Privados e grupos de clientes",
      icon: MessageCircle,
    },
    {
      key: "groups",
      label: "Grupos atendidos",
      value: visibleSummary.attendedGroups,
      previous: selectedAgentId === "all" ? report?.previousSummary?.attendedGroups : undefined,
      detail: `${formatNumber(visibleSummary.otherGroups)} nao classificados`,
      icon: Users,
    },
    {
      key: "private",
      label: "Privados atendidos",
      value: visibleSummary.attendedPrivates || 0,
      previous: selectedAgentId === "all" ? report?.previousSummary?.attendedPrivates : undefined,
      detail: "Conversas individuais",
      icon: Smartphone,
    },
    {
      key: "responses",
      label: "Mensagens enviadas",
      value: visibleSummary.sentMessages || 0,
      previous: selectedAgentId === "all"
        ? (typeFilter === "private" ? report?.previousSummary?.sentMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.sentMessagesGroup : report?.previousSummary?.sentMessages)
        : undefined,
      detail: "Total de respostas enviadas",
      icon: BarChart3,
    },
    {
      key: "received",
      label: "Mensagens recebidas",
      value: visibleSummary.receivedMessages || 0,
      previous: selectedAgentId === "all"
        ? (typeFilter === "private" ? report?.previousSummary?.receivedMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.receivedMessagesGroup : report?.previousSummary?.receivedMessages)
        : undefined,
      detail: "Total de mensagens de entrada",
      icon: Clock3,
    },
    {
      key: "received_unique",
      label: "Contatos recebidos",
      value: visibleSummary.receivedUniqueMessages || 0,
      previous: selectedAgentId === "all"
        ? (typeFilter === "private" ? report?.previousSummary?.receivedUniqueMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.receivedUniqueMessagesGroup : report?.previousSummary?.receivedUniqueMessages)
        : undefined,
      detail: "Clientes/grupos que enviaram",
      icon: Users,
    },
    {
      key: "sent_unique",
      label: "Contatos enviados",
      value: visibleSummary.sentUniqueMessages || 0,
      previous: selectedAgentId === "all"
        ? (typeFilter === "private" ? report?.previousSummary?.sentUniqueMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.sentUniqueMessagesGroup : report?.previousSummary?.sentUniqueMessages)
        : undefined,
      detail: "Clientes/grupos que receberam",
      icon: UserCheck,
    },
  ];

  useEffect(() => {
    if (!report || selectedAgentId === "all") return;
    if (!report.agents.some((agent) => agent.agentId === selectedAgentId)) {
      setSelectedAgentId("all");
    }
  }, [report, selectedAgentId]);

  useEffect(() => {
    setSelectedCellKey(null);
  }, [selectedAgentId, days]);

  if (reportQuery.isLoading) {
    return <div className="page-loading">Carregando relatorios...</div>;
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="whatsapp-activity-page">
        <div className="activity-report-header">
          <div>
            <h1>Relatorios WhatsApp</h1>
            <span>Visao geral, conversas e agentes</span>
          </div>
          <button type="button" className="activity-primary-button" onClick={() => reportQuery.refetch()}>
            <RefreshCw size={16} />
            Tentar novamente
          </button>
        </div>
        <div className="activity-empty">Nao foi possivel carregar o relatorio agora.</div>
      </div>
    );
  }

  return (
    <div className="whatsapp-activity-page">
      <div className="activity-report-header">
        <div>
          <h1>{activeTab === "overview" ? "Visao geral" : activeTab === "conversations" ? "Conversas" : "Visao Geral de Agentes"}</h1>
          <span>
            {activeTab === "agents"
              ? "Acompanhe desempenho por agente e clique em uma vendedora para filtrar."
              : "Acompanhe o atendimento por hora, agente e tipo de conversa."}
          </span>
        </div>
        <div className="activity-actions">
          <button
            type="button"
            className="activity-primary-button"
            onClick={() => downloadReportCsv(report, selectedAgent?.agentName ?? "Todos os agentes", dailySeries)}
          >
            <Download size={16} />
            Baixar relatorios de agentes
          </button>
          <label className="activity-select">
            <select value={days} onChange={(event) => setDays(Number(event.target.value) as ActivityWindowDays)}>
              {windowOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 1 ? "Hoje" : `Ultimos ${option} dias`}
                </option>
              ))}
            </select>
          </label>
          <label className="activity-select">
            <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
              <option value="all">Todos os agentes</option>
              {report.agents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.agentName}
                </option>
              ))}
            </select>
          </label>
          <div className="activity-heatmap-toggles">
            <button
              type="button"
              className={typeFilter === "all" ? "active" : ""}
              onClick={() => setTypeFilter("all")}
            >
              Todas
            </button>
            <button
              type="button"
              className={typeFilter === "private" ? "active" : ""}
              onClick={() => setTypeFilter("private")}
            >
              Privado
            </button>
            <button
              type="button"
              className={typeFilter === "group" ? "active" : ""}
              onClick={() => setTypeFilter("group")}
            >
              Grupos
            </button>
          </div>
          <button type="button" className="activity-icon-button" onClick={() => reportQuery.refetch()} title="Atualizar">
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      <div className="activity-tabs" role="tablist" aria-label="Relatorios WhatsApp">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <>
          <section className="activity-metric-grid">
            {cards.map(({ key, label, value, previous, detail, icon: Icon, isTime, inverse }) => (
              <div key={key} className="activity-metric-card">
                <div className="activity-metric-icon">
                  <Icon size={18} />
                </div>
                <span>{label}</span>
                <div className="activity-metric-value">
                  <strong>{isTime ? formatSeconds(value as number) : formatNumber(value as number)}</strong>
                  <GrowthIndicator
                    current={typeof value === "number" ? value : 0}
                    previous={previous}
                    inverse={inverse}
                  />
                </div>
                <small>{detail}</small>
              </div>
            ))}
          </section>

          <section className="activity-panel heatmap-panel">
            <div className="activity-panel-header">
              <div>
                <h2>Trafego de conversa</h2>
                <span>{selectedAgent ? selectedAgent.agentName : "Todos os agentes"} - grupos unicos e privados atendidos</span>
              </div>
              <div className="activity-heatmap-controls">
                <div className="activity-heatmap-toggles">
                  <button
                    type="button"
                    className={!showHeatmapNumbers ? "active" : ""}
                    onClick={() => setShowHeatmapNumbers(false)}
                  >
                    Cor
                  </button>
                  <button
                    type="button"
                    className={showHeatmapNumbers ? "active" : ""}
                    onClick={() => setShowHeatmapNumbers(true)}
                  >
                    Numero
                  </button>
                </div>
                <div className="activity-heatmap-toggles">
                  <button
                    type="button"
                    className={heatmapMetric === "sent" ? "active" : ""}
                    onClick={() => setHeatmapMetric("sent")}
                  >
                    Enviada
                  </button>
                  <button
                    type="button"
                    className={heatmapMetric === "received" ? "active" : ""}
                    onClick={() => setHeatmapMetric("received")}
                  >
                    Recebida
                  </button>
                </div>
                <div className="activity-heatmap-toggles">
                  <button
                    type="button"
                    className={isUniqueMetric ? "active" : ""}
                    onClick={() => setIsUniqueMetric(!isUniqueMetric)}
                  >
                    {isUniqueMetric ? "Único: ON" : "Único: OFF"}
                  </button>
                </div>
                <div className="activity-heatmap-toggles">
                  <button
                    type="button"
                    className={heatmapMetric === "total" ? "active" : ""}
                    onClick={() => setHeatmapMetric("total")}
                  >
                    Total
                  </button>
                  <button
                    type="button"
                    className={heatmapMetric === "conversations" ? "active" : ""}
                    onClick={() => setHeatmapMetric("conversations")}
                  >
                    Conversas
                  </button>
                </div>
                <div className="activity-live-chip">Em tempo real</div>
              </div>
            </div>

            <div className="activity-heatmap-wrap">
              <div className="activity-heatmap">
                <div className="activity-heatmap-corner" />
                {report.hours.map((hour) => (
                  <div key={hour} className="activity-hour-label">
                    {hour}
                  </div>
                ))}
                {report.days.map((day) => (
                  <div className="activity-day-row" key={day.date}>
                    <div className="activity-day-label">
                      <strong>{shortWeekday(day.weekday)}</strong>
                      <span>{day.label}</span>
                    </div>
                    {report.hours.map((hour) => {
                      const key = `${day.date}:${hour}`;
                      const cell = cellMap.get(key) ?? { ...EMPTY_SUMMARY, conversations: [] };
                      const value = (() => {
                        if (typeFilter === "private") {
                          if (heatmapMetric === "sent") return isUniqueMetric ? (cell.sentUniqueMessagesPrivate ?? 0) : cell.sentMessagesPrivate;
                          if (heatmapMetric === "received") return isUniqueMetric ? (cell.receivedUniqueMessagesPrivate ?? 0) : cell.receivedMessagesPrivate;
                          if (heatmapMetric === "conversations") return cell.attendedPrivates;
                          return (cell.sentMessagesPrivate || 0) + (cell.receivedMessagesPrivate || 0);
                        }
                        if (typeFilter === "group") {
                          if (heatmapMetric === "sent") return isUniqueMetric ? (cell.sentUniqueMessagesGroup ?? 0) : cell.sentMessagesGroup;
                          if (heatmapMetric === "received") return isUniqueMetric ? (cell.receivedUniqueMessagesGroup ?? 0) : cell.receivedMessagesGroup;
                          if (heatmapMetric === "conversations") return cell.attendedGroups;
                          return (cell.sentMessagesGroup || 0) + (cell.receivedMessagesGroup || 0);
                        }
                        if (heatmapMetric === "sent") return isUniqueMetric ? (cell.sentUniqueMessages ?? 0) : cell.sentMessages;
                        if (heatmapMetric === "received") return isUniqueMetric ? (cell.receivedUniqueMessages ?? 0) : cell.receivedMessages;
                        if (heatmapMetric === "conversations") return cell.attendedConversations;
                        return isUniqueMetric
                          ? (cell.sentUniqueMessages ?? 0) + (cell.receivedUniqueMessages ?? 0)
                          : (cell.sentMessages || 0) + (cell.receivedMessages || 0);
                      })();
                      const level = heatLevel(value, maxCellValue);
                      const sentCount = isUniqueMetric ? (cell.sentUniqueMessages ?? 0) : cell.sentMessages;
                      const receivedCount = isUniqueMetric ? (cell.receivedUniqueMessages ?? 0) : cell.receivedMessages;
                      const countLabel = isUniqueMetric ? "unicos" : "";
                      const title = `${day.label} ${String(hour).padStart(2, "0")}h - ${cell.attendedConversations} conversas, ${sentCount} enviados ${countLabel}, ${receivedCount} recebidos ${countLabel}`;
                      return (
                        <button
                          type="button"
                          key={key}
                          className={`activity-heat-cell level-${level} ${selectedCellKey === key ? "selected" : ""}`}
                          title={title}
                          onClick={() => setSelectedCellKey(key)}
                        >
                          {value && showHeatmapNumbers ? value : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="activity-detail-grid">
            <div className="activity-panel">
              <div className="activity-panel-header">
                <div>
                  <h2>Detalhe do horario</h2>
                  <span>{selectedCellKey ? selectedCellKey.replace(":", " - ") : "Clique em um quadrado do mapa"}</span>
                </div>
              </div>
              {selectedCellSummary ? (
                <div className="activity-cell-detail">
                  <div className="activity-cell-stats">
                    <span>
                      <strong>{formatNumber(selectedCellSummary.attendedGroups)}</strong>
                      grupos
                    </span>
                    <span>
                      <strong>{formatNumber(selectedCellSummary.attendedPrivates)}</strong>
                      privados
                    </span>
                    <span>
                      <strong>{formatNumber(selectedCellSummary.sentMessages)}</strong>
                      respostas
                    </span>
                    <span>
                      <strong>{formatNumber(selectedCellSummary.receivedMessages)}</strong>
                      recebidas
                    </span>
                    <span>
                      <strong>{formatNumber(selectedCellSummary.receivedUniqueMessages)}</strong>
                      únicas
                    </span>
                  </div>
                  <div className="activity-detail-columns">
                    <div>
                      <h3>Agentes com trafego</h3>
                      {(selectedCellRows ?? []).filter((cell) => cell.sentMessages > 0 || cell.receivedMessages > 0).length ? (
                        (selectedCellRows ?? [])
                          .filter((cell) => cell.sentMessages > 0 || cell.receivedMessages > 0)
                          .sort((left, right) => (right.sentMessages + right.receivedMessages) - (left.sentMessages + left.receivedMessages))
                          .map((cell) => {
                            const val = heatmapMetric === "sent" ? cell.sentMessages : 
                                        heatmapMetric === "received" ? cell.receivedMessages : 
                                        heatmapMetric === "received_unique" ? cell.receivedUniqueMessages :
                                        cell.sentMessages + cell.receivedMessages;
                            return (
                              <button
                                type="button"
                                key={`${cell.agentId}-${cell.date}-${cell.hour}`}
                                className="activity-detail-row"
                                onClick={() => setSelectedAgentId(cell.agentId)}
                              >
                                <span>{cell.agentName}</span>
                                <strong>{formatNumber(val)}</strong>
                              </button>
                            );
                          })
                      ) : (
                        <p>Nenhuma atividade nesse horario.</p>
                      )}
                    </div>
                    <div>
                      <h3>Conversas</h3>
                      {(() => {
                        const filtered = selectedCellSummary.conversations.filter((c) => {
                          if (typeFilter === "private") return c.kind === "private";
                          if (typeFilter === "group") return c.kind !== "private";
                          return true;
                        }).filter((c) => c.sentMessages > 0 || c.receivedMessages > 0);

                        if (!filtered.length) {
                          return <p>Nenhuma conversa atendida nesse horario.</p>;
                        }

                        return filtered.slice(0, 8).map((conversation) => {
                          const val = heatmapMetric === "sent" ? conversation.sentMessages : 
                                      heatmapMetric === "received" ? conversation.receivedMessages : 
                                      heatmapMetric === "received_unique" ? (conversation.receivedMessages > 0 ? 1 : 0) :
                                      conversation.sentMessages + conversation.receivedMessages;
                          return (
                            <div key={conversation.remoteJid} className="activity-detail-row static">
                              <span>
                                {conversation.name}
                                <small>{conversationKindLabel(conversation.kind)}</small>
                              </span>
                              <strong>{formatNumber(val)}</strong>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="activity-empty">Selecione uma celula para ver agentes, grupos e privados atendidos.</div>
              )}
            </div>

            <div className="activity-panel">
              <div className="activity-panel-header">
                <div>
                  <h2>Conversas por agentes</h2>
                  <span>Clique para filtrar o mapa</span>
                </div>
              </div>
              <div className="activity-agent-list">
                {report.agents.slice(0, 6).map((agent) => (
                  <button
                    key={agent.agentId}
                    type="button"
                    className={`activity-agent-list-row ${selectedAgentId === agent.agentId ? "selected" : ""}`}
                    onClick={() => setSelectedAgentId(agent.agentId)}
                  >
                    <span className="activity-avatar">{initials(agent.agentName) || "WA"}</span>
                    <span>
                      <strong>{agent.agentName}</strong>
                      <small>{formatPhone(agent.phoneNumber)}</small>
                    </span>
                    <em>{formatNumber(agent.attendedConversations)}</em>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "conversations" ? (
        <section className="activity-panel activity-chart-panel">
          <ActivityChart
            title="Conversas"
            value={formatNumber(visibleSummary.attendedConversations)}
            dataKey="attendedConversations"
            data={dailySeries}
            growth={selectedAgentId === "all" ? growthMetrics?.attendedConversations : null}
          />
          <ActivityChart
            title="Mensagens Recebidas"
            value={formatNumber(visibleSummary.receivedMessages)}
            dataKey="receivedMessages"
            data={dailySeries}
            growth={selectedAgentId === "all" ? growthMetrics?.receivedMessages : null}
          />
          <ActivityChart
            title="Mensagens enviadas"
            value={formatNumber(visibleSummary.sentMessages)}
            dataKey="sentMessages"
            data={dailySeries}
            growth={selectedAgentId === "all" ? growthMetrics?.sentMessages : null}
          />
          <ActivityChart
            title="Contatos Recebidos"
            value={formatNumber(visibleSummary.receivedUniqueMessages)}
            dataKey="receivedUniqueMessages"
            data={dailySeries}
            growth={selectedAgentId === "all" ? growthMetrics?.receivedUniqueMessages : null}
          />
          <ActivityChart
            title="Tempo de Primeira Resposta"
            value={formatSeconds(visibleSummary.averageFirstResponseSeconds)}
            dataKey="averageFirstResponseSeconds"
            data={dailySeries}
            response
            growth={selectedAgentId === "all" ? growthMetrics?.averageFirstResponseSeconds : null}
          />
        </section>
      ) : null}

      {activeTab === "agents" ? (
        <section className="activity-panel">
          <div className="activity-table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th>N de Conversas</th>
                  <th>Grupos atendidos</th>
                  <th>Privados</th>
                  <th>Mensagens enviadas</th>
                  <th>Mensagens recebidas</th>
                  <th>Recebidas (Únicas)</th>
                  <th>Tempo medio de primeira resposta</th>
                </tr>
              </thead>
              <tbody>
                {report.agents.length ? (
                  report.agents.map((agent) => (
                    <tr key={agent.agentId}>
                      <td>
                        <button
                          type="button"
                          className="activity-agent-button"
                          onClick={() => {
                            setSelectedAgentId(agent.agentId);
                            setActiveTab("overview");
                          }}
                        >
                          <span className="activity-avatar">{initials(agent.agentName) || "WA"}</span>
                          <span>
                            <strong>{agent.agentName}</strong>
                            <small>{formatPhone(agent.phoneNumber)}</small>
                          </span>
                        </button>
                      </td>
                      <td>{formatNumber(agent.attendedConversations)}</td>
                      <td>{formatNumber(agent.attendedGroups)}</td>
                      <td>{formatNumber(agent.attendedPrivates)}</td>
                      <td>{formatNumber(agent.sentMessages)}</td>
                      <td>{formatNumber(agent.receivedMessages)}</td>
                      <td>{formatNumber(agent.receivedUniqueMessages)}</td>
                      <td>{formatSeconds(agent.averageFirstResponseSeconds)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>Nao ha dados disponiveis</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

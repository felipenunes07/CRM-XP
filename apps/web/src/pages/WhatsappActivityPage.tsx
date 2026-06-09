import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  WhatsappAgentActivityCell,
  WhatsappAgentActivityConversation,
  WhatsappAgentActivityDailyPoint,
  WhatsappAgentActivityReport,
  WhatsappAgentActivitySummary,
} from "@olist-crm/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, BarChart3, Clock3, Download, MessageCircle, RefreshCw, Search, Smartphone, TrendingDown, TrendingUp, Users, UserCheck, Calendar, Copy, Check, ChevronDown, ChevronUp, Award, ShoppingBag, DollarSign, Package } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { ReportLoadingScreen } from "../components/ReportLoadingScreen";

type ActivityWindowDays = 1 | 7 | 14 | 30;
type ActivityTab = "overview" | "conversations" | "agents" | "daily-summary" | "whatsapp-dispatch-report";

const windowOptions: ActivityWindowDays[] = [1, 7, 14, 30];
const tabs: Array<{ id: ActivityTab; label: string }> = [
  { id: "overview", label: "Visao geral" },
  { id: "conversations", label: "Conversas" },
  { id: "agents", label: "Agentes" },
  { id: "daily-summary", label: "Resumo do Dia" },
  { id: "whatsapp-dispatch-report", label: "Disparos / CLs" },
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
  sentUniqueMessages: 0,
  sentUniqueMessagesPrivate: 0,
  sentUniqueMessagesGroup: 0,
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

function formatDailySummaryCustomerLines(customers: any[], options: { recovered?: boolean } = {}) {
  return customers
    .map((customer) => {
      const code = customer.customer_code ? `${customer.customer_code} - ` : "";
      const name = customer.display_name || "Cliente sem nome";
      const attendant = customer.last_attendant || "Sem atendente";
      const amount = Number(customer.total_amount ?? 0);
      const amountText = Number.isFinite(amount)
        ? ` | R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "";
      const inactiveText = options.recovered && customer.days_inactive
        ? ` | ${Number(customer.days_inactive).toLocaleString("pt-BR")} dias sem comprar`
        : "";

      return `- ${code}${name} | ${attendant}${amountText}${inactiveText}`;
    })
    .join("\n");
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

function cellHasActivity(cell: WhatsappAgentActivityCell) {
  return (cell.sentMessages || 0) > 0 || (cell.receivedMessages || 0) > 0;
}

function reportHasActivityForDate(report: WhatsappAgentActivityReport, date: string) {
  return report.hourlyCells.some((cell) => cell.date === date && cellHasActivity(cell));
}

function latestIsoDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

function mergeCurrentDayActivityReport(
  report: WhatsappAgentActivityReport,
  currentDayReport: WhatsappAgentActivityReport,
) {
  const currentDate = report.period.endDate;
  if (currentDayReport.period.endDate !== currentDate || !reportHasActivityForDate(currentDayReport, currentDate)) {
    return report;
  }

  const currentDayCells = currentDayReport.hourlyCells.filter((cell) => cell.date === currentDate);
  const mergedCells = [
    ...report.hourlyCells.filter((cell) => cell.date !== currentDate),
    ...currentDayCells,
  ].sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.hour - right.hour ||
    left.agentName.localeCompare(right.agentName)
  );

  const { conversations: _summaryConversations, ...summaryFromCells } = summarizeCells(mergedCells);
  const agentMap = new Map<string, WhatsappAgentActivitySummary>();
  for (const agent of report.agents) {
    agentMap.set(agent.agentId, agent);
  }
  for (const agent of currentDayReport.agents) {
    const existing = agentMap.get(agent.agentId);
    agentMap.set(agent.agentId, {
      ...agent,
      ...existing,
      instanceName: existing?.instanceName ?? agent.instanceName,
      displayLabel: existing?.displayLabel ?? agent.displayLabel,
      phoneNumber: existing?.phoneNumber ?? agent.phoneNumber,
      profilePictureUrl: existing?.profilePictureUrl ?? agent.profilePictureUrl,
      lastMessageAt: latestIsoDate(existing?.lastMessageAt, agent.lastMessageAt),
    });
  }

  const agents = Array.from(agentMap.values()).map((agent) => {
    const agentCells = mergedCells.filter((cell) => cell.agentId === agent.agentId);
    const { conversations: _agentConversations, ...agentSummary } = summarizeCells(agentCells);
    const activeHours = new Set(
      agentCells
        .filter(cellHasActivity)
        .map((cell) => `${cell.date}:${cell.hour}`),
    ).size;

    return {
      ...agent,
      ...agentSummary,
      activeHours,
    };
  }).sort((left, right) =>
    (right.sentMessages + right.receivedMessages) - (left.sentMessages + left.receivedMessages) ||
    left.agentName.localeCompare(right.agentName)
  );

  return {
    ...report,
    summary: {
      ...report.summary,
      ...summaryFromCells,
      activeAgents: agents.filter((agent) => (agent.sentMessages || 0) > 0 || (agent.receivedMessages || 0) > 0).length,
    },
    agents,
    dailySeries: buildDailySeries(report, mergedCells),
    hourlyCells: mergedCells,
  };
}

async function loadWhatsappActivityReport(token: string, days: ActivityWindowDays) {
  const report = await api.whatsappAgentActivityReport(token, { days });
  if (days === 1 || reportHasActivityForDate(report, report.period.endDate)) {
    return report;
  }

  try {
    const currentDayReport = await api.whatsappAgentActivityReport(token, { days: 1 });
    return mergeCurrentDayActivityReport(report, currentDayReport);
  } catch {
    return report;
  }
}

function localTodayKeySaoPaulo() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function normalizeDailyAgentKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^xp\s+/i, "")
    .trim();
}

function hasDailySummaryGroups(data: any) {
  return data?.agents?.some((agent: any) =>
    Number(agent.groupChatsCount ?? 0) > 0 ||
    agent.attendedGroupClients?.some((group: any) => Number(group.sent ?? 0) > 0)
  );
}

function localDateKeyFromIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(date);
}

function mergeDailySummaryGroupFallback(data: any, report?: WhatsappAgentActivityReport) {
  if (!data || !report || report.period.endDate !== data.date) {
    return data;
  }

  if (hasDailySummaryGroups(data)) {
    return data;
  }

  const fallbackByAgent = new Map<string, {
    agentId: string;
    agentName: string;
    groups: Map<string, { name: string; jid: string; sent: number; received: number }>;
  }>();

  for (const cell of report.hourlyCells) {
    for (const conversation of cell.conversations || []) {
      if (conversation.kind === "private" || conversation.kind === "internal_group") {
        continue;
      }

      const key = normalizeDailyAgentKey(cell.agentName);
      const agentFallback =
        fallbackByAgent.get(key) ??
        {
          agentId: cell.agentId,
          agentName: cell.agentName.replace(/\s*\([^)]*\)\s*$/, ""),
          groups: new Map<string, { name: string; jid: string; sent: number; received: number }>(),
        };
      const current =
        agentFallback.groups.get(conversation.remoteJid) ??
        {
          name: conversation.name,
          jid: conversation.remoteJid,
          sent: 0,
          received: 0,
        };
      current.name = current.name || conversation.name;
      current.sent += Number(conversation.sentMessages ?? 0);
      current.received += Number(conversation.receivedMessages ?? 0);
      agentFallback.groups.set(conversation.remoteJid, current);
      fallbackByAgent.set(key, agentFallback);
    }
  }

  if (!Array.from(fallbackByAgent.values()).some((agent) => Array.from(agent.groups.values()).some((group) => group.sent > 0))) {
    return data;
  }

  const matchedKeys = new Set<string>();
  const agents = (data.agents ?? []).map((agent: any) => {
    const key = normalizeDailyAgentKey(agent.agentName);
    const fallback = fallbackByAgent.get(key);
    if (!fallback) {
      return agent;
    }

    matchedKeys.add(key);
    const existingGroups = new Map<string, { name: string; jid: string; sent: number; received: number }>();
    for (const group of agent.attendedGroupClients ?? []) {
      existingGroups.set(group.jid, {
        name: group.name,
        jid: group.jid,
        sent: Number(group.sent ?? 0),
        received: Number(group.received ?? 0),
      });
    }
    for (const group of fallback.groups.values()) {
      const current = existingGroups.get(group.jid);
      existingGroups.set(group.jid, current
        ? {
            ...current,
            sent: Math.max(current.sent, group.sent),
            received: Math.max(current.received, group.received),
          }
        : group
      );
    }
    const attendedGroupClients = Array.from(existingGroups.values()).filter((group) => group.sent > 0);

    return {
      ...agent,
      groupChatsCount: attendedGroupClients.length,
      attendedGroupClients,
    };
  });

  for (const [key, fallback] of fallbackByAgent.entries()) {
    if (matchedKeys.has(key)) {
      continue;
    }
    const attendedGroupClients = Array.from(fallback.groups.values()).filter((group) => group.sent > 0);
    if (!attendedGroupClients.length) {
      continue;
    }
    agents.push({
      agentId: fallback.agentId,
      agentName: fallback.agentName,
      sentMessages: 0,
      receivedMessages: 0,
      privateChatsCount: 0,
      groupChatsCount: attendedGroupClients.length,
      initiatedCount: 0,
      screensSold: 0,
      ordersCount: 0,
      revenue: 0,
      attendedPrivateClients: [],
      attendedGroupClients,
      averageFirstResponseSeconds: null,
    });
  }

  return {
    ...data,
    agents,
  };
}

function mergeDailySummaryConversationGroupFallback(data: any, conversationsResponse?: any) {
  if (!data || hasDailySummaryGroups(data)) {
    return data;
  }

  const fallbackByAgent = new Map<string, {
    agentId: string;
    agentName: string;
    groups: Map<string, { name: string; jid: string; sent: number; received: number }>;
  }>();

  for (const conversation of conversationsResponse?.conversations ?? []) {
    const remoteJid = String(conversation.remoteJid ?? "");
    const isGroup = Boolean(conversation.isGroup) || remoteJid.endsWith("@g.us");
    if (!isGroup || localDateKeyFromIso(conversation.lastMessageAt) !== data.date) {
      continue;
    }

    const agentName = String(conversation.agentName || conversation.instanceName || "Sem agente");
    const key = normalizeDailyAgentKey(agentName);
    const agentFallback =
      fallbackByAgent.get(key) ??
      {
        agentId: `conversation-group:${key || agentName}`,
        agentName,
        groups: new Map<string, { name: string; jid: string; sent: number; received: number }>(),
      };
    const name = String(conversation.contactName || conversation.title || conversation.contactPhone || "Grupo sem nome");
    agentFallback.groups.set(remoteJid, {
      name,
      jid: remoteJid,
      sent: 1,
      received: Number(conversation.eventCount ?? 0),
    });
    fallbackByAgent.set(key, agentFallback);
  }

  if (!fallbackByAgent.size) {
    return data;
  }

  const matchedKeys = new Set<string>();
  const agents = (data.agents ?? []).map((agent: any) => {
    const key = normalizeDailyAgentKey(agent.agentName);
    const fallback = fallbackByAgent.get(key);
    if (!fallback) {
      return agent;
    }

    matchedKeys.add(key);
    const attendedGroupClients = Array.from(fallback.groups.values());
    return {
      ...agent,
      groupChatsCount: attendedGroupClients.length,
      attendedGroupClients,
    };
  });

  for (const [key, fallback] of fallbackByAgent.entries()) {
    if (matchedKeys.has(key)) {
      continue;
    }
    const attendedGroupClients = Array.from(fallback.groups.values());
    agents.push({
      agentId: fallback.agentId,
      agentName: fallback.agentName,
      sentMessages: 0,
      receivedMessages: 0,
      privateChatsCount: 0,
      groupChatsCount: attendedGroupClients.length,
      initiatedCount: 0,
      screensSold: 0,
      ordersCount: 0,
      revenue: 0,
      attendedPrivateClients: [],
      attendedGroupClients,
      averageFirstResponseSeconds: null,
    });
  }

  return {
    ...data,
    agents,
  };
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
  const [showInitialLoader, setShowInitialLoader] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [activeTab, setActiveTab] = useState<ActivityTab>("overview");
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [showHeatmapNumbers, setShowHeatmapNumbers] = useState(true);
  const [heatmapMetric, setHeatmapMetric] = useState<
    "total" | "sent" | "received" | "received_unique" | "sent_unique" | "conversations"
  >("total");
  const [isUniqueMetric, setIsUniqueMetric] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "private" | "group">("all");
  const [conversationSearch, setConversationSearch] = useState("");

  const reportQuery = useQuery({
    queryKey: ["whatsapp-agent-activity-report", days],
    queryFn: () => loadWhatsappActivityReport(token!, days),
    enabled: Boolean(token),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
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
      sentUniqueMessages: typeFilter === "private" ? (summary.sentUniqueMessagesPrivate ?? 0) : (summary.sentUniqueMessagesGroup ?? 0),
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
      sentUniqueMessages: typeFilter === "private" ? (item.sentUniqueMessagesPrivate ?? 0) : (item.sentUniqueMessagesGroup ?? 0),
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
    [cellMap, heatmapMetric, isUniqueMetric, typeFilter],
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

  if (reportQuery.isError || (!report && !reportQuery.isLoading)) {
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

  if (showInitialLoader || !report) {
    const isFetching = reportQuery.isLoading;
    return (
      <ReportLoadingScreen
        isLoading={isFetching}
        onFinished={() => setShowInitialLoader(false)}
      />
    );
  }

  return (
    <div className="whatsapp-activity-page">
      <div className="activity-report-header">
        <div>
          <h1>
            {activeTab === "overview"
              ? "Visão Geral"
              : activeTab === "conversations"
              ? "Conversas"
              : activeTab === "agents"
              ? "Visão Geral de Agentes"
              : activeTab === "daily-summary"
              ? "Resumo do Dia"
              : "Disparos / CLs"}
          </h1>
          <span>
            {activeTab === "agents"
              ? "Acompanhe desempenho por agente e clique em uma vendedora para filtrar."
              : activeTab === "daily-summary"
              ? "Acompanhe os principais acontecimentos comerciais consolidados do dia."
              : activeTab === "whatsapp-dispatch-report"
              ? "Selecione clientes por inatividade, filtre e copie seus códigos (CLs) ou relatórios formatados."
              : "Acompanhe o atendimento por hora, agente e tipo de conversa."}
          </span>
        </div>
        {activeTab !== "daily-summary" && activeTab !== "whatsapp-dispatch-report" && (
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
        )}
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
                                        heatmapMetric === "conversations" ? cell.attendedConversations :
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
        <div className="activity-conversations-layout">
          <section className="activity-panel activity-chart-panel">
            <ActivityChart
              title="Conversas atendidas"
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
        </div>
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

      {activeTab === "daily-summary" ? (
        <DailySummaryTab token={token!} />
      ) : null}

      {activeTab === "whatsapp-dispatch-report" ? (
        <WhatsappDispatchReportTab token={token!} />
      ) : null}
    </div>
  );
}

function DailySummaryTab({ token }: { token: string }) {
  const [selectedDate, setSelectedDate] = useState(() => {
    return localTodayKeySaoPaulo();
  });
  const [copySuccess, setCopySuccess] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

  const summaryQuery = useQuery({
    queryKey: ["whatsapp-daily-summary", selectedDate],
    queryFn: () => api.whatsappDailySummary(token, selectedDate),
    enabled: Boolean(token),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const groupFallbackQuery = useQuery({
    queryKey: ["whatsapp-daily-summary-group-fallback", selectedDate],
    queryFn: () => api.whatsappAgentActivityReport(token, { days: 1 }),
    enabled: Boolean(token) && selectedDate === localTodayKeySaoPaulo(),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const conversationGroupFallbackQuery = useQuery({
    queryKey: ["whatsapp-daily-summary-conversation-group-fallback", selectedDate],
    queryFn: () => api.whatsappMonitorConversations(token, { limit: 100 }),
    enabled: Boolean(token) && selectedDate === localTodayKeySaoPaulo(),
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
  };

  const [isDetailed, setIsDetailed] = useState(false);
  const [useUniqueMessages, setUseUniqueMessages] = useState(false);
  const data = useMemo(
    () => mergeDailySummaryConversationGroupFallback(
      mergeDailySummaryGroupFallback(summaryQuery.data, groupFallbackQuery.data),
      conversationGroupFallbackQuery.data,
    ),
    [summaryQuery.data, groupFallbackQuery.data, conversationGroupFallbackQuery.data],
  );

  const [selectedAgents, setSelectedAgents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data?.agents) {
      const initial: Record<string, boolean> = {};
      data.agents.forEach((agent: any) => {
        initial[agent.agentId] = true;
      });
      setSelectedAgents(initial);
    }
  }, [data]);

  const activeAgentsList = useMemo(() => {
    if (!data?.agents) return [];
    return data.agents.filter((agent: any) => selectedAgents[agent.agentId] !== false);
  }, [data?.agents, selectedAgents]);

  const totalUniqueContactsSent = useMemo(() => {
    if (!activeAgentsList) return 0;
    const uniqueJids = new Set<string>();
    activeAgentsList.forEach((agent: any) => {
      agent.attendedPrivateClients.forEach((c: any) => {
        if (c.sent > 0) uniqueJids.add(c.jid);
      });
      agent.attendedGroupClients.forEach((g: any) => {
        if (g.sent > 0) uniqueJids.add(g.jid);
      });
    });
    return uniqueJids.size;
  }, [activeAgentsList]);

  const messageText = useMemo(() => {
    if (!data) return "";
    const [year, month, day] = data.date.split("-");
    const formattedDate = `${day}/${month}/${year}`;

    // Calculate Top Active Agent
    let topAgentName = "";
    let topAgentValue = 0;
    activeAgentsList.forEach((agent: any) => {
      const val = useUniqueMessages
        ? (agent.attendedPrivateClients.filter((c: any) => c.sent > 0).length + agent.attendedGroupClients.filter((g: any) => g.sent > 0).length)
        : agent.sentMessages;
      if (val > topAgentValue) {
        topAgentValue = val;
        topAgentName = agent.agentName;
      }
    });

    let text = `📅 *Relatório de Atendimento XP*\n_${formattedDate}_\n\n`;
    text += `📱 *Clientes Novos no Dia:* ${data.newCustomersCount}\n`;
    if (data.newCustomersList?.length > 0) {
      text += `${formatDailySummaryCustomerLines(data.newCustomersList)}\n`;
    }
    text += `🔄 *Clientes Recuperados no Dia:* ${data.recoveredCustomersCount}\n`;
    if (data.recoveredCustomersList?.length > 0) {
      text += `${formatDailySummaryCustomerLines(data.recoveredCustomersList, { recovered: true })}\n`;
    }
    text += `\n`;

    if (useUniqueMessages) {
      text += `💬 *Resumo de Mensagens:*\n`;
      text += `📱 Mensagens Únicas Enviadas: ${totalUniqueContactsSent.toLocaleString("pt-BR")}\n`;
      text += `🧾 Mensagens Recebidas: ${data.totalMessagesReceived.toLocaleString("pt-BR")}\n`;
    } else {
      text += `💬 *Resumo de Mensagens:*\n`;
      text += `📱 Mensagens Enviadas: ${data.totalMessagesSent.toLocaleString("pt-BR")}\n`;
      text += `🧾 Mensagens Recebidas: ${data.totalMessagesReceived.toLocaleString("pt-BR")}\n`;
    }

    if (data.averageFirstResponseSeconds !== null && data.averageFirstResponseSeconds !== undefined) {
      text += `⏱️ *Tempo Médio de Resposta (SLA):* ${formatSeconds(data.averageFirstResponseSeconds)}\n`;
    }
    text += `\n`;

    if (topAgentName && topAgentValue > 0) {
      text += `🌟 *Vendedora Mais Ativa:* ${topAgentName} (${topAgentValue.toLocaleString("pt-BR")} ${useUniqueMessages ? "mensagens únicas" : "mensagens enviadas"})\n\n`;
    }

    text += `🏆 *Ranking de Vendedoras e Atendimentos:*\n\n`;

    activeAgentsList.forEach((agent: any, index: number) => {
      const medals = ["🥇", "🥈", "🥉"];
      const emoji = index < 3 ? medals[index] : "❤️";
      text += `${emoji} *${agent.agentName}*\n`;

      if (useUniqueMessages) {
        const agentUniqueContactsSent = agent.attendedPrivateClients.filter((c: any) => c.sent > 0).length +
                                        agent.attendedGroupClients.filter((g: any) => g.sent > 0).length;
        text += `💬 Mensagens Únicas Enviadas: ${agentUniqueContactsSent.toLocaleString("pt-BR")}\n`;
      } else {
        text += `💬 Mensagens Enviadas: ${agent.sentMessages.toLocaleString("pt-BR")}\n`;
      }

      text += `📱 Atendimentos Particular: ${agent.privateChatsCount}\n`;
      text += `👥 Atendimentos em Grupo: ${agent.groupChatsCount}\n`;
      text += `✨ Conversas Iniciadas: ${agent.initiatedCount}\n`;

      if (isDetailed && (agent.attendedPrivateClients.length > 0 || agent.attendedGroupClients.length > 0)) {
        text += `👥 *Clientes Atendidos:*\n`;
        // Particular
        agent.attendedPrivateClients.forEach((c: any) => {
          const initiatedTag = c.initiated ? " _[Iniciada]_" : "";
          text += `* ${c.name} (Particular)${initiatedTag}\n`;
        });
        // Grupos
        agent.attendedGroupClients.forEach((g: any) => {
          text += `* ${g.name} (Grupo)\n`;
        });
      }
      text += `\n`;
    });

    return text;
  }, [data, activeAgentsList, isDetailed, useUniqueMessages, totalUniqueContactsSent]);

  if (summaryQuery.isLoading) {
    return <div className="page-loading">Carregando resumo do dia...</div>;
  }

  if (summaryQuery.isError || !data) {
    return (
      <div className="activity-panel" style={{ padding: "2rem", textAlign: "center" }}>
        <p className="muted" style={{ marginBottom: "1rem" }}>Não foi possível carregar o resumo diário.</p>
        <button
          type="button"
          className="premium-button primary"
          onClick={() => summaryQuery.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="daily-summary-tab animate-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Top Filter Bar */}
      <div className="panel" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Calendar className="muted" size={20} />
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Selecione a data do relatório</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Visualizando acontecimentos comerciais consolidados do dia</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <input
              type="date"
              className="form-input"
              style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", width: "auto" }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              type="button"
              className="premium-button ghost"
              onClick={() => summaryQuery.refetch()}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <RefreshCw size={16} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <section className="daily-summary-grid">
        <div className="daily-summary-card" style={{ '--card-theme': '#287ee7', '--card-theme-rgb': '40, 126, 231' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <Smartphone size={20} />
            </div>
            <span className="daily-summary-card-title">Clientes Novos</span>
          </div>
          <div className="daily-summary-card-value">
            <strong>{data.newCustomersCount}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Primeira compra no dia</p>
        </div>

        <div className="daily-summary-card" style={{ '--card-theme': '#10b981', '--card-theme-rgb': '16, 185, 129' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <RefreshCw size={20} />
            </div>
            <span className="daily-summary-card-title">Clientes Recuperados</span>
          </div>
          <div className="daily-summary-card-value">
            <strong>{data.recoveredCustomersCount}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Voltou a comprar após 90+ dias</p>
        </div>

        <div className="daily-summary-card" style={{ '--card-theme': '#f59e0b', '--card-theme-rgb': '245, 158, 11' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <Package size={20} />
            </div>
            <span className="daily-summary-card-title">Telas Vendidas</span>
          </div>
          <div className="daily-summary-card-value">
            <strong>{data.totalTelasSold.toLocaleString("pt-BR")}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Volume total de itens</p>
        </div>

        <div className="daily-summary-card" style={{ '--card-theme': '#8b5cf6', '--card-theme-rgb': '139, 92, 246' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <DollarSign size={20} />
            </div>
            <span className="daily-summary-card-title">Faturamento</span>
          </div>
          <div className="daily-summary-card-value long-value">
            <strong>R$ {data.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Pedidos faturados no dia</p>
        </div>

        <div className="daily-summary-card" style={{ '--card-theme': '#06b6d4', '--card-theme-rgb': '6, 182, 212' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <MessageCircle size={20} />
            </div>
            <span className="daily-summary-card-title">Respostas Enviadas</span>
          </div>
          <div className="daily-summary-card-value">
            <strong>{data.totalMessagesSent.toLocaleString("pt-BR")}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Mensagens ativas do time</p>
        </div>

        <div className="daily-summary-card" style={{ '--card-theme': '#6366f1', '--card-theme-rgb': '99, 102, 241' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <Clock3 size={20} />
            </div>
            <span className="daily-summary-card-title">Mensagens Recebidas</span>
          </div>
          <div className="daily-summary-card-value">
            <strong>{data.totalMessagesReceived.toLocaleString("pt-BR")}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Entradas enviadas por clientes</p>
        </div>

        <div className="daily-summary-card" style={{ '--card-theme': '#f43f5e', '--card-theme-rgb': '244, 63, 94' } as React.CSSProperties}>
          <div className="daily-summary-card-header">
            <div className="daily-summary-card-icon">
              <Clock3 size={20} />
            </div>
            <span className="daily-summary-card-title">Tempo de Resposta (SLA)</span>
          </div>
          <div className="daily-summary-card-value">
            <strong>{formatSeconds(data.averageFirstResponseSeconds)}</strong>
          </div>
          <p className="daily-summary-card-subtitle">Tempo médio de resposta</p>
        </div>
      </section>

      {/* Copy / Markdown Panel */}
      <div className="panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}>Relatório Formatado para WhatsApp</h3>
            <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem" }}>
              Copie o relatório consolidado com cliques e publique direto no grupo da empresa.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-color)" }}>
              <input
                type="checkbox"
                checked={isDetailed}
                onChange={(e) => setIsDetailed(e.target.checked)}
                style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer", accentColor: "var(--primary)" }}
              />
              Relatório Detalhado
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-color)" }}>
              <input
                type="checkbox"
                checked={useUniqueMessages}
                onChange={(e) => setUseUniqueMessages(e.target.checked)}
                style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer", accentColor: "var(--primary)" }}
              />
              Mensagens Únicas Enviadas (vs Total)
            </label>
            <button
              type="button"
              className={`premium-button ${copySuccess ? "success" : "primary"}`}
              onClick={() => handleCopy(messageText)}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", transition: "all 0.2s ease" }}
            >
              {copySuccess ? <Check size={18} /> : <Copy size={18} />}
              {copySuccess ? "Copiado! ✅" : "Copiar para WhatsApp 📱"}
            </button>
          </div>
        </div>
        {/* Toggle checkboxes / filters */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <UserCheck size={14} /> Selecionar vendedoras para incluir no relatório:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {data.agents.map((agent: any) => {
              const isSelected = selectedAgents[agent.agentId] !== false;
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  onClick={() => {
                    setSelectedAgents((prev) => ({
                      ...prev,
                      [agent.agentId]: !isSelected,
                    }));
                  }}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "20px",
                    border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                    background: isSelected ? "rgba(40, 126, 231, 0.08)" : "transparent",
                    color: isSelected ? "var(--primary)" : "var(--text-muted)",
                    fontSize: "0.825rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    style={{ accentColor: "var(--primary)", cursor: "pointer", margin: 0, width: "0.85rem", height: "0.85rem" }}
                  />
                  {agent.agentName}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            background: "rgba(0, 0, 0, 0.02)",
            border: "1px solid var(--border-color)",
            borderRadius: "12px",
            padding: "1.5rem",
            maxHeight: "350px",
            overflowY: "auto",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            fontSize: "0.9rem",
            color: "var(--text-color)",
            lineHeight: 1.5,
          }}
        >
          {messageText}
        </div>
      </div>

      {/* Salesperson engagement accordion list */}
      <div className="panel" style={{ padding: "2rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}>Desempenho por Vendedora</h3>
          <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem" }}>
            Produtividade comercial e lista detalhada de atendimentos no dia.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {activeAgentsList.length ? (
            activeAgentsList.map((agent: any, index: number) => {
              const medals = ["🥇", "🥈", "🥉"];
              const emoji = index < 3 ? medals[index] : "❤️";
              const isExpanded = expandedAgents[agent.agentId];

              return (
                <div
                  key={agent.agentId}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "var(--card-background)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {/* Header Row */}
                  <div
                    onClick={() => toggleAgent(agent.agentId)}
                    style={{
                      padding: "1.25rem 1.5rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      background: "rgba(0,0,0,0.01)",
                      userSelect: "none",
                      flexWrap: "wrap",
                      gap: "1rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "1.5rem" }}>{emoji}</span>
                      <div>
                        <strong style={{ fontSize: "1.05rem" }}>{agent.agentName}</strong>
                        <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                          📱 Telas: <strong>{agent.screensSold}</strong> | 🧾 Pedidos: <strong>{agent.ordersCount}</strong> | 💰 Faturamento: <strong>R$ {agent.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
                      <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                        <div>💬 Msg Enviadas: <strong style={{ color: "var(--text-color)" }}>{agent.sentMessages}</strong></div>
                        <div>📱 Particular: <strong style={{ color: "var(--text-color)" }}>{agent.privateChatsCount}</strong></div>
                        <div>👥 Grupo: <strong style={{ color: "var(--text-color)" }}>{agent.groupChatsCount}</strong></div>
                        <div>✨ Iniciadas: <strong style={{ color: "var(--text-color)" }}>{agent.initiatedCount}</strong></div>
                      </div>
                      {isExpanded ? <ChevronUp size={20} className="muted" /> : <ChevronDown size={20} className="muted" />}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ padding: "1.5rem", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.005)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
                        {/* Particulares */}
                        <div>
                          <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Smartphone size={16} className="muted" />
                            Contatos Particulares ({agent.attendedPrivateClients.length})
                          </h4>
                          {agent.attendedPrivateClients.length ? (
                            <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.875rem" }}>
                              {agent.attendedPrivateClients.map((client: any) => (
                                <li key={client.jid} style={{ lineHeight: 1.4 }}>
                                  <strong>{client.name}</strong>
                                  <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.4rem" }}>
                                    (💬 {client.sent} env / {client.received} rec)
                                  </span>
                                  {client.initiated && (
                                    <span
                                      style={{
                                        marginLeft: "0.5rem",
                                        fontSize: "0.7rem",
                                        background: "rgba(16, 185, 129, 0.15)",
                                        color: "#10b981",
                                        padding: "1px 6px",
                                        borderRadius: "10px",
                                        fontWeight: 600
                                      }}
                                    >
                                      Iniciada
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted" style={{ margin: 0, fontSize: "0.85rem", fontStyle: "italic" }}>Nenhum particular atendido.</p>
                          )}
                        </div>

                        {/* Grupos */}
                        <div>
                          <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Users size={16} className="muted" />
                            Grupos Atendidos ({agent.attendedGroupClients.length})
                          </h4>
                          {agent.attendedGroupClients.length ? (
                            <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.875rem" }}>
                              {agent.attendedGroupClients.map((group: any) => (
                                <li key={group.jid} style={{ lineHeight: 1.4 }}>
                                  <strong>{group.name}</strong>
                                  <span className="muted" style={{ fontSize: "0.75rem", marginLeft: "0.4rem" }}>
                                    (💬 {group.sent} env / {group.received} rec)
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="muted" style={{ margin: 0, fontSize: "0.85rem", fontStyle: "italic" }}>Nenhum grupo atendido.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <p className="muted" style={{ margin: 0 }}>Nenhuma vendedora registrou atividade nesta data.</p>
            </div>
          )}
        </div>
      </div>

      {/* Special Customers Tables Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem" }}>
        {/* Novos Clientes */}
        <div className="panel" style={{ padding: "2rem" }}>
          <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Award className="accent-primary" size={20} />
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Clientes Novos do Dia ({data.newCustomersCount})</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Registraram a primeira compra na empresa hoje</p>
            </div>
          </div>
          {data.newCustomersList.length ? (
            <div className="table-scroll">
              <table className="data-table" style={{ fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Valor</th>
                    <th>Peças</th>
                    <th>Vendedora</th>
                  </tr>
                </thead>
                <tbody>
                  {data.newCustomersList.map((c: any) => (
                    <tr key={c.customer_code}>
                      <td style={{ fontWeight: 600, color: "var(--primary)" }}>{c.customer_code}</td>
                      <td>{c.display_name}</td>
                      <td>R$ {Number(c.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td>{c.item_count}</td>
                      <td className="muted">{c.last_attendant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontStyle: "italic", fontSize: "0.875rem" }}>Nenhum novo cliente registrado nesta data.</p>
          )}
        </div>

        {/* Recuperados */}
        <div className="panel" style={{ padding: "2rem" }}>
          <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <RefreshCw className="accent-success" size={20} />
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Clientes Recuperados ({data.recoveredCustomersCount})</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Voltaram a comprar depois de 90+ dias inativos</p>
            </div>
          </div>
          {data.recoveredCustomersList.length ? (
            <div className="table-scroll">
              <table className="data-table" style={{ fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Valor</th>
                    <th>Inatividade</th>
                    <th>Vendedora</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recoveredCustomersList.map((c: any) => (
                    <tr key={c.customer_code}>
                      <td style={{ fontWeight: 600, color: "var(--success)" }}>{c.customer_code}</td>
                      <td>{c.display_name}</td>
                      <td>R$ {Number(c.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td>
                        <strong style={{ color: "var(--success)" }}>{c.days_inactive} dias</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>Desde {c.previous_order_date.split("-").reverse().join("/")}</div>
                      </td>
                      <td className="muted">{c.last_attendant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontStyle: "italic", fontSize: "0.875rem" }}>Nenhum cliente recuperado registrado nesta data.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function WhatsappDispatchReportTab({ token }: { token: string }) {
  const [selectedRanges, setSelectedRanges] = useState<string[]>(["31-59", "60-89"]);
  const [searchTerm, setSearchTerm] = useState("");
  const [includeDaysInactive, setIncludeDaysInactive] = useState(true);
  const [includeOrderStats, setIncludeOrderStats] = useState(true);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Record<string, boolean>>({});
  
  const [copyClsSuccess, setCopyClsSuccess] = useState(false);
  const [copyWhatsAppSuccess, setCopyWhatsAppSuccess] = useState(false);

  const customersQuery = useQuery({
    queryKey: ["dispatch-report-customers", selectedRanges],
    queryFn: () =>
      api.customers(token, {
        daysInactiveRanges: selectedRanges.join(","),
        sortBy: "priority",
        limit: 500,
      }),
    enabled: Boolean(token && selectedRanges.length > 0),
  });

  const customers = customersQuery.data ?? [];

  // Reset selected ids when query loads new customers
  useEffect(() => {
    if (customersQuery.data) {
      const initial: Record<string, boolean> = {};
      customersQuery.data.forEach((c) => {
        initial[c.id] = true;
      });
      setSelectedCustomerIds(initial);
    }
  }, [customersQuery.data]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter((c) => 
      c.displayName.toLowerCase().includes(term) ||
      c.customerCode.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const selectedCustomers = useMemo(() => {
    return filteredCustomers.filter((c) => selectedCustomerIds[c.id] !== false);
  }, [filteredCustomers, selectedCustomerIds]);

  const totalSelectedCount = selectedCustomers.length;

  const formattedWhatsAppText = useMemo(() => {
    if (selectedCustomers.length === 0) return "";
    let header = `*Lista de Clientes para Contato (${selectedCustomers.length} clientes)*\n\n`;
    const body = selectedCustomers
      .map((c) => {
        const code = c.customerCode ? `*${c.customerCode}*` : "";
        const name = c.displayName || "Cliente sem nome";
        let line = `- ${code} - ${name}`;
        if (includeDaysInactive && c.daysSinceLastPurchase !== null && c.daysSinceLastPurchase !== undefined) {
          line += ` | ${c.daysSinceLastPurchase} dias sem comprar`;
        }
        if (includeOrderStats) {
          const ticket = Number(c.avgTicket ?? 0);
          line += ` | Média: R$ ${ticket.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        return line;
      })
      .join("\n");
    return header + body;
  }, [selectedCustomers, includeDaysInactive, includeOrderStats]);

  function handleToggleRange(rangeId: string) {
    setSelectedRanges((current) =>
      current.includes(rangeId)
        ? current.filter((r) => r !== rangeId)
        : [...current, rangeId]
    );
  }

  function handleSelectAllRanges() {
    setSelectedRanges(["31-59", "60-89", "90-179", "180+", "0-14", "15-30"]);
  }

  function handleResetToAttentionOnly() {
    setSelectedRanges(["31-59", "60-89"]);
  }

  function handleToggleAllCustomers(checked: boolean) {
    const next: Record<string, boolean> = {};
    filteredCustomers.forEach((c) => {
      next[c.id] = checked;
    });
    setSelectedCustomerIds(next);
  }

  function handleToggleCustomer(id: string) {
    setSelectedCustomerIds((prev) => ({
      ...prev,
      [id]: prev[id] === false ? true : false,
    }));
  }

  function handleCopyCls() {
    const codes = selectedCustomers.map((c) => c.customerCode).filter(Boolean);
    if (codes.length === 0) {
      alert("Nenhum cliente selecionado.");
      return;
    }
    const text = codes.join(", ");
    navigator.clipboard.writeText(text);
    setCopyClsSuccess(true);
    setTimeout(() => setCopyClsSuccess(false), 2000);
  }

  function handleCopyWhatsApp() {
    if (!formattedWhatsAppText) {
      alert("Nenhum cliente selecionado.");
      return;
    }
    navigator.clipboard.writeText(formattedWhatsAppText);
    setCopyWhatsAppSuccess(true);
    setTimeout(() => setCopyWhatsAppSuccess(false), 2000);
  }

  const rangeButtons = [
    { id: "0-14", label: "Ativo 1 (0-14 dias)", color: "rgba(16, 185, 129, 0.08)", activeColor: "#10b981" },
    { id: "15-30", label: "Ativo 2 (15-30 dias)", color: "rgba(16, 185, 129, 0.08)", activeColor: "#10b981" },
    { id: "31-59", label: "Atenção 1 (31-59 dias)", color: "rgba(245, 158, 11, 0.08)", activeColor: "#f59e0b" },
    { id: "60-89", label: "Atenção 2 (60-89 dias)", color: "rgba(245, 158, 11, 0.08)", activeColor: "#f59e0b" },
    { id: "90-179", label: "Inativo 1 (90-179 dias)", color: "rgba(239, 68, 68, 0.08)", activeColor: "#ef4444" },
    { id: "180+", label: "Inativo 2 (180+ dias)", color: "rgba(220, 38, 38, 0.08)", activeColor: "#dc2626" },
  ];

  return (
    <div className="daily-summary-tab animate-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Filters Panel */}
      <div className="panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Seleção de Faixas de Clientes</h3>
          <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>
            Selecione uma ou mais faixas de inatividade para carregar os clientes correspondentes.
          </p>
        </div>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          {rangeButtons.map((btn) => {
            const isSelected = selectedRanges.includes(btn.id);
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => handleToggleRange(btn.id)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "20px",
                  border: isSelected ? `2px solid ${btn.activeColor}` : "1px solid var(--border-color)",
                  background: isSelected ? btn.color : "transparent",
                  color: isSelected ? btn.activeColor : "var(--text-muted)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.15s ease",
                }}
              >
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: btn.activeColor
                }} />
                {btn.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            type="button"
            className="premium-button ghost"
            onClick={handleSelectAllRanges}
            style={{ fontSize: "0.825rem", padding: "0.4rem 0.8rem" }}
          >
            Selecionar Todos
          </button>
          <button
            type="button"
            className="premium-button ghost"
            onClick={handleResetToAttentionOnly}
            style={{ fontSize: "0.825rem", padding: "0.4rem 0.8rem" }}
          >
            Apenas Atenção (Padrão)
          </button>
        </div>
      </div>

      {/* Main Grid: Selector & Markdown Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem" }}>
        
        {/* Left Panel: Customer List Selector */}
        <div className="panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Seleção de Clientes</h3>
              <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>
                Filtrando {filteredCustomers.length} clientes. Desmarque os que não devem ser incluídos.
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="activity-search-bar" style={{ display: "flex", alignItems: "center", gap: "0.5rem", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.5rem 0.75rem", background: "rgba(0,0,0,0.01)" }}>
            <Search className="muted" size={18} />
            <input
              type="text"
              placeholder="Buscar por nome ou código (CL)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: "none", outline: "none", width: "100%", background: "transparent", fontSize: "0.9rem" }}
            />
          </div>

          {/* Select all checkboxes bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={filteredCustomers.length > 0 && filteredCustomers.every(c => selectedCustomerIds[c.id] !== false)}
                onChange={(e) => handleToggleAllCustomers(e.target.checked)}
                style={{ accentColor: "var(--primary)", cursor: "pointer" }}
              />
              Marcar/Desmarcar Todos
            </label>
            <span className="muted" style={{ fontSize: "0.825rem" }}>
              Selecionados: <strong>{totalSelectedCount}</strong> / {filteredCustomers.length}
            </span>
          </div>

          {/* Customers Scrollable List */}
          {customersQuery.isLoading ? (
            <div className="page-loading" style={{ padding: "2rem" }}>Carregando contatos...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="muted" style={{ textAlign: "center", padding: "2rem", fontStyle: "italic" }}>
              Nenhum cliente correspondente encontrado.
            </div>
          ) : (
            <div style={{ maxHeight: "350px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6rem", paddingRight: "4px" }}>
              {filteredCustomers.map((c) => {
                const isChecked = selectedCustomerIds[c.id] !== false;
                const inactiveText = c.daysSinceLastPurchase !== null ? `${c.daysSinceLastPurchase} dias` : "--";
                return (
                  <label
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      background: isChecked ? "rgba(40, 126, 231, 0.02)" : "transparent",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCustomer(c.id)}
                        style={{ accentColor: "var(--primary)", cursor: "pointer" }}
                      />
                      <div>
                        <strong style={{ display: "block" }}>{c.customerCode} - {c.displayName}</strong>
                        <span className="muted" style={{ fontSize: "0.75rem" }}>
                          Última compra: {c.lastPurchaseAt ? c.lastPurchaseAt.split("-").reverse().join("/") : "Nunca"} | Média: R$ {c.avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontWeight: 600,
                      background: c.status === "ACTIVE" ? "rgba(16, 185, 129, 0.12)" : c.status === "ATTENTION" ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)",
                      color: c.status === "ACTIVE" ? "#10b981" : c.status === "ATTENTION" ? "#f59e0b" : "#ef4444",
                    }}>
                      {inactiveText}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Panel: Markdown Preview & Formatted Copy */}
        <div className="panel" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>Visualização e Cópia</h3>
            <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>
              Copie a lista simplificada de códigos para o disparador ou gere a mensagem para o grupo.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <button
              type="button"
              className={`premium-button ${copyClsSuccess ? "success" : "primary"}`}
              onClick={handleCopyCls}
              style={{ flex: "1 1 200px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              {copyClsSuccess ? <Check size={18} /> : <Copy size={18} />}
              {copyClsSuccess ? "Códigos Copiados! ✅" : "Copiar Apenas CLs 📋"}
            </button>

            <button
              type="button"
              className={`premium-button ${copyWhatsAppSuccess ? "success" : "primary"}`}
              onClick={handleCopyWhatsApp}
              style={{ flex: "1 1 200px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", background: "var(--success)" }}
            >
              {copyWhatsAppSuccess ? <Check size={18} /> : <Copy size={18} />}
              {copyWhatsAppSuccess ? "Copiado! ✅" : "Copiar para WhatsApp 📱"}
            </button>
          </div>

          {/* WhatsApp copy toggles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={includeDaysInactive}
                onChange={(e) => setIncludeDaysInactive(e.target.checked)}
                style={{ width: "1rem", height: "1rem", cursor: "pointer", accentColor: "var(--primary)" }}
              />
              Incluir Dias Inativo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.85rem", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={includeOrderStats}
                onChange={(e) => setIncludeOrderStats(e.target.checked)}
                style={{ width: "1rem", height: "1rem", cursor: "pointer", accentColor: "var(--primary)" }}
              />
              Incluir Média de Ticket
            </label>
          </div>

          {/* Formatted Text Box */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.02)",
              border: "1px solid var(--border-color)",
              borderRadius: "12px",
              padding: "1.25rem",
              maxHeight: "300px",
              overflowY: "auto",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              fontSize: "0.85rem",
              color: "var(--text-color)",
              lineHeight: 1.45,
            }}
          >
            {formattedWhatsAppText || "Nenhum cliente selecionado para visualizar."}
          </div>
        </div>

      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  WhatsappAgentActivityCell,
  WhatsappAgentActivityConversation,
  WhatsappAgentActivityDailyPoint,
  WhatsappAgentActivityReport,
} from "@olist-crm/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, BarChart3, Clock3, Download, MessageCircle, RefreshCw, Smartphone, TrendingDown, TrendingUp, Users } from "lucide-react";
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
  receivedMessages: 0,
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
      {
        ...conversation,
        sentMessages: 0,
        receivedMessages: 0,
      };

    current.name = current.name || conversation.name;
    current.kind = current.kind === "internal_group" ? current.kind : conversation.kind;
    current.sentMessages += conversation.sentMessages;
    current.receivedMessages += conversation.receivedMessages;
    merged.set(conversation.remoteJid, current);
  }

  return Array.from(merged.values()).sort(
    (left, right) => right.sentMessages - left.sentMessages || left.name.localeCompare(right.name),
  );
}

function summarizeCells(cells: WhatsappAgentActivityCell[]) {
  const conversations = mergeConversations(cells.flatMap((cell) => cell.conversations));
  const responseSecondsTotal = cells.reduce(
    (sum, cell) => sum + (cell.averageFirstResponseSeconds ?? 0) * cell.responseCount,
    0,
  );
  const responseCount = cells.reduce((sum, cell) => sum + cell.responseCount, 0);
  const sentMessages = cells.reduce((sum, cell) => sum + cell.sentMessages, 0);
  const receivedMessages = cells.reduce((sum, cell) => sum + cell.receivedMessages, 0);
  const attended = conversations.filter((conversation) => conversation.sentMessages > 0);
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
    receivedMessages,
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
      receivedMessages: summary.receivedMessages,
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
    if (selectedAgentId === "all") {
      return { ...report.summary, conversations: summarizeCells(report.hourlyCells).conversations };
    }
    return summarizeCells(visibleCells);
  }, [report, selectedAgentId, visibleCells]);
  const dailySeries = useMemo(() => {
    if (!report) return [];
    return selectedAgentId === "all" ? report.dailySeries : buildDailySeries(report, visibleCells);
  }, [report, selectedAgentId, visibleCells]);
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
    () => Math.max(1, ...Array.from(cellMap.values()).map((cell) => cell.attendedConversations)),
    [cellMap],
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
      averageFirstResponseSeconds: calculateGrowth(s.averageFirstResponseSeconds ?? 0, p.averageFirstResponseSeconds ?? 0),
      attendedGroups: calculateGrowth(s.attendedGroups, p.attendedGroups),
      attendedPrivates: calculateGrowth(s.attendedPrivates, p.attendedPrivates),
      activeAgents: calculateGrowth(s.activeAgents, p.activeAgents),
    };
  }, [report]);

  const cards = [
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
      value: visibleSummary.attendedPrivates,
      previous: selectedAgentId === "all" ? report?.previousSummary?.attendedPrivates : undefined,
      detail: "Conversas individuais",
      icon: Smartphone,
    },
    {
      key: "responses",
      label: "Mensagens enviadas",
      value: visibleSummary.sentMessages,
      previous: selectedAgentId === "all" ? report?.previousSummary?.sentMessages : undefined,
      detail: "Total de respostas enviadas",
      icon: BarChart3,
    },
    {
      key: "received",
      label: "Mensagens recebidas",
      value: visibleSummary.receivedMessages,
      previous: selectedAgentId === "all" ? report?.previousSummary?.receivedMessages : undefined,
      detail: "Total de mensagens de entrada",
      icon: Clock3, // Using Clock3 for now, maybe MessageSquare or something else?
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
                      const level = heatLevel(cell.attendedConversations, maxCellValue);
                      const title = `${day.label} ${String(hour).padStart(2, "0")}h - ${cell.attendedConversations} conversas, ${cell.attendedGroups} grupos, ${cell.attendedPrivates} privados, ${cell.sentMessages} respostas, ${cell.receivedMessages} recebidas`;
                      return (
                        <button
                          type="button"
                          key={key}
                          className={`activity-heat-cell level-${level} ${selectedCellKey === key ? "selected" : ""}`}
                          title={title}
                          onClick={() => setSelectedCellKey(key)}
                        >
                          {cell.attendedConversations && showHeatmapNumbers ? cell.attendedConversations : ""}
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
                  </div>
                  <div className="activity-detail-columns">
                    <div>
                      <h3>Agentes ativos</h3>
                      {selectedCellRows.filter((cell) => cell.sentMessages > 0).length ? (
                        selectedCellRows
                          .filter((cell) => cell.sentMessages > 0)
                          .sort((left, right) => right.sentMessages - left.sentMessages)
                          .map((cell) => (
                            <button
                              type="button"
                              key={`${cell.agentId}-${cell.date}-${cell.hour}`}
                              className="activity-detail-row"
                              onClick={() => setSelectedAgentId(cell.agentId)}
                            >
                              <span>{cell.agentName}</span>
                              <strong>{formatNumber(cell.sentMessages)}</strong>
                            </button>
                          ))
                      ) : (
                        <p>Nenhuma resposta nesse horario.</p>
                      )}
                    </div>
                    <div>
                      <h3>Conversas</h3>
                      {selectedCellSummary.conversations.filter((conversation) => conversation.sentMessages > 0).length ? (
                        selectedCellSummary.conversations
                          .filter((conversation) => conversation.sentMessages > 0)
                          .slice(0, 8)
                          .map((conversation) => (
                            <div key={conversation.remoteJid} className="activity-detail-row static">
                              <span>
                                {conversation.name}
                                <small>{conversationKindLabel(conversation.kind)}</small>
                              </span>
                              <strong>{formatNumber(conversation.sentMessages)}</strong>
                            </div>
                          ))
                      ) : (
                        <p>Nenhuma conversa atendida nesse horario.</p>
                      )}
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
                      <td>{formatSeconds(agent.averageFirstResponseSeconds)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>Nao ha dados disponiveis</td>
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

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WhatsappAgentActivityCell, WhatsappAgentActivityReport } from "@olist-crm/shared";
import {
  BarChart3,
  Clock3,
  MessageCircle,
  Monitor,
  Moon,
  RefreshCw,
  Smartphone,
  Users,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type ActivityWindowDays = 1 | 7 | 14 | 30;

const windowOptions: ActivityWindowDays[] = [1, 7, 14, 30];

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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

function mergeCells(cells: WhatsappAgentActivityCell[]) {
  return cells.reduce(
    (total, cell) => ({
      sentMessages: total.sentMessages + cell.sentMessages,
      receivedMessages: total.receivedMessages + cell.receivedMessages,
      privateMessages: total.privateMessages + cell.privateMessages,
      groupMessages: total.groupMessages + cell.groupMessages,
      customerGroupMessages: total.customerGroupMessages + cell.customerGroupMessages,
      internalGroupMessages: total.internalGroupMessages + cell.internalGroupMessages,
      otherGroupMessages: total.otherGroupMessages + cell.otherGroupMessages,
      nightMessages: total.nightMessages + cell.nightMessages,
      crmMessages: total.crmMessages + cell.crmMessages,
      whatsappMessages: total.whatsappMessages + cell.whatsappMessages,
    }),
    {
      sentMessages: 0,
      receivedMessages: 0,
      privateMessages: 0,
      groupMessages: 0,
      customerGroupMessages: 0,
      internalGroupMessages: 0,
      otherGroupMessages: 0,
      nightMessages: 0,
      crmMessages: 0,
      whatsappMessages: 0,
    },
  );
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

function metricCards(summary: WhatsappAgentActivityReport["summary"] | ReturnType<typeof mergeCells>) {
  const nonInternalGroups = summary.customerGroupMessages + summary.otherGroupMessages;

  return [
    {
      key: "sent",
      label: "Respostas",
      value: summary.sentMessages,
      detail: `${formatNumber(summary.whatsappMessages)} pelo WhatsApp`,
      icon: MessageCircle,
    },
    {
      key: "private",
      label: "Privado",
      value: summary.privateMessages,
      detail: `${formatNumber(summary.receivedMessages)} recebidas`,
      icon: Smartphone,
    },
    {
      key: "groups",
      label: "Grupos clientes",
      value: nonInternalGroups,
      detail: `${formatNumber(summary.internalGroupMessages)} internos separados`,
      icon: Users,
    },
    {
      key: "night",
      label: "Noturno",
      value: summary.nightMessages,
      detail: "18h ate 08h",
      icon: Moon,
    },
    {
      key: "crm",
      label: "Pelo CRM",
      value: summary.crmMessages,
      detail: `${formatNumber(summary.whatsappMessages)} fora do CRM`,
      icon: Monitor,
    },
  ];
}

export function WhatsappActivityPage() {
  const { token } = useAuth();
  const [days, setDays] = useState<ActivityWindowDays>(7);
  const [selectedAgentId, setSelectedAgentId] = useState("all");

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
  const visibleSummary = useMemo(() => mergeCells(visibleCells), [visibleCells]);
  const cellMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof mergeCells>>();
    if (!report) return map;

    for (const day of report.days) {
      for (const hour of report.hours) {
        map.set(`${day.date}:${hour}`, mergeCells([]));
      }
    }

    for (const cell of visibleCells) {
      const key = `${cell.date}:${cell.hour}`;
      const current = map.get(key) ?? mergeCells([]);
      map.set(key, mergeCells([current as WhatsappAgentActivityCell, cell]));
    }

    return map;
  }, [report, visibleCells]);
  const maxCellValue = useMemo(
    () => Math.max(1, ...Array.from(cellMap.values()).map((cell) => cell.sentMessages)),
    [cellMap],
  );

  useEffect(() => {
    if (!report || selectedAgentId === "all") return;
    if (!report.agents.some((agent) => agent.agentId === selectedAgentId)) {
      setSelectedAgentId("all");
    }
  }, [report, selectedAgentId]);

  if (reportQuery.isLoading) {
    return <div className="page-loading">Carregando atividade...</div>;
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="whatsapp-activity-page">
        <div className="activity-header">
          <div>
            <p className="eyebrow">WhatsApp</p>
            <h1>Atividade dos agentes</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => reportQuery.refetch()}>
            <RefreshCw size={16} />
            Tentar novamente
          </button>
        </div>
        <div className="activity-empty">Nao foi possivel carregar o relatorio agora.</div>
      </div>
    );
  }

  const cards = metricCards(selectedAgent ? visibleSummary : report.summary);

  return (
    <div className="whatsapp-activity-page">
      <div className="activity-header">
        <div>
          <p className="eyebrow">WhatsApp</p>
          <h1>Atividade dos agentes</h1>
        </div>
        <div className="activity-actions">
          <label className="activity-select">
            <Clock3 size={16} />
            <select value={days} onChange={(event) => setDays(Number(event.target.value) as ActivityWindowDays)}>
              {windowOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 1 ? "Hoje" : `Ultimos ${option} dias`}
                </option>
              ))}
            </select>
          </label>
          <label className="activity-select">
            <Users size={16} />
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

      <section className="activity-metric-grid">
        {cards.map(({ key, label, value, detail, icon: Icon }) => (
          <div key={key} className="activity-metric-card">
            <div className="activity-metric-icon">
              <Icon size={18} />
            </div>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </section>

      <section className="activity-panel">
        <div className="activity-panel-header">
          <div>
            <h2>Respostas por hora</h2>
            <span>{selectedAgent ? selectedAgent.agentName : "Todos os numeros conectados"}</span>
          </div>
          <div className="activity-live-chip">
            <BarChart3 size={14} />
            Atualiza em tempo real
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
                  const cell = cellMap.get(`${day.date}:${hour}`) ?? mergeCells([]);
                  const level = heatLevel(cell.sentMessages, maxCellValue);
                  const title = `${day.label} ${String(hour).padStart(2, "0")}h - ${cell.sentMessages} respostas, ${cell.privateMessages} privado, ${cell.customerGroupMessages + cell.otherGroupMessages} grupos clientes`;
                  return (
                    <div
                      key={`${day.date}:${hour}`}
                      className={`activity-heat-cell level-${level} ${isNightHour(hour, report) ? "night" : ""}`}
                      title={title}
                    >
                      {cell.sentMessages ? cell.sentMessages : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="activity-panel">
        <div className="activity-panel-header">
          <div>
            <h2>Vendedoras</h2>
            <span>{formatNumber(report.summary.activeAgents)} agentes com respostas no periodo</span>
          </div>
        </div>

        {report.agents.length ? (
          <div className="activity-table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th>Respostas</th>
                  <th>Privado</th>
                  <th>Grupos clientes</th>
                  <th>Outros grupos</th>
                  <th>Internos</th>
                  <th>Noturno</th>
                  <th>WhatsApp</th>
                  <th>CRM</th>
                  <th>Horas ativas</th>
                </tr>
              </thead>
              <tbody>
                {report.agents.map((agent) => (
                  <tr key={agent.agentId}>
                    <td>
                      <button
                        type="button"
                        className="activity-agent-button"
                        onClick={() => setSelectedAgentId(agent.agentId)}
                      >
                        <span className="activity-avatar">{initials(agent.agentName) || "WA"}</span>
                        <span>
                          <strong>{agent.agentName}</strong>
                          <small>{formatPhone(agent.phoneNumber)}</small>
                        </span>
                      </button>
                    </td>
                    <td>{formatNumber(agent.sentMessages)}</td>
                    <td>{formatNumber(agent.privateMessages)}</td>
                    <td>{formatNumber(agent.customerGroupMessages)}</td>
                    <td>{formatNumber(agent.otherGroupMessages)}</td>
                    <td>{formatNumber(agent.internalGroupMessages)}</td>
                    <td>{formatNumber(agent.nightMessages)}</td>
                    <td>{formatNumber(agent.whatsappMessages)}</td>
                    <td>{formatNumber(agent.crmMessages)}</td>
                    <td>{formatNumber(agent.activeHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="activity-empty">Nenhuma resposta registrada nesse periodo.</div>
        )}
      </section>
    </div>
  );
}

function isNightHour(hour: number, report: WhatsappAgentActivityReport) {
  return hour >= report.period.nightStartHour || hour < report.period.nightEndHour;
}

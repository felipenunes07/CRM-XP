import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AttendantListItem, AttendantTrendPoint, CustomerStatus } from "@olist-crm/shared";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleDot,
  MessageCircleMore,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";
import {
  type AttendantChartMetric,
  type AttendantTrendChartRow,
  buildTrendChartData,
  chartMetricLabel,
  getAttendantColor,
} from "./attendantsPage.helpers";

type WindowMonths = 3 | 6 | 12 | 24;
type AttendantScope = "all" | string;

const windowOptions: WindowMonths[] = [3, 6, 12, 24];
const metricOptions: AttendantChartMetric[] = [
  "pieces",
  "revenue",
  "uniqueCustomers",
  "newCustomers",
  "recoveredCustomers",
  "sentMessages",
  "attendedConversations",
];
const individualMetricOptions: AttendantChartMetric[] = [
  "pieces",
  "attendedConversations",
  "recoveredCustomers",
  "newCustomers",
  "sentMessages",
  "revenue",
];
const portfolioStatuses: Array<"ALL" | CustomerStatus> = ["ALL", "ACTIVE", "ATTENTION", "INACTIVE"];
const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const businessHours = Array.from({ length: 14 }, (_, index) => index + 7);

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function formatMonthLabel(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  return matched ? `${matched[2]}/${matched[1]?.slice(2)}` : value;
}

function formatDecimal(value: number, digits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number) {
  return `${formatDecimal(value * 100, 1)}%`;
}

function formatGrowth(value: number | null) {
  if (value === null) return "Sem base anterior";
  const percent = value * 100;
  return `${percent > 0 ? "+" : ""}${formatDecimal(percent, 1)}%`;
}

function formatResponseTime(seconds: number | null) {
  if (seconds === null) return "Sem base";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${formatDecimal(seconds / 3600, 1)} h`;
}

function formatMetricAxis(value: number, metric: AttendantChartMetric) {
  if (metric !== "revenue") {
    if (Math.abs(value) >= 1000) return `${formatDecimal(value / 1000, 1)}k`;
    return formatNumber(value);
  }
  if (Math.abs(value) >= 1_000_000) return `R$ ${formatDecimal(value / 1_000_000, 1)} mi`;
  if (Math.abs(value) >= 1_000) return `R$ ${formatDecimal(value / 1_000, 0)}k`;
  return formatCurrency(value);
}

function Avatar({ item, size = "normal" }: { item: AttendantListItem; size?: "normal" | "large" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = item.attendant
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");

  return (
    <span
      className={`attendant-avatar attendant-avatar-${size}`}
      style={{ "--attendant-color": getAttendantColor(item.attendant) } as React.CSSProperties}
    >
      {item.whatsapp.profilePictureUrl && !imageFailed ? (
        <img
          src={item.whatsapp.profilePictureUrl}
          alt={`Foto de ${item.attendant} no WhatsApp`}
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials}</span>
      )}
      <i aria-label="WhatsApp ativo" />
    </span>
  );
}

function GrowthBadge({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  const positive = value !== null && (inverse ? value <= 0 : value >= 0);
  const negative = value !== null && !positive;
  return (
    <span className={`attendant-growth ${positive ? "is-positive" : negative ? "is-negative" : "is-neutral"}`}>
      {positive ? <ArrowUpRight size={14} /> : negative ? <ArrowDownRight size={14} /> : <CircleDot size={12} />}
      {formatGrowth(value)}
    </span>
  );
}

function MetricTile({
  label,
  value,
  detail,
  growth,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  growth?: number | null;
  icon: React.ReactNode;
}) {
  return (
    <div className="attendant-metric-tile">
      <div className="attendant-metric-label">
        <span>{icon}</span>
        {label}
      </div>
      <strong>{value}</strong>
      <div className="attendant-metric-detail">
        <span>{detail}</span>
        {growth !== undefined ? <GrowthBadge value={growth} /> : null}
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  metric,
  data,
  currentMonth,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; color?: string; value?: number; name?: string }>;
  label?: string;
  metric: AttendantChartMetric;
  data: AttendantTrendChartRow[];
  currentMonth: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const currentIndex = data.findIndex((row) => row.month === label);
  const previousRow = currentIndex > 0 ? data[currentIndex - 1] : null;
  const formatValue = (value: number) => metric === "revenue" ? formatCurrency(value) : formatNumber(value);

  return (
    <div className="attendant-chart-tooltip">
      <span>
        {formatMonthLabel(label)}
        <small>{label === currentMonth ? "Mês atual · parcial" : "Mês fechado"}</small>
      </span>
      {payload.map((entry) => {
        const currentValue = Number(entry.value ?? 0);
        const previousValue = previousRow ? Number(previousRow[String(entry.dataKey)] ?? 0) : 0;
        const growth = previousRow && previousValue > 0 ? (currentValue - previousValue) / previousValue : null;
        const growthPercent = growth === null ? null : growth * 100;
        const gaugeFill = growthPercent === null ? 0 : Math.min(100, Math.abs(growthPercent));
        const direction = growth === null ? "neutral" : growth > 0 ? "up" : growth < 0 ? "down" : "stable";
        return (
          <div className={`attendant-chart-tooltip-row is-${direction}`} key={String(entry.dataKey)}>
            <i style={{ background: entry.color }} />
            <div>
              <strong>{entry.name}</strong>
              <small>Anterior: {previousRow ? formatValue(previousValue) : "sem base"}</small>
            </div>
            <span className="attendant-chart-gauge" aria-label={growth === null ? "Sem base anterior" : formatGrowth(growth)}>
              <svg viewBox="0 0 52 29" aria-hidden="true">
                <path d="M 5 25 A 21 21 0 0 1 47 25" pathLength="100" />
                <path
                  className="attendant-chart-gauge-fill"
                  d="M 5 25 A 21 21 0 0 1 47 25"
                  pathLength="100"
                  style={{ strokeDasharray: `${gaugeFill} 100` }}
                />
              </svg>
              <b>{growth === null ? "—" : formatGrowth(growth)}</b>
            </span>
            <strong>{formatValue(currentValue)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function GoalProgress({
  label,
  current,
  target,
  formatter,
}: {
  label: string;
  current: number;
  target: number | null;
  formatter: (value: number) => string;
}) {
  const progress = target && target > 0 ? current / target : null;
  return (
    <div className="attendant-goal-row">
      <div>
        <span>{label}</span>
        <strong>{progress === null ? "Meta ainda não definida" : `${formatPercent(progress)} realizado`}</strong>
      </div>
      <div className="attendant-goal-values">
        <strong>{formatter(current)}</strong>
        <span>{target === null ? "—" : `de ${formatter(target)}`}</span>
      </div>
      <div className="attendant-goal-track">
        <i style={{ width: `${Math.min(100, (progress ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

function ActivityHeatmap({ item }: { item: AttendantListItem }) {
  const [messageType, setMessageType] = useState<"total" | "sent" | "received">("total");
  const [showNumbers, setShowNumbers] = useState(true);
  const cells = useMemo(() => {
    const totals = new Map<string, number>();
    item.activityHeatmap.forEach((cell) => {
      const weekday = new Date(`${cell.date}T12:00:00`).getDay();
      const key = `${weekday}-${cell.hour}`;
      const value =
        messageType === "sent"
          ? cell.sentMessages
          : messageType === "received"
            ? cell.receivedMessages
            : cell.sentMessages + cell.receivedMessages;
      totals.set(key, (totals.get(key) ?? 0) + value);
    });
    const maximum = Math.max(0, ...totals.values());
    return { totals, maximum };
  }, [item, messageType]);

  return (
    <div className="attendant-heatmap">
      <div className="attendant-heatmap-controls">
        <div role="group" aria-label="Tipo de mensagem">
          {(["total", "sent", "received"] as const).map((type) => (
            <button
              type="button"
              key={type}
              className={messageType === type ? "is-active" : ""}
              onClick={() => setMessageType(type)}
            >
              {type === "total" ? "Total" : type === "sent" ? "Enviadas" : "Recebidas"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`attendant-number-toggle ${showNumbers ? "is-active" : ""}`}
          onClick={() => setShowNumbers((current) => !current)}
        >
          {showNumbers ? "Números visíveis" : "Mostrar números"}
        </button>
      </div>
      <div className="attendant-heatmap-hours">
        <span />
        {businessHours.map((hour) => (
          <span key={hour}>{hour}h</span>
        ))}
      </div>
      {weekdayLabels.map((weekday, weekdayIndex) => (
        <div className="attendant-heatmap-row" key={weekday}>
          <span>{weekday}</span>
          {businessHours.map((hour) => {
            const value = cells.totals.get(`${weekdayIndex}-${hour}`) ?? 0;
            const level = cells.maximum ? Math.ceil((value / cells.maximum) * 4) : 0;
            return (
              <span
                key={hour}
                className={`heat-level-${level}`}
                title={`${weekday}, ${hour}h: ${formatNumber(value)} ${
                  messageType === "sent" ? "enviadas" : messageType === "received" ? "recebidas" : "mensagens"
                }`}
              >
                {showNumbers && value > 0 ? formatNumber(value) : ""}
              </span>
            );
          })}
        </div>
      ))}
      <div className="attendant-heatmap-legend">
        <span>Menos atividade</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i key={level} className={`heat-level-${level}`} />
        ))}
        <span>Mais atividade</span>
      </div>
    </div>
  );
}

export function AttendantsPage() {
  const { token } = useAuth();
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(12);
  const [scope, setScope] = useState<AttendantScope>("all");
  const [chartMetric, setChartMetric] = useState<AttendantChartMetric>("pieces");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioStatus, setPortfolioStatus] = useState<"ALL" | CustomerStatus>("ALL");
  const [portfolioSearch, setPortfolioSearch] = useState("");

  const attendantsQuery = useQuery({
    queryKey: ["attendants", windowMonths],
    queryFn: () => api.attendants(token!, windowMonths),
    enabled: Boolean(token),
  });

  const data = attendantsQuery.data;
  const attendants = data?.attendants ?? [];
  const currentTrendMonth = data?.summary.currentPeriodStart.slice(0, 7) ?? "";
  const selectedItem = scope === "all" ? null : attendants.find((item) => item.attendant === scope) ?? null;
  const portfolioQuery = useQuery({
    queryKey: ["attendant-portfolio", selectedItem?.attendant, windowMonths],
    queryFn: () => api.attendantPortfolio(token!, selectedItem!.attendant, windowMonths),
    enabled: Boolean(token && selectedItem && portfolioOpen),
  });
  const portfolioCustomers = portfolioQuery.data?.customers ?? [];
  const filteredPortfolioCustomers = useMemo(() => {
    const normalizedSearch = portfolioSearch.trim().toLocaleLowerCase("pt-BR");
    return portfolioCustomers.filter((customer) => {
      const matchesStatus = portfolioStatus === "ALL" || customer.status === portfolioStatus;
      const matchesSearch =
        !normalizedSearch ||
        customer.displayName.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        customer.customerCode.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [portfolioCustomers, portfolioSearch, portfolioStatus]);
  const selectedNames = selectedItem ? [selectedItem.attendant] : attendants.map((item) => item.attendant);
  const { data: trendData, series: trendSeries } = useMemo(
    () => buildTrendChartData(attendants, selectedNames, chartMetric),
    [attendants, chartMetric, selectedNames.join("\u0000")],
  );
  const selectedMonthIndex = selectedMonth
    ? trendData.findIndex((row) => row.month === selectedMonth)
    : -1;
  const previousSelectedMonth = selectedMonthIndex > 0
    ? trendData[selectedMonthIndex - 1]?.month ?? null
    : null;

  const teamTotals = useMemo(
    () =>
      attendants.reduce(
        (total, item) => ({
          newCustomers: total.newCustomers + item.currentNewCustomers,
          recoveredCustomers: total.recoveredCustomers + item.currentRecoveredCustomers,
          recoveredRevenue: total.recoveredRevenue + item.currentRecoveredRevenue,
          sentMessages: total.sentMessages + item.currentActivity.sentMessages,
          attendedConversations: total.attendedConversations + item.currentActivity.attendedConversations,
          targetPieces: total.targetPieces + (item.goal.targetPieces ?? 0),
          targetRevenue: total.targetRevenue + (item.goal.targetRevenue ?? 0),
          hasPiecesTarget: total.hasPiecesTarget || item.goal.targetPieces !== null,
          hasRevenueTarget: total.hasRevenueTarget || item.goal.targetRevenue !== null,
        }),
        {
          newCustomers: 0,
          recoveredCustomers: 0,
          recoveredRevenue: 0,
          sentMessages: 0,
          attendedConversations: 0,
          targetPieces: 0,
          targetRevenue: 0,
          hasPiecesTarget: false,
          hasRevenueTarget: false,
        },
      ),
    [attendants],
  );

  const ranking = useMemo(
    () => [...attendants].sort((left, right) => right.currentPeriod.pieces - left.currentPeriod.pieces),
    [attendants],
  );
  const periodRows = useMemo(() => {
    const rows = attendants.map((item) => {
      const point = selectedMonth
        ? item.monthlyTrend.find((entry) => entry.month === selectedMonth) ?? null
        : null;
      const pointIndex = selectedMonth
        ? item.monthlyTrend.findIndex((entry) => entry.month === selectedMonth)
        : -1;
      const previousPoint = pointIndex > 0 ? item.monthlyTrend[pointIndex - 1] ?? null : null;
      return { item, point, previousPoint };
    });
    return rows.sort(
      (left, right) =>
        (selectedMonth ? right.point?.pieces ?? 0 : right.item.currentPeriod.pieces) -
        (selectedMonth ? left.point?.pieces ?? 0 : left.item.currentPeriod.pieces),
    );
  }, [attendants, selectedMonth]);
  const selectedComparisonRows = useMemo(
    () =>
      periodRows.filter(({ item }) =>
        selectedItem ? item.attendant === selectedItem.attendant : true,
      ),
    [periodRows, selectedItem],
  );
  const selectedPeriodRow = selectedItem
    ? periodRows.find((row) => row.item.attendant === selectedItem.attendant) ?? null
    : null;
  const periodRevenueTotal = periodRows.reduce(
    (total, row) => total + (selectedMonth ? row.point?.revenue ?? 0 : row.item.currentPeriod.revenue),
    0,
  );
  const maxPeriodRevenue = Math.max(
    ...periodRows.map((row) => selectedMonth ? row.point?.revenue ?? 0 : row.item.currentPeriod.revenue),
    1,
  );
  const filteredTeamTotals = periodRows.reduce(
    (total, row) => {
      const pieces = selectedMonth ? row.point?.pieces ?? 0 : row.item.currentPeriod.pieces;
      const revenue = selectedMonth ? row.point?.revenue ?? 0 : row.item.currentPeriod.revenue;
      const targetPieces = selectedMonth ? row.point?.targetPieces ?? null : row.item.goal.targetPieces;
      const targetRevenue = selectedMonth ? row.point?.targetRevenue ?? null : row.item.goal.targetRevenue;
      return {
        pieces: total.pieces + pieces,
        revenue: total.revenue + revenue,
        targetPieces: total.targetPieces + (targetPieces ?? 0),
        targetRevenue: total.targetRevenue + (targetRevenue ?? 0),
        hasPiecesTarget: total.hasPiecesTarget || targetPieces !== null,
        hasRevenueTarget: total.hasRevenueTarget || targetRevenue !== null,
      };
    },
    { pieces: 0, revenue: 0, targetPieces: 0, targetRevenue: 0, hasPiecesTarget: false, hasRevenueTarget: false },
  );
  const selectedRank = selectedItem
    ? ranking.findIndex((item) => item.attendant === selectedItem.attendant) + 1
    : 0;
  const selectedColor = selectedItem ? getAttendantColor(selectedItem.attendant) : "#315cc8";
  const openPortfolio = (status: "ALL" | CustomerStatus = "ALL") => {
    setPortfolioStatus(status);
    setPortfolioSearch("");
    setPortfolioOpen(true);
  };
  const selectAttendant = (attendant: string) => {
    setPortfolioOpen(false);
    setChartMetric("pieces");
    setScope(attendant);
  };
  const trendMetricValue = (point: AttendantTrendPoint | null, item: AttendantListItem) => {
    if (!point) {
      if (chartMetric === "pieces") return item.currentPeriod.pieces;
      if (chartMetric === "revenue") return item.currentPeriod.revenue;
      if (chartMetric === "uniqueCustomers") return item.currentPeriod.uniqueCustomers;
      if (chartMetric === "newCustomers") return item.currentNewCustomers;
      if (chartMetric === "recoveredCustomers") return item.currentRecoveredCustomers;
      if (chartMetric === "sentMessages") return item.currentActivity.sentMessages;
      if (chartMetric === "attendedConversations") return item.currentActivity.attendedConversations;
      return item.currentPeriod.orders;
    }
    if (chartMetric === "pieces") return point.pieces;
    if (chartMetric === "revenue") return point.revenue;
    if (chartMetric === "uniqueCustomers") return point.uniqueCustomers;
    if (chartMetric === "newCustomers") return point.newCustomers;
    if (chartMetric === "recoveredCustomers") return point.recoveredCustomers;
    if (chartMetric === "sentMessages") return point.sentMessages;
    if (chartMetric === "attendedConversations") return point.attendedConversations;
    return point.orders;
  };

  if (attendantsQuery.isLoading) {
    return <div className="page-loading">Carregando contribuição das atendentes...</div>;
  }

  if (attendantsQuery.isError || !data) {
    return <div className="page-error">Não foi possível carregar os dados das atendentes.</div>;
  }

  return (
    <div
      className="attendants-workspace"
      style={{ "--attendant-accent": selectedColor } as React.CSSProperties}
    >
      <header className="attendants-topbar">
        <div>
          <span className="attendants-kicker">Performance comercial</span>
          <h1>Atendentes</h1>
          <p>
            {scope === "all"
              ? "Compare a contribuição do time em vendas, clientes e relacionamento."
              : `Acompanhe a evolução completa de ${selectedItem?.attendant ?? "uma atendente"}.`}
          </p>
        </div>
        <div className="attendants-period-control">
          <span>
            Mês atual · {formatDate(data.summary.currentPeriodStart)} a {formatDate(data.summary.currentPeriodEnd)}
          </span>
          <div role="tablist" aria-label="Período do histórico">
            {windowOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={windowMonths === option ? "is-active" : ""}
                onClick={() => {
                  setSelectedMonth(null);
                  setWindowMonths(option);
                }}
              >
                {option}m
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="attendant-switcher" aria-label="Selecionar atendente">
        <button type="button" className={scope === "all" ? "is-active" : ""} onClick={() => {
          setPortfolioOpen(false);
          setScope("all");
        }}>
          <span className="attendant-all-avatar">
            <Users size={19} />
          </span>
          <span>
            <strong>Todas</strong>
            <small>{attendants.length} no WhatsApp</small>
          </span>
          <ChevronRight size={16} />
        </button>
        {attendants.map((item) => (
          <button
            key={item.attendant}
            type="button"
            className={scope === item.attendant ? "is-active" : ""}
            onClick={() => {
              selectAttendant(item.attendant);
            }}
            style={{ "--row-color": getAttendantColor(item.attendant) } as React.CSSProperties}
          >
            <Avatar item={item} />
            <span>
              <strong>{item.attendant}</strong>
              <small>{formatNumber(item.currentPeriod.pieces)} telas no mês</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </nav>

      {!attendants.length ? (
        <section className="attendants-empty">
          <MessageCircleMore size={28} />
          <h2>Nenhuma vendedora vinculada ao WhatsApp</h2>
          <p>
            A aba agora mostra somente instâncias ativas com uma atendente atribuída. Vincule a vendedora à instância
            para que ela apareça aqui.
          </p>
        </section>
      ) : selectedItem ? (
        <>
          <section className="attendant-profile-strip">
            <div className="attendant-profile-person">
              <Avatar item={selectedItem} size="large" />
              <div>
                <span className="attendants-kicker">Visão individual</span>
                <h2>{selectedItem.attendant}</h2>
                <p>
                  <BadgeCheck size={15} />
                  {selectedItem.whatsapp.displayLabel || selectedItem.whatsapp.instanceName || "Instância WhatsApp"}
                  {selectedItem.whatsapp.phoneNumber ? ` · ${selectedItem.whatsapp.phoneNumber}` : ""}
                </p>
              </div>
            </div>
            <div className="attendant-profile-outcome">
              <div>
                <span>Participação nas telas</span>
                <strong>{formatPercent(safeDivide(selectedItem.currentPeriod.pieces, data.summary.currentPeriodPieces))}</strong>
                <small>{formatNumber(selectedItem.currentPeriod.pieces)} de {formatNumber(data.summary.currentPeriodPieces)}</small>
              </div>
              <div>
                <span>Participação na receita</span>
                <strong>{formatPercent(safeDivide(selectedItem.currentPeriod.revenue, data.summary.currentPeriodRevenue))}</strong>
                <small>{formatCurrency(selectedItem.currentPeriod.revenue)}</small>
              </div>
              <div>
                <span>Posição no time</span>
                <strong>#{selectedRank}</strong>
                <small>ranking por telas no mês</small>
              </div>
            </div>
          </section>

          <section className="attendant-metrics-grid attendant-impact-metrics">
            <MetricTile
              label="Receita gerada"
              value={formatCurrency(selectedItem.currentPeriod.revenue)}
              detail={`${formatPercent(safeDivide(selectedItem.currentPeriod.revenue, data.summary.currentPeriodRevenue))} da receita do time`}
              growth={selectedItem.growth.revenue}
              icon={<TrendingUp size={17} />}
            />
            <MetricTile
              label="Telas vendidas"
              value={formatNumber(selectedItem.currentPeriod.pieces)}
              detail={`${formatNumber(selectedItem.currentPeriod.orders)} vendas fechadas`}
              growth={selectedItem.growth.pieces}
              icon={<Sparkles size={17} />}
            />
            <MetricTile
              label="Base compradora"
              value={formatNumber(selectedItem.currentPeriod.uniqueCustomers)}
              detail={`${formatNumber(selectedItem.currentNewCustomers)} novos clientes`}
              growth={selectedItem.growth.uniqueCustomers}
              icon={<Users size={17} />}
            />
            <MetricTile
              label="Receita recuperada"
              value={formatCurrency(selectedItem.currentRecoveredRevenue)}
              detail={`${formatNumber(selectedItem.currentRecoveredCustomers)} clientes reativados`}
              icon={<RotateCcw size={17} />}
            />
          </section>

          <dl className="attendant-efficiency-strip">
            <div>
              <dt>Receita por cliente</dt>
              <dd>{formatCurrency(selectedItem.currentPeriod.revenuePerCustomer)}</dd>
              <small>valor médio da base compradora</small>
            </div>
            <div>
              <dt>Ticket médio</dt>
              <dd>{formatCurrency(selectedItem.currentPeriod.avgTicket)}</dd>
              <small>por venda fechada</small>
            </div>
            <div>
              <dt>Telas por venda</dt>
              <dd>{formatDecimal(selectedItem.currentPeriod.piecesPerOrder, 1)}</dd>
              <small>produtividade comercial</small>
            </div>
            <div>
              <dt>Atendimentos</dt>
              <dd>{formatNumber(selectedItem.currentActivity.attendedConversations)}</dd>
              <small>{formatNumber(selectedItem.currentActivity.sentMessages)} mensagens enviadas</small>
            </div>
          </dl>

        </>
      ) : (
        <section className="attendant-metrics-grid attendants-team-metrics attendant-impact-metrics">
          <MetricTile label="Receita do time" value={formatCurrency(data.summary.currentPeriodRevenue)} detail={`${formatNumber(data.summary.currentPeriodCustomers)} clientes compradores`} growth={data.summary.revenueGrowthRatio} icon={<TrendingUp size={17} />} />
          <MetricTile label="Telas vendidas" value={formatNumber(data.summary.currentPeriodPieces)} detail={`${formatNumber(data.summary.currentPeriodOrders)} vendas no mês`} icon={<Sparkles size={17} />} />
          <MetricTile label="Aquisição" value={formatNumber(teamTotals.newCustomers)} detail="novos clientes no mês" icon={<UserPlus size={17} />} />
          <MetricTile label="Receita recuperada" value={formatCurrency(teamTotals.recoveredRevenue)} detail={`${formatNumber(teamTotals.recoveredCustomers)} clientes reativados`} icon={<RotateCcw size={17} />} />
        </section>
      )}

      {attendants.length ? (
        <>
          <section className="attendant-section attendants-trend-section">
            <div className="attendant-section-heading attendants-chart-heading">
              <div>
                <span className="attendants-kicker">Evolução mensal</span>
                <h3>{selectedItem ? `Resultado mensal de ${selectedItem.attendant}` : "Quem está puxando o resultado"}</h3>
                <p>
                  {selectedItem
                    ? `${windowMonths} meses, incluindo o mês atual parcial. Passe sobre uma barra para comparar ou clique para filtrar o mês.`
                    : `${windowMonths} meses, incluindo o mês atual parcial. Clique em um grupo de barras para filtrar a análise abaixo.`}
                </p>
              </div>
              {selectedItem ? (
                <div className="attendant-metric-tabs attendant-individual-toggles" role="tablist" aria-label="Indicador mensal">
                  {individualMetricOptions.map((metric) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={chartMetric === metric}
                      className={chartMetric === metric ? "is-active" : ""}
                      key={metric}
                      onClick={() => setChartMetric(metric)}
                    >
                      {chartMetricLabel(metric)}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="attendant-metric-select">
                  <span>Indicador analisado</span>
                  <select
                    value={chartMetric}
                    onChange={(event) => setChartMetric(event.target.value as AttendantChartMetric)}
                  >
                    {metricOptions.map((metric) => (
                      <option key={metric} value={metric}>{chartMetricLabel(metric)}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="attendant-trend-chart">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={trendData}
                  margin={{ top: 18, right: 18, left: 4, bottom: 0 }}
                  barGap={selectedItem ? 0 : 3}
                  barCategoryGap={selectedItem ? "34%" : "16%"}
                >
                  <CartesianGrid stroke="rgba(28, 48, 86, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(value) => `${formatMonthLabel(String(value))}${value === currentTrendMonth ? "*" : ""}`}
                    stroke="#77849d"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tickFormatter={(value) => formatMetricAxis(Number(value), chartMetric)} stroke="#77849d" tickLine={false} axisLine={false} width={72} />
                  <Tooltip
                    content={<ChartTooltip metric={chartMetric} data={trendData} currentMonth={currentTrendMonth} />}
                    cursor={{ fill: "rgba(24, 38, 68, 0.035)" }}
                  />
                  {trendSeries.map((series) => (
                    <Bar
                      key={series.dataKey}
                      dataKey={series.dataKey}
                      name={series.attendant}
                      fill={series.color}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={selectedItem ? 54 : 24}
                      className="attendant-clickable-bar"
                      onClick={(entry) => {
                        const clicked = entry as { month?: string; payload?: { month?: string } };
                        const month = clicked.payload?.month ?? clicked.month;
                        if (month) setSelectedMonth((current) => current === month ? null : month);
                      }}
                    >
                      {trendData.map((row) => (
                        <Cell
                          key={`${series.dataKey}-${row.month}`}
                          fill={series.color}
                          fillOpacity={!selectedMonth || row.month === selectedMonth ? 1 : 0.28}
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="attendant-chart-current-note">* mês atual em andamento</p>
            {selectedMonth ? (
              <div className="attendant-month-filter">
                <div className="attendant-month-filter-heading">
                  <div>
                    <span className="attendants-kicker">Mês filtrado</span>
                    <strong>{formatMonthLabel(selectedMonth)}</strong>
                    <small>
                      comparado a{" "}
                      {previousSelectedMonth ? formatMonthLabel(previousSelectedMonth) : "sem base anterior"}
                    </small>
                  </div>
                  <button type="button" onClick={() => setSelectedMonth(null)}>
                    <X size={15} />
                    Limpar filtro
                  </button>
                </div>
                <div className="attendant-month-comparison">
                  {selectedComparisonRows.map(({ item, point, previousPoint }) => {
                    const currentValue = trendMetricValue(point, item);
                    const previousValue = previousPoint ? trendMetricValue(previousPoint, item) : 0;
                    const growth = previousPoint && previousValue > 0
                      ? (currentValue - previousValue) / previousValue
                      : null;
                    return (
                      <div key={item.attendant}>
                        <span><i style={{ background: getAttendantColor(item.attendant) }} />{item.attendant}</span>
                        <strong>{chartMetric === "revenue" ? formatCurrency(currentValue) : formatNumber(currentValue)}</strong>
                        <small>{chartMetricLabel(chartMetric)}</small>
                        <GrowthBadge value={growth} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {!selectedItem ? (
              <div className="attendant-chart-legend">
                {trendSeries.map((series) => (
                  <button type="button" key={series.attendant} onClick={() => selectAttendant(series.attendant)}>
                    <i style={{ background: series.color }} />
                    {series.attendant}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {!selectedItem ? (
            <>
              <section className="attendant-section attendants-ranking-section">
                <div className="attendant-section-heading">
                  <div>
                    <span className="attendants-kicker">
                      {selectedMonth ? `Contribuição em ${formatMonthLabel(selectedMonth)}` : "Contribuição no mês"}
                    </span>
                    <h3>Leitura lado a lado</h3>
                    <p>
                      {selectedMonth
                        ? `Ranking e indicadores filtrados para ${formatMonthLabel(selectedMonth)}.`
                        : "Ranking por telas vendidas com meta, aquisição, recuperação e relacionamento."}
                    </p>
                  </div>
                </div>
                <div className="attendants-ranking-table">
                  <div className="attendants-ranking-row is-header">
                    <span>Atendente</span><span>Telas</span><span>Meta</span><span>Clientes</span><span>Novos</span><span>Recuperados</span><span>Mensagens</span><span />
                  </div>
                  {periodRows.map(({ item, point, previousPoint }, index) => {
                    const pieces = selectedMonth ? point?.pieces ?? 0 : item.currentPeriod.pieces;
                    const customers = selectedMonth ? point?.uniqueCustomers ?? 0 : item.currentPeriod.uniqueCustomers;
                    const newCustomers = selectedMonth ? point?.newCustomers ?? 0 : item.currentNewCustomers;
                    const recoveredCustomers = selectedMonth ? point?.recoveredCustomers ?? 0 : item.currentRecoveredCustomers;
                    const sentMessages = selectedMonth ? point?.sentMessages ?? 0 : item.currentActivity.sentMessages;
                    const targetPieces = selectedMonth ? point?.targetPieces ?? null : item.goal.targetPieces;
                    const piecesGrowth = selectedMonth
                      ? previousPoint && previousPoint.pieces > 0
                        ? (pieces - previousPoint.pieces) / previousPoint.pieces
                        : null
                      : item.growth.pieces;
                    const progress = targetPieces
                      ? pieces / targetPieces
                      : null;
                    return (
                      <button
                        type="button"
                        className="attendants-ranking-row"
                        key={item.attendant}
                        onClick={() => selectAttendant(item.attendant)}
                        style={{ "--row-color": getAttendantColor(item.attendant) } as React.CSSProperties}
                      >
                        <span className="attendants-ranking-person">
                          <b>{index + 1}</b><Avatar item={item} />
                          <span><strong>{item.attendant}</strong><small>{item.whatsapp.displayLabel || item.whatsapp.instanceName}</small></span>
                        </span>
                        <span><strong>{formatNumber(pieces)}</strong><GrowthBadge value={piecesGrowth} /></span>
                        <span className="attendants-ranking-goal">
                          <strong>{progress === null ? "Sem meta" : formatPercent(progress)}</strong>
                          <i><b style={{ width: `${Math.min(100, (progress ?? 0) * 100)}%` }} /></i>
                        </span>
                        <span><strong>{formatNumber(customers)}</strong><small>compradores</small></span>
                        <span><strong>{formatNumber(newCustomers)}</strong><small>adquiridos</small></span>
                        <span><strong>{formatNumber(recoveredCustomers)}</strong><small>reativados</small></span>
                        <span><strong>{formatNumber(sentMessages)}</strong><small>enviadas</small></span>
                        <span><ChevronRight size={18} /></span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="attendants-split attendants-team-bottom">
                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div>
                      <span className="attendants-kicker">Meta consolidada</span>
                      <h3>{selectedMonth ? `${formatMonthLabel(selectedMonth)} versus objetivo` : "Time versus objetivo"}</h3>
                    </div>
                    <Target size={22} />
                  </div>
                  <GoalProgress label="Telas" current={filteredTeamTotals.pieces} target={filteredTeamTotals.hasPiecesTarget ? filteredTeamTotals.targetPieces : null} formatter={formatNumber} />
                  <GoalProgress label="Faturamento" current={filteredTeamTotals.revenue} target={filteredTeamTotals.hasRevenueTarget ? filteredTeamTotals.targetRevenue : null} formatter={formatCurrency} />
                </article>
                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div>
                      <span className="attendants-kicker">Participação na receita</span>
                      <h3>Quanto cada vendedora entrega</h3>
                      <p>
                        Receita individual e participação no resultado de{" "}
                        {selectedMonth ? formatMonthLabel(selectedMonth) : "mês atual"}.
                      </p>
                    </div>
                  </div>
                  <div className="attendant-revenue-share">
                    {periodRows.map(({ item, point }) => {
                      const revenue = selectedMonth ? point?.revenue ?? 0 : item.currentPeriod.revenue;
                      return (
                      <button type="button" key={item.attendant} onClick={() => selectAttendant(item.attendant)}>
                        <span><i style={{ background: getAttendantColor(item.attendant) }} />{item.attendant}</span>
                        <strong>{formatCurrency(revenue)}</strong>
                        <small>{formatPercent(safeDivide(revenue, periodRevenueTotal))}</small>
                        <b>
                          <i
                            style={{
                              width: `${safeDivide(revenue, maxPeriodRevenue) * 100}%`,
                              background: getAttendantColor(item.attendant),
                            }}
                          />
                        </b>
                      </button>
                    )})}
                  </div>
                </article>
              </section>
            </>
          ) : (
            <>
              <section className="attendants-split attendants-goal-and-portfolio">
                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div>
                      <span className="attendants-kicker">Meta do mês</span>
                      <h3>
                        {selectedMonth ? `${formatMonthLabel(selectedMonth)} versus objetivo` : "Ritmo para alcançar o alvo"}
                      </h3>
                    </div>
                    <Target size={22} />
                  </div>
                  <GoalProgress
                    label="Telas"
                    current={selectedMonth ? selectedPeriodRow?.point?.pieces ?? 0 : selectedItem.currentPeriod.pieces}
                    target={selectedMonth ? selectedPeriodRow?.point?.targetPieces ?? null : selectedItem.goal.targetPieces}
                    formatter={formatNumber}
                  />
                  <GoalProgress
                    label="Faturamento"
                    current={selectedMonth ? selectedPeriodRow?.point?.revenue ?? 0 : selectedItem.currentPeriod.revenue}
                    target={selectedMonth ? selectedPeriodRow?.point?.targetRevenue ?? null : selectedItem.goal.targetRevenue}
                    formatter={formatCurrency}
                  />
                </article>

                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div>
                      <span className="attendants-kicker">Carteira atual</span>
                      <h3>{formatNumber(selectedItem.portfolio.totalCustomers)} clientes sob responsabilidade</h3>
                    </div>
                    <button type="button" className="attendant-portfolio-open" onClick={() => openPortfolio("ALL")}>
                      Ver carteira completa
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="attendant-portfolio-bar">
                    {(["ACTIVE", "ATTENTION", "INACTIVE"] as const).map((status) => (
                      <i
                        key={status}
                        className={`is-${status.toLocaleLowerCase()}`}
                        style={{
                          width: `${safeDivide(
                            selectedItem.portfolio.statusCounts[status],
                            selectedItem.portfolio.totalCustomers,
                          ) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="attendant-portfolio-legend">
                    <button type="button" onClick={() => openPortfolio("ACTIVE")}><i className="is-active" />Ativos <strong>{formatNumber(selectedItem.portfolio.statusCounts.ACTIVE)}</strong></button>
                    <button type="button" onClick={() => openPortfolio("ATTENTION")}><i className="is-attention" />Atenção <strong>{formatNumber(selectedItem.portfolio.statusCounts.ATTENTION)}</strong></button>
                    <button type="button" onClick={() => openPortfolio("INACTIVE")}><i className="is-inactive" />Inativos <strong>{formatNumber(selectedItem.portfolio.statusCounts.INACTIVE)}</strong></button>
                  </div>
                  <p className="attendant-section-note">
                    {formatNumber(selectedItem.portfolio.statusCounts.ATTENTION + selectedItem.portfolio.statusCounts.INACTIVE)} clientes têm oportunidade de reativação.
                  </p>
                </article>
              </section>

              <section className="attendants-split attendants-communication">
                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div>
                      <span className="attendants-kicker">Atividade no WhatsApp</span>
                      <h3>Quando {selectedItem.attendant} mais conversa</h3>
                      <p>Mensagens enviadas e recebidas, agrupadas por dia da semana e hora.</p>
                    </div>
                  </div>
                  <ActivityHeatmap item={selectedItem} />
                </article>
                <article className="attendant-section attendant-relationship-summary">
                  <div className="attendant-section-heading">
                    <div><span className="attendants-kicker">Ritmo de atendimento</span><h3>Relacionamento no mês</h3></div>
                  </div>
                  <dl>
                    <div><dt>Mensagens enviadas</dt><dd>{formatNumber(selectedItem.currentActivity.sentMessages)}</dd></div>
                    <div><dt>Mensagens recebidas</dt><dd>{formatNumber(selectedItem.currentActivity.receivedMessages)}</dd></div>
                    <div><dt>Conversas atendidas</dt><dd>{formatNumber(selectedItem.currentActivity.attendedConversations)}</dd></div>
                    <div><dt>Dias com atividade</dt><dd>{formatNumber(selectedItem.currentActivity.activeDays)}</dd></div>
                    <div><dt>Primeira resposta média</dt><dd>{formatResponseTime(selectedItem.currentActivity.averageFirstResponseSeconds)}</dd></div>
                  </dl>
                </article>
              </section>

              <section className="attendants-split attendants-commercial-detail">
                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div><span className="attendants-kicker">Top clientes</span><h3>Quem mais comprou no mês</h3></div>
                  </div>
                  <div className="attendant-detail-list">
                    {selectedItem.topCustomers.length ? selectedItem.topCustomers.map((customer, index) => (
                      <Link to={`/clientes/${customer.customerId}`} key={customer.customerId}>
                        <b>{index + 1}</b>
                        <span><strong>{customer.displayName}</strong><small>{customer.customerCode || "Sem código"} · {statusLabel(customer.status)}</small></span>
                        <span><strong>{formatCurrency(customer.revenue)}</strong><small>{formatNumber(customer.pieces)} telas</small></span>
                        <ChevronRight size={17} />
                      </Link>
                    )) : <div className="attendant-list-empty">Nenhum cliente comprador neste corte.</div>}
                  </div>
                </article>
                <article className="attendant-section">
                  <div className="attendant-section-heading">
                    <div>
                      <span className="attendants-kicker">Leitura da carteira</span>
                      <h3>Onde está o próximo resultado</h3>
                      <p>Base ativa, aquisição e clientes que ainda podem voltar a comprar.</p>
                    </div>
                  </div>
                  <dl className="attendant-opportunity-list">
                    <div>
                      <dt>Carteira ativa</dt>
                      <dd>{formatPercent(safeDivide(selectedItem.portfolio.statusCounts.ACTIVE, selectedItem.portfolio.totalCustomers))}</dd>
                      <small>{formatNumber(selectedItem.portfolio.statusCounts.ACTIVE)} clientes ativos</small>
                    </div>
                    <div>
                      <dt>Potencial de reativação</dt>
                      <dd>{formatNumber(selectedItem.portfolio.statusCounts.ATTENTION + selectedItem.portfolio.statusCounts.INACTIVE)}</dd>
                      <small>clientes em atenção ou inativos</small>
                    </div>
                    <div>
                      <dt>Novos clientes</dt>
                      <dd>{formatNumber(selectedItem.currentNewCustomers)}</dd>
                      <small>primeira compra no mês</small>
                    </div>
                    <div>
                      <dt>Recuperação realizada</dt>
                      <dd>{formatCurrency(selectedItem.currentRecoveredRevenue)}</dd>
                      <small>{formatNumber(selectedItem.currentRecoveredCustomers)} clientes voltaram</small>
                    </div>
                  </dl>
                </article>
              </section>
            </>
          )}
        </>
      ) : null}

      {portfolioOpen && selectedItem ? (
        <div className="attendant-portfolio-overlay" role="dialog" aria-modal="true" aria-label={`Carteira de ${selectedItem.attendant}`}>
          <section className="attendant-portfolio-panel">
            <header className="attendant-portfolio-panel-header">
              <div>
                <span className="attendants-kicker">Carteira atribuída</span>
                <h2>Clientes de {selectedItem.attendant}</h2>
                <p>
                  Situação atual da carteira e compras entre{" "}
                  {portfolioQuery.data ? formatDate(portfolioQuery.data.periodStart) : "—"} e{" "}
                  {portfolioQuery.data ? formatDate(portfolioQuery.data.periodEnd) : "—"}.
                </p>
              </div>
              <button type="button" aria-label="Fechar carteira" onClick={() => setPortfolioOpen(false)}>
                <X size={22} />
              </button>
            </header>

            <div className="attendant-portfolio-toolbar">
              <div className="attendant-portfolio-status-tabs" role="tablist" aria-label="Situação dos clientes">
                {portfolioStatuses.map((status) => {
                  const count =
                    status === "ALL"
                      ? portfolioCustomers.length || selectedItem.portfolio.totalCustomers
                      : portfolioCustomers.filter((customer) => customer.status === status).length ||
                        selectedItem.portfolio.statusCounts[status];
                  return (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={portfolioStatus === status}
                      className={portfolioStatus === status ? "is-active" : ""}
                      key={status}
                      onClick={() => setPortfolioStatus(status)}
                    >
                      {status === "ALL" ? "Todos" : statusLabel(status)}
                      <strong>{formatNumber(count)}</strong>
                    </button>
                  );
                })}
              </div>
              <label className="attendant-portfolio-search">
                <Search size={17} />
                <input
                  value={portfolioSearch}
                  onChange={(event) => setPortfolioSearch(event.target.value)}
                  placeholder="Buscar cliente ou código"
                />
              </label>
            </div>

            <div className="attendant-portfolio-table-wrap">
              {portfolioQuery.isLoading ? (
                <div className="attendant-portfolio-state">Carregando a carteira real de {selectedItem.attendant}...</div>
              ) : portfolioQuery.isError ? (
                <div className="attendant-portfolio-state is-error">Não foi possível carregar esta carteira.</div>
              ) : filteredPortfolioCustomers.length ? (
                <table className="attendant-portfolio-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Situação</th>
                      <th>Telas no período</th>
                      <th>Pedidos</th>
                      <th>Faturamento</th>
                      <th>Última compra</th>
                      <th>Sem comprar</th>
                      <th>Histórico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPortfolioCustomers.map((customer) => (
                      <tr key={customer.customerId}>
                        <td>
                          <Link to={`/clientes/${customer.customerId}`} onClick={() => setPortfolioOpen(false)}>
                            <strong>{customer.displayName}</strong>
                            <small>{customer.customerCode || "Sem código"}</small>
                          </Link>
                        </td>
                        <td>
                          <span className={`attendant-customer-status is-${customer.status.toLocaleLowerCase()}`}>
                            {statusLabel(customer.status)}
                          </span>
                        </td>
                        <td><strong>{formatNumber(customer.periodPieces)}</strong></td>
                        <td>{formatNumber(customer.periodOrders)}</td>
                        <td>{formatCurrency(customer.periodRevenue)}</td>
                        <td>{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "Sem compra"}</td>
                        <td>{customer.daysSinceLastPurchase === null ? "—" : `${formatNumber(customer.daysSinceLastPurchase)} dias`}</td>
                        <td><strong>{formatNumber(customer.totalOrders)} pedidos</strong><small>{formatCurrency(customer.totalSpent)}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="attendant-portfolio-state">Nenhum cliente encontrado neste filtro.</div>
              )}
            </div>
            <footer className="attendant-portfolio-footer">
              <strong>{formatNumber(filteredPortfolioCustomers.length)} clientes exibidos</strong>
              <span>
                {formatNumber(filteredPortfolioCustomers.reduce((total, customer) => total + customer.periodPieces, 0))} telas ·{" "}
                {formatCurrency(filteredPortfolioCustomers.reduce((total, customer) => total + customer.periodRevenue, 0))}
              </span>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import type { AgendaItem, PortfolioTrendPoint } from "@olist-crm/shared";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { PeriodSelector } from "../components/PeriodSelector";
import { SalesPerformancePanel } from "../components/SalesPerformancePanel";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatNumber, formatShortDate } from "../lib/format";

type TrendPeriod = '90d' | '6m' | '1y' | 'max';

interface PeriodOption {
  value: TrendPeriod;
  label: string;
  days: number;
}

const periodOptions: PeriodOption[] = [
  { value: '90d', label: '90 dias', days: 90 },
  { value: '6m', label: '6 meses', days: 180 },
  { value: '1y', label: '1 ano', days: 365 },
  { value: 'max', label: 'Período Máximo', days: 730 },
];

const bucketFilters = {
  "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
  "15-30": { minDaysInactive: 15, maxDaysInactive: 30 },
  "31-59": { minDaysInactive: 31, maxDaysInactive: 59 },
  "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
  "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
  "180+": { minDaysInactive: 180 },
} as const;

type BucketLabel = keyof typeof bucketFilters;
type ChartView = "inactivity" | "trend" | "screensSold";

const trendSeries = [
  {
    shareKey: "activeShare",
    countKey: "activeCount",
    label: "Ativos",
    emoji: "🟢",
    color: "#2f9d67",
    gradientId: "trend-active-fill",
    fillOpacityStart: 0.14,
    fillOpacityEnd: 0.03,
  },
  {
    shareKey: "attentionShare",
    countKey: "attentionCount",
    label: "Atencao",
    emoji: "🟡",
    color: "#d09a29",
    gradientId: "trend-attention-fill",
    fillOpacityStart: 0.12,
    fillOpacityEnd: 0.025,
  },
  {
    shareKey: "inactiveShare",
    countKey: "inactiveCount",
    label: "Inativos",
    emoji: "🔴",
    color: "#d9534f",
    gradientId: "trend-inactive-fill",
    fillOpacityStart: 0.045,
    fillOpacityEnd: 0.008,
  },
] as const;

type TrendShareKey = (typeof trendSeries)[number]["shareKey"];
type TrendCompositionPoint = PortfolioTrendPoint & Record<TrendShareKey, number>;

const chartViewCopy = {
  inactivity: {
    eyebrow: "Faixas de inatividade",
    title: "Onde esta o risco de parada",
    description:
      "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.",
    toggleLabel: "Risco de parada",
    toggleHelper: "Veja as faixas de dias sem compra e filtre a lista.",
  },
  trend: {
    eyebrow: "Composicao da carteira",
    title: "Composicao diaria da base",
    description:
      "Cada dia soma 100% da carteira para mostrar, em percentual, se a base esta ganhando ativos ou acumulando inativos.",
    toggleLabel: "Evolucao da base",
    toggleHelper: "Compare a participacao diaria de ativos, atencao e inativos.",
  },
  screensSold: {
    eyebrow: "Desempenho de vendas",
    title: "Quantidade de itens (telas) vendidas",
    description:
      "Acompanhe o volume mensal de itens vendidos. As linhas comparam o desempenho do ano atual com os anos anteriores.",
    toggleLabel: "Telas vendidas",
    toggleHelper: "Compare o volume mensal (2024 a 2026).",
  },
} as const;

function extractTrendParts(value: string) {
  const dailyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dailyMatch) {
    return null;
  }

  return {
    year: dailyMatch[1],
    month: Number(dailyMatch[2]),
    day: Number(dailyMatch[3]),
  };
}

function formatTrendAxisLabel(value: string) {
  const parts = extractTrendParts(value);
  if (!parts) {
    return "--";
  }

  const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));

  return `${String(parts.day ?? 0).padStart(2, "0")}/${String(safeMonth).padStart(2, "0")}`;
}

function formatTrendTooltipLabel(value: string) {
  const parts = extractTrendParts(value);
  if (!parts) {
    return "--";
  }

  return formatDate(value);
}

function formatDecimal(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatTrendPercent(value: number, fractionDigits = 1) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return `${formatDecimal(safeValue, fractionDigits)}%`;
}

function normalizeTrendPoint(point: PortfolioTrendPoint): TrendCompositionPoint {
  const totalFromStatuses = point.activeCount + point.attentionCount + point.inactiveCount;
  const total = totalFromStatuses || point.totalCustomers;

  if (!total) {
    return {
      ...point,
      activeShare: 0,
      attentionShare: 0,
      inactiveShare: 0,
    };
  }

  return {
    ...point,
    activeShare: (point.activeCount / total) * 100,
    attentionShare: (point.attentionCount / total) * 100,
    inactiveShare: (point.inactiveCount / total) * 100,
  };
}

function bucketColor(label: string, selected: boolean) {
  if (selected) {
    return "#5f8cff";
  }

  if (label === "0-14" || label === "15-30") {
    return "#a8c1ff";
  }

  if (label === "31-59" || label === "60-89") {
    return "#5f8cff";
  }

  return "#2956d7";
}

function getAgendaPreviewItems(items: AgendaItem[] | undefined) {
  return (items ?? []).slice(0, 6);
}

function bucketTooltipNote(label: string) {
  if (label === "0-14") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "15-30") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "31-59") {
    return "Todos nesta faixa ja estao em Atencao.";
  }

  if (label === "60-89") {
    return "Todos nesta faixa ja estao em Atencao.";
  }

  return "Todos nesta faixa ja estao Inativos.";
}

function InactivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{label} dias sem compra</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span>clientes nessa faixa</span>
      </div>
      <p>{bucketTooltipNote(label)}</p>
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; dataKey?: string; value?: number; payload?: TrendCompositionPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const point = payload[0]?.payload;

  return (
    <div className="chart-tooltip trend-tooltip">
      <strong>{formatTrendTooltipLabel(label)}</strong>
      {point ? (
        <div className="chart-tooltip-count">
          <strong>{formatNumber(point.totalCustomers)}</strong>
          <span>clientes na base nesse dia</span>
        </div>
      ) : null}
      <div className="trend-tooltip-list">
        {trendSeries.map((line) => {
          const entry = payload.find((payloadItem) => payloadItem.dataKey === line.shareKey);
          return (
            <div key={line.shareKey} className="trend-tooltip-item">
              <span className="trend-tooltip-label">
                <span className="trend-tooltip-emoji" style={{ fontSize: "1.1rem", marginRight: "0.25rem" }}>{line.emoji}</span>
                {line.label}
              </span>
              <div className="trend-tooltip-metric">
                <strong>{formatTrendPercent(entry?.value ?? 0)}</strong>
                <span>{formatNumber(point?.[line.countKey] ?? 0)} clientes</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatShare(value: number, total: number) {
  if (!total) {
    return "0% da base";
  }

  return `${((value / total) * 100).toFixed(1).replace(".", ",")}% da base`;
}

export function DashboardPage() {
  const { token } = useAuth();
  const [selectedBucket, setSelectedBucket] = useState<BucketLabel | null>(null);
  const [chartView, setChartView] = useState<ChartView>("inactivity");
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>(() => {
    const stored = sessionStorage.getItem('dashboard-trend-period');
    return (stored === '90d' || stored === '6m' || stored === '1y') ? stored : '90d';
  });

  useEffect(() => {
    sessionStorage.setItem('dashboard-trend-period', selectedPeriod);
  }, [selectedPeriod]);

  const trendDays = periodOptions.find(opt => opt.value === selectedPeriod)?.days ?? 90;

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", trendDays],
    queryFn: () => api.dashboard(token!, trendDays),
    enabled: Boolean(token),
  });

  const agendaQuery = useQuery({
    queryKey: ["dashboard-agenda-preview"],
    queryFn: () => api.agenda(token!, 6, 0),
    enabled: Boolean(token),
  });

  const filteredCustomersQuery = useQuery({
    queryKey: ["dashboard-bucket-customers", selectedBucket],
    queryFn: () =>
      api.customers(token!, {
        ...(selectedBucket ? bucketFilters[selectedBucket] : {}),
        sortBy: "priority",
        limit: 120,
      }),
    enabled: Boolean(token && selectedBucket),
  });

  const priorityCustomersQuery = useQuery({
    queryKey: ["dashboard-priority-customers"],
    queryFn: () =>
      api.customers(token!, {
        sortBy: "priority",
        limit: 120,
      }),
    enabled: Boolean(token && !selectedBucket),
  });

  if (dashboardQuery.isLoading) {
    return <div className="page-loading">Carregando dashboard...</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <div className="page-error">Nao foi possivel carregar o dashboard.</div>;
  }

  const metrics = dashboardQuery.data;
  const activeChartCopy = chartViewCopy[chartView];
  const trendData = metrics.portfolioTrend.map(normalizeTrendPoint);
  const latestTrendPoint = trendData[trendData.length - 1];
  const chartDescription = activeChartCopy.description;
  const agendaItems = getAgendaPreviewItems(agendaQuery.data?.items);
  const tableCustomers = selectedBucket ? (filteredCustomersQuery.data ?? []) : (priorityCustomersQuery.data ?? []);
  const tableQueryLoading = selectedBucket ? filteredCustomersQuery.isLoading : priorityCustomersQuery.isLoading;
  const tableQueryError = selectedBucket ? filteredCustomersQuery.isError : priorityCustomersQuery.isError;

  const currentYear = new Date().getFullYear();
  const chartYears = [currentYear - 2, currentYear - 1, currentYear];

  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const itemsSoldData = monthNames.map((monthName, idx) => {
    const monthNum = idx + 1;
    const point: any = { month: monthName };
    chartYears.forEach(year => {
      const dataForYearAndMonth = metrics.itemsSoldTrend?.find(m => m.year === year && m.month === monthNum);
      if (dataForYearAndMonth) {
        point[`year${year}`] = dataForYearAndMonth.totalItems;
        if (year === currentYear && dataForYearAndMonth.targetAmount) {
          point.meta = dataForYearAndMonth.targetAmount;
        }
      }
    });
    return point;
  });

  async function handleSync() {
    try {
      setIsSyncing(true);
      await api.syncData(token!, "direct");
      window.location.reload();
    } catch (err) {
      alert("Falha na sincronizacao: " + String(err));
    } finally {
      setIsSyncing(false);
    }
  }

  function handleChangeChartView(nextView: ChartView) {
    setChartView(nextView);
    if (nextView === "trend") {
      setSelectedBucket(null);
    }
  }

  async function handleSetTarget() {
    const userInput = window.prompt("Meta de telas (mensal):", String(metrics.currentMonthTarget || ""));
    if (userInput === null) return;
    
    const val = parseInt(userInput.replace(/\D/g, ''), 10);
    if (isNaN(val)) {
      alert("Valor invalido");
      return;
    }

    try {
      const d = new Date();
      await api.saveMonthlyTarget(token!, d.getFullYear(), d.getMonth() + 1, val);
      dashboardQuery.refetch();
    } catch (err) {
      alert("Erro ao salvar: " + String(err));
    }
  }

  const targetAmount = metrics.currentMonthTarget ?? 0;
  const itemsSold = metrics.currentMonthItemsSold;
  const targetPercent = targetAmount > 0 ? Math.round((itemsSold / targetAmount) * 100) : 0;
  const isTargetHit = targetAmount > 0 && itemsSold >= targetAmount;
  const targetRemaining = Math.max(0, targetAmount - itemsSold);
  const targetExceededBy = Math.max(0, itemsSold - targetAmount);
  const targetProgress = Math.min(100, targetPercent);
  const progressRadius = 28;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const monthlyGoalCardClassName = [
    "stat-card",
    "monthly-goal-card",
    isTargetHit ? "is-complete" : "",
    targetAmount === 0 ? "is-empty" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const monthlyGoalHighlight =
    targetAmount === 0
      ? "Sem meta"
      : isTargetHit
      ? targetExceededBy > 0
        ? `+${formatNumber(targetExceededBy)} acima`
        : "Meta batida"
      : `${targetPercent}% do alvo`;
  const monthlyGoalStatus =
    targetAmount === 0
      ? "Defina sua meta no menu Metas para acompanhar o ritmo do mes."
      : isTargetHit
      ? targetExceededBy > 0
        ? `Voce ja passou ${formatNumber(targetExceededBy)} telas do alvo.`
        : "Objetivo concluido neste mes."
      : `Faltam ${formatNumber(targetRemaining)} para a meta`;
  const monthlyGoalMetaLabel = targetAmount > 0 ? `Alvo ${formatNumber(targetAmount)}` : "Meta pendente";

  return (
    <div className="page-stack">
      <section className="dashboard-hero-premium">
        <div className="hero-premium-bg">
          <div className="hero-premium-gradient"></div>
        </div>
        <div className="hero-premium-content">
          <div className="hero-premium-copy">
            <div className="premium-badge">Operacao comercial</div>
            <h2 className="premium-title">Prioridades de contato e saude da carteira</h2>
            <p className="premium-subtitle">Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada.</p>
            <div className="premium-actions">
              <Link className="premium-button primary" to="/agenda">
                Abrir agenda do dia
              </Link>
              <button className="premium-button ghost" type="button" disabled={isSyncing} onClick={handleSync}>
                {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
              </button>
            </div>
          </div>

          <div className="hero-premium-stats">
            <div className="premium-stat-card">
              <div className="premium-stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="premium-stat-info">
                <span>Ultima sincronizacao</span>
                <strong>
                  {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString("pt-BR") : "Pendente..."}
                </strong>
              </div>
            </div>
            
            <div className="premium-stat-card interactive" onClick={handleSetTarget} title="Clique para editar a meta">
              <div className={`premium-stat-icon ${isTargetHit ? 'accent-success' : 'accent-blue'}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="premium-stat-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Meta do mes</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <strong>{formatNumber(itemsSold)} / {targetAmount > 0 ? formatNumber(targetAmount) : 'Definir'}</strong>
                  {targetAmount > 0 && (
                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                      <div style={{ width: `${Math.min(100, targetPercent)}%`, height: '100%', background: isTargetHit ? '#10b981' : '#3b82f6', transition: 'width 0.3s ease' }}></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="premium-stat-card">
              <div className="premium-stat-icon accent-purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="premium-stat-info">
                <span>Tempo medio de compra</span>
                <strong>{metrics.averageFrequencyDays.toFixed(1)} <small>dias</small></strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard title="Total de clientes" value={formatNumber(metrics.totalCustomers)} helper="Base comercial consolidada" />
        <StatCard
          title="Clientes ativos"
          value={formatNumber(metrics.statusCounts.ACTIVE)}
          badge={formatShare(metrics.statusCounts.ACTIVE, metrics.totalCustomers)}
          helper="Clientes dentro da zona ativa"
          tone="success"
        />
        <StatCard
          title="Clientes em atencao"
          value={formatNumber(metrics.statusCounts.ATTENTION)}
          badge={formatShare(metrics.statusCounts.ATTENTION, metrics.totalCustomers)}
          helper="Clientes pedindo monitoramento"
          tone="warning"
        />
        <StatCard
          title="Clientes inativos"
          value={formatNumber(metrics.statusCounts.INACTIVE)}
          badge={formatShare(metrics.statusCounts.INACTIVE, metrics.totalCustomers)}
          helper="Clientes fora da zona ativa"
          tone="danger"
        />
        <article className={monthlyGoalCardClassName}>
          <div className="monthly-goal-card__header">
            <div className="monthly-goal-card__copy">
              <p className="monthly-goal-card__eyebrow">Meta mensal</p>
              <strong className="monthly-goal-card__value">
                {targetAmount > 0 ? `${formatNumber(itemsSold)} telas` : "Sem meta"}
              </strong>
              <div className="monthly-goal-card__meta-row">
                <span className="monthly-goal-card__pill">
                  <span className="monthly-goal-card__pill-dot" />
                  {monthlyGoalMetaLabel}
                </span>
                <span className="monthly-goal-card__highlight">{monthlyGoalHighlight}</span>
              </div>
            </div>

            <div className="monthly-goal-card__progress" aria-hidden="true">
              <svg
                className="monthly-goal-card__progress-ring"
                width="72"
                height="72"
                viewBox="0 0 72 72"
              >
                <circle
                  cx="36"
                  cy="36"
                  r={progressRadius}
                  className="monthly-goal-card__progress-track"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={progressRadius}
                  className="monthly-goal-card__progress-fill"
                  strokeDasharray={progressCircumference}
                  strokeDashoffset={progressCircumference - (targetProgress / 100) * progressCircumference}
                />
              </svg>
              <div className="monthly-goal-card__progress-core" />
              <div className="monthly-goal-card__progress-label">
                <strong>{targetAmount > 0 ? `${targetPercent}%` : "--"}</strong>
                <span>meta</span>
              </div>
            </div>
          </div>

          <span
            className={[
              "monthly-goal-card__status",
              isTargetHit ? "is-complete" : "",
              targetAmount === 0 ? "is-empty" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {monthlyGoalStatus}
          </span>
        </article>
      </section>

      <section className="grid-two dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{activeChartCopy.eyebrow}</p>
              {chartView === "inactivity" ? (
                <h3 className="header-with-info">
                  {activeChartCopy.title}
                  <InfoHint text="As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias." />
                </h3>
              ) : (
                <h3>{activeChartCopy.title}</h3>
              )}
            </div>
          </div>
          <p className="panel-subcopy">{chartDescription}</p>
          <div className="chart-switcher" role="tablist" aria-label="Alternar visualizacao dos graficos do dashboard">
            {(Object.entries(chartViewCopy) as Array<[ChartView, (typeof chartViewCopy)[ChartView]]>).map(([view, copy]) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={chartView === view}
                aria-pressed={chartView === view}
                className={`chart-switch-button ${chartView === view ? "active" : ""}`}
                onClick={() => handleChangeChartView(view)}
              >
                <strong>{copy.toggleLabel}</strong>
                <span>{copy.toggleHelper}</span>
              </button>
            ))}
          </div>

          {chartView === "inactivity" ? (
            <>
              <div className="status-guide-grid">
                <div className="status-guide-card is-active">
                  <strong>Ativo</strong>
                  <span>Ate 30 dias sem comprar</span>
                </div>
                <div className="status-guide-card is-attention">
                  <strong>Atencao</strong>
                  <span>De 31 a 89 dias sem comprar</span>
                </div>
                <div className="status-guide-card is-inactive">
                  <strong>Inativo</strong>
                  <span>90 dias ou mais sem comprar</span>
                </div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={metrics.inactivityBuckets}
                    onClick={(state) => {
                      const label = (state as { activeLabel?: string } | undefined)?.activeLabel;
                      if (!label || !(label in bucketFilters)) {
                        return;
                      }
                      setSelectedBucket((current) => (current === label ? null : (label as BucketLabel)));
                    }}
                    margin={{ top: 32, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis dataKey="label" stroke="#5f6f95" />
                    <Tooltip content={<InactivityTooltip />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor="pointer">
                      <LabelList
                        dataKey="count"
                        position="top"
                        offset={10}
                        formatter={(value: number) => formatNumber(value)}
                        className="chart-bar-label"
                      />
                      {metrics.inactivityBuckets.map((bucket) => (
                        <Cell key={bucket.label} fill={bucketColor(bucket.label, selectedBucket === bucket.label)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {selectedBucket ? (
                <div className="inline-actions">
                  <span className="tag">Filtro ativo: {selectedBucket}</span>
                  <button className="ghost-button" type="button" onClick={() => setSelectedBucket(null)}>
                    Limpar filtro
                  </button>
                </div>
              ) : null}
            </>
          ) : chartView === "trend" ? (
            <>
              <PeriodSelector value={selectedPeriod} onChange={setSelectedPeriod} />
              <div className="trend-chart-wrap">
                {trendData.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={trendData} margin={{ top: 12, right: 18, left: 10, bottom: 4 }}>
                      <defs>
                        {trendSeries.map((series) => (
                          <linearGradient key={series.gradientId} id={series.gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={series.color} stopOpacity={series.fillOpacityStart} />
                            <stop offset="100%" stopColor={series.color} stopOpacity={series.fillOpacityEnd} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatTrendAxisLabel(String(value))}
                        stroke="#5f6f95"
                        minTickGap={24}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tickFormatter={(value) => formatTrendPercent(Number(value), 0)}
                        stroke="#5f6f95"
                        tickLine={false}
                        axisLine={false}
                        width={56}
                      />
                      <Tooltip content={<TrendTooltip />} cursor={{ stroke: "rgba(41, 86, 215, 0.3)", strokeWidth: 1 }} />
                      {trendSeries.map((series) => (
                        <Area
                          key={series.shareKey}
                          type="monotone"
                          dataKey={series.shareKey}
                          stackId="portfolio-share"
                          stroke="none"
                          fill={`url(#${series.gradientId})`}
                          dot={false}
                          legendType="none"
                        />
                      ))}
                      {trendSeries.map((series) => (
                        <Line
                          key={`${series.shareKey}-line`}
                          type="monotone"
                          dataKey={series.shareKey}
                          name={series.label}
                          stroke={series.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: series.color, strokeWidth: 0 }}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">Sem historico suficiente para montar a evolucao diaria da base.</div>
                )}
              </div>
              <div className="trend-legend" aria-label="Legenda do grafico de evolucao da base">
                {trendSeries.map((series) => (
                  <span key={series.shareKey} className="trend-legend-item">
                    <span className="trend-legend-emoji" style={{ fontSize: "1.1rem", marginRight: "0.2rem" }}>{series.emoji}</span>
                    {series.label}
                  </span>
                ))}
              </div>
            </>
          ) : chartView === "screensSold" ? (
            <>
              <div className="trend-chart-wrap" style={{ marginTop: "1rem" }}>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={itemsSoldData} margin={{ top: 12, right: 18, left: 10, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                    <XAxis dataKey="month" stroke="#5f6f95" tickLine={false} axisLine={false} />
                    <YAxis stroke="#5f6f95" tickLine={false} axisLine={false} width={65} tickFormatter={(val) => new Intl.NumberFormat("pt-BR").format(val)} />
                    <Tooltip
                      cursor={{ stroke: "rgba(41, 86, 215, 0.3)", strokeWidth: 1 }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        return (
                          <div className="chart-tooltip">
                            <strong>{label}</strong>
                            <div style={{ marginTop: "0.5rem" }}>
                              {payload.map((entry: any) => (
                                <div key={entry.name} style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", marginBottom: "0.25rem" }}>
                                  <span style={{ color: entry.color, fontWeight: 500 }}>{entry.name}</span>
                                  <strong>{formatNumber(entry.value)} telas</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey={`year${chartYears[0]}`} name={String(chartYears[0])} stroke="#a8c1ff" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey={`year${chartYears[1]}`} name={String(chartYears[1])} stroke="#5f8cff" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey={`year${chartYears[2]}`} name={String(chartYears[2])} stroke="#2956d7" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="meta" name="Meta (Atual)" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="trend-legend" aria-label="Legenda do grafico de telas vendidas">
                <span className="trend-legend-item">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#a8c1ff", marginRight: "0.4rem" }}></span>
                  {chartYears[0]}
                </span>
                <span className="trend-legend-item">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#5f8cff", marginRight: "0.4rem" }}></span>
                  {chartYears[1]}
                </span>
                <span className="trend-legend-item">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#2956d7", marginRight: "0.4rem" }}></span>
                  {chartYears[2]}
                </span>
                <span className="trend-legend-item">
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#10b981", border: "2px dashed #ffffff", marginRight: "0.4rem" }}></span>
                  Meta (Atual)
                </span>
              </div>
            </>
          ) : null}
        </article>

        <SalesPerformancePanel 
          salesPerformance={metrics.salesPerformance} 
          isLoading={dashboardQuery.isLoading}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{selectedBucket ? "Clientes filtrados pelo grafico" : "Fila por prioridade"}</p>
            <h3>{selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes para o time abordar agora"}</h3>
            <p className="panel-subcopy">
              {selectedBucket
                ? "A selecao do grafico mostra apenas clientes da faixa escolhida."
                : "Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras."}
            </p>
          </div>
        </div>

        {tableQueryLoading ? <div className="page-loading">Carregando clientes priorizados...</div> : null}
        {tableQueryError ? <div className="page-error">Nao foi possivel carregar essa lista de clientes.</div> : null}
        {!tableQueryLoading && !tableQueryError ? <CustomerTable customers={tableCustomers} /> : null}
      </section>
    </div>
  );
}

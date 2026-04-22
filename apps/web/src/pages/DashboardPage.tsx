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
import { Target, Users, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import type { AgendaItem, PortfolioTrendPoint } from "@olist-crm/shared";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { PeriodSelector } from "../components/PeriodSelector";
import { SalesPerformancePanel } from "../components/SalesPerformancePanel";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { formatDate, formatNumber, formatCurrency, getFormattingLocale } from "../lib/format";

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
  return new Intl.NumberFormat(getFormattingLocale(), {
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
  const { tx } = useUiLanguage();

  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{tx(`${label} dias sem compra`, `${label}天未购买`)}</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span>{tx("clientes nessa faixa", "该区间客户数")}</span>
      </div>
      <p>
        {label === "0-14" || label === "15-30"
          ? tx("Todos nesta faixa seguem no status Ativo.", "这个区间的客户都处于活跃状态。")
          : label === "31-59" || label === "60-89"
            ? tx("Todos nesta faixa ja estao em Atencao.", "这个区间的客户都已经处于关注状态。")
            : tx("Todos nesta faixa ja estao Inativos.", "这个区间的客户都已经处于沉默状态。")}
      </p>
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
  const { tx } = useUiLanguage();

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
          <span>{tx("clientes na base nesse dia", "当天客户池中的客户")}</span>
        </div>
      ) : null}
      <div className="trend-tooltip-list">
        {trendSeries.map((line) => {
          const entry = payload.find((payloadItem) => payloadItem.dataKey === line.shareKey);
          return (
            <div key={line.shareKey} className="trend-tooltip-item">
              <span className="trend-tooltip-label">
                <span className="trend-tooltip-emoji" style={{ fontSize: "1.1rem", marginRight: "0.25rem" }}>{line.emoji}</span>
                {line.label === "Ativos" ? tx("Ativos", "活跃") : line.label === "Atencao" ? tx("Atencao", "关注") : tx("Inativos", "沉默")}
              </span>
              <div className="trend-tooltip-metric">
                <strong>{formatTrendPercent(entry?.value ?? 0)}</strong>
                <span>{formatNumber(point?.[line.countKey] ?? 0)} {tx("clientes", "客户")}</span>
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
  const { tx } = useUiLanguage();
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
    return <div className="page-loading">{tx("Carregando dashboard...", "正在加载仪表盘...")}</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <div className="page-error">{tx("Nao foi possivel carregar o dashboard.", "无法加载仪表盘。")}</div>;
  }

  const metrics = dashboardQuery.data;
  const localizedChartViewCopy = {
    inactivity: {
      eyebrow: tx("Faixas de inatividade", "沉默区间"),
      title: tx("Onde esta o risco de parada", "停购风险分布"),
      description: tx(
        "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.",
        "点击柱状条可筛选下方表格。客户状态规则为：30天内为活跃，31到89天为关注，90天及以上为沉默。",
      ),
      toggleLabel: tx("Risco de parada", "停购风险"),
      toggleHelper: tx("Veja as faixas de dias sem compra e filtre a lista.", "查看未购买天数区间并筛选列表。"),
    },
    trend: {
      eyebrow: tx("Composicao da carteira", "客户池构成"),
      title: tx("Composicao diaria da base", "客户池每日构成"),
      description: tx(
        "Cada dia soma 100% da carteira para mostrar, em percentual, se a base esta ganhando ativos ou acumulando inativos.",
        "每一天都按客户池总量折算为100%，用于观察活跃客户是否增加，或沉默客户是否累积。",
      ),
      toggleLabel: tx("Evolucao da base", "客户池走势"),
      toggleHelper: tx("Compare a participacao diaria de ativos, atencao e inativos.", "比较活跃、关注和沉默客户的每日占比。"),
    },
    screensSold: {
      eyebrow: tx("Desempenho de vendas", "销售表现"),
      title: tx("Quantidade de itens (telas) vendidas", "已售项目数量（屏）"),
      description: tx(
        "Acompanhe o volume mensal de itens vendidos. As linhas comparam o desempenho do ano atual com os anos anteriores.",
        "跟踪每月售出数量，并将当前年份与往年表现进行对比。",
      ),
      toggleLabel: tx("Telas vendidas", "已售数量"),
      toggleHelper: tx("Compare o volume mensal (2024 a 2026).", "比较每月销量（2024 至 2026）。"),
    },
  } as const;
  const activeChartCopy = localizedChartViewCopy[chartView];
  const trendData = metrics.portfolioTrend.map(normalizeTrendPoint);
  const chartDescription = activeChartCopy.description;
  const tableCustomers = selectedBucket ? (filteredCustomersQuery.data ?? []) : (priorityCustomersQuery.data ?? []);
  const tableQueryLoading = selectedBucket ? filteredCustomersQuery.isLoading : priorityCustomersQuery.isLoading;
  const tableQueryError = selectedBucket ? filteredCustomersQuery.isError : priorityCustomersQuery.isError;

  const currentYear = new Date().getFullYear();
  const chartYears = [currentYear - 2, currentYear - 1, currentYear];

  const monthNames = [tx("Jan", "1月"), tx("Fev", "2月"), tx("Mar", "3月"), tx("Abr", "4月"), tx("Mai", "5月"), tx("Jun", "6月"), tx("Jul", "7月"), tx("Ago", "8月"), tx("Set", "9月"), tx("Out", "10月"), tx("Nov", "11月"), tx("Dez", "12月")];
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
      alert(tx("Falha na sincronizacao: ", "同步失败：") + String(err));
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
    const userInput = window.prompt(tx("Meta de telas (mensal):", "月度屏数目标："), String(metrics.currentMonthTarget || ""));
    if (userInput === null) return;

    const val = parseInt(userInput.replace(/\D/g, ''), 10);
    if (isNaN(val)) {
      alert(tx("Valor invalido", "数值无效"));
      return;
    }

    try {
      const d = new Date();
      await api.saveMonthlyTarget(token!, d.getFullYear(), d.getMonth() + 1, val);
      dashboardQuery.refetch();
    } catch (err) {
      alert(tx("Erro ao salvar: ", "保存失败：") + String(err));
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
      ? tx("Sem meta", "未设置目标")
      : isTargetHit
        ? targetExceededBy > 0
          ? tx(`+${formatNumber(targetExceededBy)} acima`, `超出 ${formatNumber(targetExceededBy)}`)
          : tx("Meta batida", "已达成目标")
        : tx(`${targetPercent}% do alvo`, `完成目标 ${targetPercent}%`);
  const monthlyGoalStatus =
    targetAmount === 0
      ? tx("Defina sua meta no menu Metas para acompanhar o ritmo do mes.", "请先在目标页面设置本月目标，以便跟踪当前节奏。")
      : isTargetHit
        ? targetExceededBy > 0
          ? tx(`Voce ja passou ${formatNumber(targetExceededBy)} telas do alvo.`, `已超出目标 ${formatNumber(targetExceededBy)} 屏。`)
          : tx("Objetivo concluido neste mes.", "本月目标已完成。")
        : tx(`Faltam ${formatNumber(targetRemaining)} para a meta`, `距离目标还差 ${formatNumber(targetRemaining)}`);
  const monthlyGoalMetaLabel = targetAmount > 0 ? tx(`Alvo ${formatNumber(targetAmount)}`, `目标 ${formatNumber(targetAmount)}`) : tx("Meta pendente", "待设置目标");

  return (
    <div className="page-stack">
      <section className="dashboard-hero-premium">
        <div className="hero-premium-bg">
          <div className="hero-premium-gradient"></div>
        </div>
        <div className="hero-premium-content">
          <div className="hero-premium-copy">
            <div className="premium-badge">{tx("Operacao comercial", "销售运营")}</div>
            <h2 className="premium-title">{tx("Saude da carteira de clientes XP", "XP 客户池健康度")}</h2>
            <p className="premium-subtitle">{tx("Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada.", "用这块面板判断现在该联系谁、跟踪风险区间，并保持客户库最新。")}</p>
            <div className="premium-actions">
              <Link className="premium-button primary" to="/agenda">
                {tx("Abrir agenda do dia", "打开今日日程")}
              </Link>
              <button className="premium-button ghost" type="button" disabled={isSyncing} onClick={handleSync}>
                {isSyncing ? tx("Sincronizando...", "同步中...") : tx("Sincronizar Agora", "立即同步")}
              </button>
            </div>
          </div>

          <div className="hero-premium-stats">
            <div className="premium-stat-card">
              <div className="premium-stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="premium-stat-info">
                <span>{tx("Ultima sincronizacao", "最近同步")}</span>
                <strong>
                  {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString(getFormattingLocale()) : tx("Pendente...", "待处理...")}
                </strong>
              </div>
            </div>

            <div className="premium-stat-card interactive" onClick={handleSetTarget} title={tx("Clique para editar a meta", "点击编辑目标")}>
              <div className={`premium-stat-icon ${isTargetHit ? 'accent-success' : 'accent-blue'}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="premium-stat-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{tx("Meta do mes", "本月目标")}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <strong>{formatNumber(itemsSold)} / {targetAmount > 0 ? formatNumber(targetAmount) : tx("Definir", "设置")}</strong>
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
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="premium-stat-info">
                <span>{tx("Tempo medio de compra", "平均购买周期")}</span>
                <strong>{metrics.averageFrequencyDays.toFixed(1)} <small>{tx("dias", "天")}</small></strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard title={tx("Total de clientes", "客户总数")} value={formatNumber(metrics.totalCustomers)} helper={tx("Base comercial consolidada", "已汇总的销售客户池")} />
        <StatCard
          title={tx("Clientes ativos", "活跃客户")}
          value={formatNumber(metrics.statusCounts.ACTIVE)}
          badge={formatShare(metrics.statusCounts.ACTIVE, metrics.totalCustomers)}
          helper={tx("Clientes dentro da zona ativa", "处于活跃区间的客户")}
          tone="success"
        />
        <StatCard
          title={tx("Clientes em atencao", "关注客户")}
          value={formatNumber(metrics.statusCounts.ATTENTION)}
          badge={formatShare(metrics.statusCounts.ATTENTION, metrics.totalCustomers)}
          helper={tx("Clientes pedindo monitoramento", "需要持续跟进的客户")}
          tone="warning"
        />
        <StatCard
          title={tx("Clientes inativos", "沉默客户")}
          value={formatNumber(metrics.statusCounts.INACTIVE)}
          badge={formatShare(metrics.statusCounts.INACTIVE, metrics.totalCustomers)}
          helper={tx("Clientes fora da zona ativa", "已离开活跃区间的客户")}
          tone="danger"
        />
        <StatCard
          title="LTV (Valor Vitalício)"
          value={formatCurrency(metrics.estimatedLtv ?? 0)}
          helper={`Expectativa de receita (Estimativa vida: ${formatNumber(metrics.estimatedLifespanMonths ?? 0)} meses)`}
          tone="primary"
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
                  <InfoHint text={tx("As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.", "柱状条展示未购买天数。当前状态规则：30天内为活跃，31到89天为关注，90天及以上为沉默。")} />
                </h3>
              ) : (
                <h3>{activeChartCopy.title}</h3>
              )}
            </div>
          </div>
          <p className="panel-subcopy">{chartDescription}</p>
          <div className="chart-switcher" role="tablist" aria-label={tx("Alternar visualizacao dos graficos do dashboard", "切换仪表盘图表视图")}>
            {(Object.entries(localizedChartViewCopy) as Array<[ChartView, (typeof localizedChartViewCopy)[ChartView]]>).map(([view, copy]) => (
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
                  <strong>{tx("Ativo", "活跃")}</strong>
                  <span>{tx("Ate 30 dias sem comprar", "距离上次购买不超过 30 天")}</span>
                </div>
                <div className="status-guide-card is-attention">
                  <strong>{tx("Atencao", "关注")}</strong>
                  <span>{tx("De 31 a 89 dias sem comprar", "距离上次购买 31 到 89 天")}</span>
                </div>
                <div className="status-guide-card is-inactive">
                  <strong>{tx("Inativo", "沉默")}</strong>
                  <span>{tx("90 dias ou mais sem comprar", "距离上次购买 90 天及以上")}</span>
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
                  <span className="tag">{tx("Filtro ativo:", "当前筛选：")} {selectedBucket}</span>
                  <button className="ghost-button" type="button" onClick={() => setSelectedBucket(null)}>
                    {tx("Limpar filtro", "清除筛选")}
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
                  <div className="empty-state">{tx("Sem historico suficiente para montar a evolucao diaria da base.", "历史数据不足，无法生成客户池每日走势。")}</div>
                )}
              </div>
              <div className="trend-legend" aria-label={tx("Legenda do grafico de evolucao da base", "客户池走势图例")}>
                {trendSeries.map((series) => (
                  <span key={series.shareKey} className="trend-legend-item">
                    <span className="trend-legend-emoji" style={{ fontSize: "1.1rem", marginRight: "0.2rem" }}>{series.emoji}</span>
                    {series.label === "Ativos" ? tx("Ativos", "活跃") : series.label === "Atencao" ? tx("Atencao", "关注") : tx("Inativos", "沉默")}
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
                    <YAxis stroke="#5f6f95" tickLine={false} axisLine={false} width={65} tickFormatter={(val) => new Intl.NumberFormat(getFormattingLocale()).format(val)} />
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
                                  <strong>{tx(`${formatNumber(entry.value)} telas`, `${formatNumber(entry.value)} 屏`)}</strong>
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
                    <Line type="monotone" dataKey="meta" name={tx("Meta (Atual)", "当前目标")} stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="trend-legend" aria-label={tx("Legenda do grafico de telas vendidas", "销量图例")}>
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
                  {tx("Meta (Atual)", "当前目标")}
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
            <p className="eyebrow">{selectedBucket ? tx("Clientes filtrados pelo grafico", "按图表筛选的客户") : tx("Fila por prioridade", "优先级队列")}</p>
            <h3>{selectedBucket ? tx(`Clientes na faixa ${selectedBucket}`, `区间 ${selectedBucket} 的客户`) : tx("Clientes para o time abordar agora", "团队当前优先联系的客户")}</h3>
            <p className="panel-subcopy">
              {selectedBucket
                ? tx("A selecao do grafico mostra apenas clientes da faixa escolhida.", "图表筛选后，这里只显示所选区间内的客户。")
                : tx("Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras.", "列表默认按商业优先级排序，表格也支持按列排序和调整列宽。")}
            </p>
          </div>
        </div>

        {tableQueryLoading ? <div className="page-loading">{tx("Carregando clientes priorizados...", "正在加载优先客户...")}</div> : null}
        {tableQueryError ? <div className="page-error">{tx("Nao foi possivel carregar essa lista de clientes.", "无法加载该客户列表。")}</div> : null}
        {!tableQueryLoading && !tableQueryError ? <CustomerTable customers={tableCustomers} /> : null}
      </section>
    </div>
  );
}

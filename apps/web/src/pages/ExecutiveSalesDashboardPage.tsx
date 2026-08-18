import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BatteryCharging,
  BarChart3,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  PlugZap,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  ExecutiveDashboardDailyPoint,
  ExecutiveDashboardMetrics,
  ExecutiveDashboardSeller,
} from "@olist-crm/shared";
import { api } from "../lib/api";
import "./executiveSalesDashboard.css";

const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;
const AUTO_REFRESH_RETRY_INTERVAL_MS = 60 * 1000;
const FULL_PAGE_RELOAD_INTERVAL_MS = 15 * 60 * 1000;
const DATA_SYNC_INTERVAL_LABEL = "15min";
const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const RANK_EMOJIS = ["🏆", "🥈", "🥉", "❤"];
const SELLER_COLORS = ["#8ea9ef", "#7193ea", "#557be1", "#3f67d5"];

interface DashboardFilters {
  year: number;
  month: number;
  day: number | null;
}

interface FilterBarProps {
  filters: DashboardFilters;
  years: number[];
  months: number[];
  days: number[];
  onChange: (filters: DashboardFilters) => void;
  onUseCurrentPeriod: () => void;
}

interface HeaderProps extends FilterBarProps {
  generatedAt: string;
  isFetching: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
}

const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function getTodayFilters(): DashboardFilters {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: null,
  };
}

function buildDayOptions(year: number, month: number) {
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) => index + 1);
}

function formatNumber(value: number) {
  return numberFormatter.format(Math.round(value));
}

function formatCompact(value: number) {
  return compactFormatter.format(Math.round(value));
}

function formatDailyDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "DIA";
  return `DIA ${day} ${MONTH_LABELS[month - 1]?.toUpperCase() ?? ""}`;
}

function countBusinessDaysThrough(dateValue: string | undefined) {
  if (!dateValue) return 0;
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return 0;

  let count = 0;
  for (let currentDay = 1; currentDay <= day; currentDay += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, currentDay)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) count += 1;
  }
  return count;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function ExecutiveSidebar() {
  return (
    <aside className="executive-sidebar">
      <Link to="/" className="executive-brand" aria-label="Voltar ao CRM">
        <img src="/xp-factory-logo.png" alt="XP Factory" />
      </Link>

      <div className="executive-sidebar-divider" />

      <nav className="executive-report-nav" aria-label="Seções do relatório">
        <div className="executive-nav-item is-active" title="Performance" aria-label="Performance">
          <LayoutDashboard aria-hidden="true" />
          <span>Painel</span>
        </div>
      </nav>

      <div className="executive-tv-mode" title="Modo TV com sincronização automática das vendas a cada 15 minutos">
        <span className="executive-live-dot" />
        <div>
          <strong>TV</strong>
          <small>{DATA_SYNC_INTERVAL_LABEL}</small>
        </div>
      </div>

      <span className="executive-olist-wordmark">olist<span>•</span></span>
    </aside>
  );
}

function ExecutiveFilterBar({
  filters,
  years,
  months,
  days,
  onChange,
  onUseCurrentPeriod,
}: FilterBarProps) {
  const today = getTodayFilters();
  const isCurrentMonth = filters.year === today.year && filters.month === today.month;

  return (
    <div className="executive-filter-bar" aria-label="Filtros do relatório">
      <SlidersHorizontal aria-hidden="true" />
      <label>
        <span>Ano</span>
        <select
          aria-label="Ano"
          value={filters.year}
          onChange={(event) => onChange({ ...filters, year: Number(event.target.value), day: null })}
        >
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label>
        <span>Mês</span>
        <select
          aria-label="Mês"
          value={filters.month}
          onChange={(event) => onChange({ ...filters, month: Number(event.target.value), day: null })}
        >
          {months.map((month) => <option key={month} value={month}>{MONTH_LABELS[month - 1]}</option>)}
        </select>
      </label>
      <label>
        <span>Dia</span>
        <select
          aria-label="Dia"
          value={filters.day ?? ""}
          onChange={(event) => onChange({ ...filters, day: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">{isCurrentMonth ? "Hoje" : "Último com venda"}</option>
          {days.map((day) => <option key={day} value={day}>{day}</option>)}
        </select>
      </label>
      <button type="button" onClick={onUseCurrentPeriod} title="Voltar ao mês atual">
        <CalendarDays aria-hidden="true" />
        <span>Atual</span>
      </button>
    </div>
  );
}

function ExecutiveHeader({
  filters,
  years,
  months,
  days,
  onChange,
  onUseCurrentPeriod,
  generatedAt,
  isFetching,
  refreshFailed,
  onRefresh,
}: HeaderProps) {
  const updatedAt = new Date(generatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <header className="executive-header">
      <div className="executive-title-wrap">
        <h1>PERFORMANCE DE <strong>VENDAS</strong></h1>
        <span aria-hidden="true">🏃🏻‍♀️</span>
      </div>
      <ExecutiveFilterBar
        filters={filters}
        years={years}
        months={months}
        days={days}
        onChange={onChange}
        onUseCurrentPeriod={onUseCurrentPeriod}
      />
      <div className="executive-header-actions">
        <button
          type="button"
          className={`executive-refresh-copy${refreshFailed ? " has-error" : ""}`}
          onClick={onRefresh}
          disabled={isFetching}
          title="Atualizar os dados do painel agora"
          aria-label={isFetching ? "Atualizando painel" : "Atualizar painel agora"}
        >
          <RefreshCw className={isFetching ? "is-spinning" : ""} aria-hidden="true" />
          <span>
            <strong>{isFetching ? "ATUALIZANDO..." : refreshFailed ? "FALHA AO ATUALIZAR" : "ATUALIZA SOZINHO"}</strong>
            <small>{DATA_SYNC_INTERVAL_LABEL} · {updatedAt}</small>
          </span>
        </button>
        <span className="executive-live-dot" aria-label="Atualização automática ativa" />
      </div>
    </header>
  );
}

function XpDotMark() {
  const dots = [
    [24, 5, 2.7], [14, 8, 2.5], [34, 9, 2.4], [8, 17, 2.3],
    [40, 18, 2.8], [6, 28, 2.7], [41, 30, 2.4], [11, 38, 2.5],
    [34, 40, 2.8], [23, 43, 2.5], [21, 16, 2.2], [30, 24, 2.4],
    [18, 30, 2.1],
  ] as const;

  return (
    <svg className="executive-xp-dot-mark" viewBox="0 0 48 48" aria-hidden="true">
      {dots.map(([cx, cy, radius]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={radius} />)}
    </svg>
  );
}

function InventorySummary({ data }: { data: ExecutiveDashboardMetrics["inventory"] }) {
  return (
    <div className="executive-inventory-summary" title={data.updatedAt ? `Estoque atualizado em ${data.updatedAt}` : undefined}>
      <div title="Produtos diferentes com quantidade em estoque maior que zero">
        <span>PRODUTOS</span>
        <strong>{formatNumber(data.productCount)}</strong>
      </div>
      <Boxes aria-hidden="true" />
      <div title="Total de peças, somando somente quantidades em estoque maiores que zero">
        <span>ESTOQUE</span>
        <strong>{formatCompact(data.stockPieces)}</strong>
      </div>
      <XpDotMark />
    </div>
  );
}

function IndicatorPanel({ data }: { data: ExecutiveDashboardMetrics }) {
  const monthlyProducts = data.monthlyProductBreakdown ?? {
    screenXpItems: data.summary.monthScreenItems,
    screenVvItems: 0,
    screenDeItems: 0,
    batteryItems: data.summary.monthBatteryItems,
    chargingDockItems: 0,
  };
  const productTargets = data.productTargets ?? {
    screenXpItems: data.summary.monthlyTarget,
    screenVvItems: 0,
    screenDeItems: 0,
    batteryItems: data.summary.monthlyBatteryTarget,
    chargingDockItems: 0,
  };
  const productRows = [
    {
      key: "xp",
      label: "Telas XP",
      shortLabel: "XP",
      today: data.productBreakdown.screenXpItems,
      month: monthlyProducts.screenXpItems,
      target: productTargets.screenXpItems,
      color: "#2455db",
    },
    {
      key: "vv",
      label: "Telas VV",
      shortLabel: "VV",
      today: data.productBreakdown.screenVvItems,
      month: monthlyProducts.screenVvItems,
      target: productTargets.screenVvItems,
      color: "#7758dc",
    },
    {
      key: "de",
      label: "Telas DE",
      shortLabel: "DE",
      today: data.productBreakdown.screenDeItems,
      month: monthlyProducts.screenDeItems,
      target: productTargets.screenDeItems,
      color: "#e45b4b",
    },
    {
      key: "battery",
      label: "Baterias",
      shortLabel: "BAT",
      today: data.productBreakdown.batteryItems,
      month: monthlyProducts.batteryItems,
      target: productTargets.batteryItems,
      color: "#18a68b",
      icon: <BatteryCharging aria-hidden="true" />,
    },
    {
      key: "dock",
      label: "Dock de carga",
      shortLabel: "DOCK",
      today: data.productBreakdown.chargingDockItems,
      month: monthlyProducts.chargingDockItems,
      target: productTargets.chargingDockItems,
      color: "#e69a00",
      icon: <PlugZap aria-hidden="true" />,
    },
  ];
  const totalScreenProgress = data.summary.monthlyTarget > 0
    ? (data.summary.monthScreenItems / data.summary.monthlyTarget) * 100
    : 0;

  return (
    <section className="executive-indicators-card">
      <div className="executive-card-heading">
        <div className="executive-card-title">
          <h2>PRINCIPAIS INDICADORES</h2>
          <span>{formatDailyDate(data.selection.dailyDate)}</span>
        </div>
        <InventorySummary data={data.inventory} />
      </div>

      <div className="executive-product-performance">
        <article className="executive-performance-summary">
          <span className="executive-performance-eyebrow">TELAS DO DIA</span>
          <strong className="executive-performance-total">{formatNumber(data.productBreakdown.screenItems)}</strong>
          <div className="executive-performance-summary-grid">
            <div>
              <span>NO MÊS</span>
              <strong>{formatNumber(data.summary.monthScreenItems)}</strong>
            </div>
            <div>
              <span>META TELAS</span>
              <strong>{formatNumber(data.summary.monthlyTarget)}</strong>
            </div>
          </div>
          <div className="executive-performance-overall-progress">
            <span><i style={{ width: `${Math.min(totalScreenProgress, 100)}%` }} /></span>
            <strong>{totalScreenProgress.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
          </div>
          <small>XP + VV + DE no mês</small>
        </article>

        <div className="executive-performance-table" role="table" aria-label="Vendas de hoje, acumulado do mês e metas por produto">
          <div className="executive-performance-table-header" role="row">
            <span role="columnheader">PRODUTO</span>
            <span role="columnheader">HOJE</span>
            <span role="columnheader">NO MÊS</span>
            <span role="columnheader">META</span>
            <span role="columnheader">ATINGIDO</span>
          </div>
          {productRows.map((row) => {
            const progress = row.target > 0 ? (row.month / row.target) * 100 : 0;
            return (
              <div className="executive-performance-row" role="row" key={row.key}>
                <div className="executive-performance-product" role="cell">
                  <span style={{ backgroundColor: row.color }}>{row.icon ?? row.shortLabel}</span>
                  <strong>{row.label}</strong>
                </div>
                <strong className="executive-performance-number is-today" role="cell">{formatNumber(row.today)}</strong>
                <strong className="executive-performance-number" role="cell">{formatNumber(row.month)}</strong>
                <strong className="executive-performance-number is-target" role="cell">{formatNumber(row.target)}</strong>
                <div className="executive-performance-progress" role="cell" aria-label={`${progress.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta`}>
                  <span><i style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: row.color }} /></span>
                  <strong>{progress.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SellerRow({ seller, rank }: { seller: ExecutiveDashboardSeller | null; rank: number }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const avatarUrl = seller?.profilePictureUrl ?? null;

  return (
    <div className={`executive-seller-row${seller ? "" : " is-empty"}`}>
      <div className="executive-seller-avatar" style={{ background: SELLER_COLORS[rank] }}>
        <span>{seller ? getInitials(seller.attendant) : "—"}</span>
        {avatarUrl && failedImageUrl !== avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`Foto de ${seller?.attendant ?? "vendedora"}`}
            referrerPolicy="no-referrer"
            onError={() => setFailedImageUrl(avatarUrl)}
          />
        ) : null}
      </div>
      <div className="executive-seller-card">
        <div>
          <span>Nome</span>
          <strong>{seller?.attendant ?? "Aguardando vendas"}</strong>
        </div>
        <div className="executive-seller-score">
          <strong title={seller ? `${formatNumber(seller.totalItems)} itens · ${formatNumber(seller.screenItems)} telas · ${formatNumber(seller.batteryItems)} baterias · ${formatNumber(seller.chargingDockItems)} doc. carga` : undefined}>
            {seller ? formatNumber(seller.totalItems) : "—"}
          </strong>
          <span title={seller ? `${seller.totalOrders} pedidos · ${currencyFormatter.format(seller.totalRevenue)}` : undefined}>
            {RANK_EMOJIS[rank]}
          </span>
        </div>
      </div>
    </div>
  );
}

function SellerRanking({ sellers, dailyDate }: { sellers: ExecutiveDashboardSeller[]; dailyDate: string }) {
  return (
    <section className="executive-ranking-card">
      <div className="executive-ranking-heading">
        <div className="executive-ranking-title">
          <h2>TOP VENDEDORES</h2>
          <span>{formatDailyDate(dailyDate)}</span>
        </div>
        <Search aria-hidden="true" />
      </div>
      <div className="executive-seller-list">
        {Array.from({ length: 4 }, (_, rank) => (
          <SellerRow key={rank} seller={sellers[rank] ?? null} rank={rank} />
        ))}
      </div>
    </section>
  );
}

function dailyTooltipFormatter(
  value: number | string | Array<number | string>,
  name: string,
): [string, string] {
  const numeric = Number(Array.isArray(value) ? value[0] ?? 0 : value);
  const labels: Record<string, string> = {
    totalItems: "Peças",
    screenItems: "Telas",
    totalOrders: "Pedidos",
    uniqueCustomers: "Clientes",
  };
  return [formatNumber(numeric), labels[name] ?? name];
}

function DailyPiecesChart({
  points,
  dailyTarget,
  monthScreenItems,
  month,
}: {
  points: ExecutiveDashboardDailyPoint[];
  dailyTarget: number;
  monthScreenItems: number;
  month: number;
}) {
  const elapsedBusinessDays = countBusinessDaysThrough(points.at(-1)?.date);
  const expectedItemsToDate = dailyTarget * elapsedBusinessDays;
  const dailyDelta = monthScreenItems - expectedItemsToDate;
  const hasData = points.length > 0;
  const largestValue = Math.max(dailyTarget, ...points.map((point) => point.screenItems), 1);
  const axisStep = largestValue <= 1_000 ? 250 : largestValue <= 5_000 ? 1_000 : 2_000;
  const axisMaximum = Math.ceil(largestValue / axisStep) * axisStep;

  return (
    <section className="executive-chart-card executive-daily-chart">
      <div className="executive-chart-heading">
        <div className="executive-chart-title">
          <h2>Quantidade de Telas por Dia</h2>
          <small>MÊS DE {MONTH_LABELS[month - 1]?.toUpperCase()}</small>
        </div>
        <span className={dailyDelta >= 0 ? "is-positive" : "is-negative"}>
          <i aria-hidden="true">{dailyDelta >= 0 ? "▲" : "▼"}</i>
          {formatNumber(Math.abs(dailyDelta))} {dailyDelta >= 0 ? "acima" : "abaixo"} da meta
        </span>
      </div>
      <div className="executive-chart-body">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 24, right: 10, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#d8dde8" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#5f6674", fontSize: 16 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={108}
                domain={[0, axisMaximum]}
                tickCount={3}
                tick={{ fill: "#5f6674", fontSize: 16, dx: -45 }}
                tickFormatter={(value) => formatCompact(Number(value))}
              />
              <Tooltip formatter={dailyTooltipFormatter} labelFormatter={(label) => `Dia ${label}`} />
              {dailyTarget > 0 ? (
                <ReferenceLine
                  y={dailyTarget}
                  stroke="#8b93a3"
                  strokeDasharray="4 4"
                  strokeWidth={1.4}
                  ifOverflow="extendDomain"
                  label={{ value: `Meta ${formatNumber(dailyTarget)}`, position: "insideTopRight", fill: "#687184", fontSize: 14 }}
                />
              ) : null}
              <Bar dataKey="screenItems" radius={0} maxBarSize={60}>
                {points.map((point) => (
                  <Cell key={point.date} fill={dailyTarget > 0 && point.screenItems >= dailyTarget ? "#2250db" : "#001446"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="executive-empty-chart">Sem vendas no período selecionado.</div>
        )}
        {hasData ? <span className="executive-chart-month-label">{MONTH_LABELS[month - 1]}</span> : null}
      </div>
    </section>
  );
}

function MonthlyCustomersChart({
  data,
  year,
}: {
  data: ExecutiveDashboardMetrics["monthlyCustomers"];
  year: number;
}) {
  const maxCustomers = Math.max(...data.map((point) => point.uniqueCustomers), 1);
  const chartDensity = data.length > 8 ? " is-very-dense" : data.length > 4 ? " is-dense" : "";
  return (
    <section className="executive-chart-card executive-monthly-chart">
      <div className="executive-chart-heading">
        <div className="executive-chart-title">
          <h2>Qtd Clientes por Mês</h2>
          <small>JAN–MÊS ATUAL · {year}</small>
        </div>
      </div>
      <div className={`executive-month-bars${chartDensity}`}>
        {data.length > 0 ? data.map((point) => (
          <div className="executive-month-row" key={point.month}>
            <span>{MONTH_LABELS[point.month - 1]}</span>
            <div>
              <span style={{ width: `${Math.max((point.uniqueCustomers / maxCustomers) * 100, 8)}%` }}>
                <strong>{formatNumber(point.uniqueCustomers)}</strong>
              </span>
            </div>
          </div>
        )) : <div className="executive-empty-chart">Sem clientes neste ano.</div>}
      </div>
    </section>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="executive-state-screen">
      <BarChart3 aria-hidden="true" />
      <h1>Não foi possível carregar o relatório</h1>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>Tentar novamente</button>
    </div>
  );
}

export function ExecutiveSalesDashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>(getTodayFilters);
  const [followsCurrentPeriod, setFollowsCurrentPeriod] = useState(true);

  useEffect(() => {
    const syncCurrentPeriod = () => {
      if (!followsCurrentPeriod) return;
      const current = getTodayFilters();
      setFilters((previous) => (
        previous.year === current.year && previous.month === current.month && previous.day === null
          ? previous
          : current
      ));
    };

    const interval = window.setInterval(syncCurrentPeriod, AUTO_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncCurrentPeriod();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [followsCurrentPeriod]);

  useEffect(() => {
    if (!followsCurrentPeriod) return;

    const pageOpenedAt = Date.now();
    const reloadIfNeeded = () => {
      if (Date.now() - pageOpenedAt < FULL_PAGE_RELOAD_INTERVAL_MS) return;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("tvRefresh", String(Date.now()));
      window.location.replace(nextUrl.toString());
    };

    // Checagem curta: se o navegador da TV suspender timers, a primeira execucao
    // ao retomar percebe o tempo transcorrido e recarrega a aplicacao completa.
    const interval = window.setInterval(reloadIfNeeded, AUTO_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", reloadIfNeeded);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", reloadIfNeeded);
    };
  }, [followsCurrentPeriod]);

  const changeFilters = (nextFilters: DashboardFilters) => {
    setFollowsCurrentPeriod(false);
    setFilters(nextFilters);
  };

  const useCurrentPeriod = () => {
    setFollowsCurrentPeriod(true);
    setFilters(getTodayFilters());
  };

  const query = useQuery({
    queryKey: ["executive-sales-dashboard", filters.year, filters.month, filters.day],
    queryFn: () => api.executiveDashboard(filters),
    refetchInterval: (activeQuery) => (
      activeQuery.state.status === "error"
        ? AUTO_REFRESH_RETRY_INTERVAL_MS
        : AUTO_REFRESH_INTERVAL_MS
    ),
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 2 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  });

  const periodOptions = query.data?.availablePeriods ?? [];
  const years = useMemo(() => {
    const values = new Set(periodOptions.map((period) => period.year));
    values.add(filters.year);
    return Array.from(values).sort((left, right) => right - left);
  }, [filters.year, periodOptions]);
  const months = useMemo(() => {
    const values = new Set(
      periodOptions.filter((period) => period.year === filters.year).map((period) => period.month),
    );
    values.add(filters.month);
    return Array.from(values).sort((left, right) => right - left);
  }, [filters.month, filters.year, periodOptions]);
  const days = useMemo(() => buildDayOptions(filters.year, filters.month), [filters.month, filters.year]);

  if (query.isLoading || !query.data) {
    if (query.isError) {
      return <DashboardError message={query.error.message} onRetry={() => void query.refetch()} />;
    }
    return (
      <div className="executive-state-screen">
        <div className="executive-loading-mark"><span /><span /><span /></div>
        <h1>Preparando o relatório executivo</h1>
        <p>Consolidando vendas, metas e estoque.</p>
      </div>
    );
  }

  const data = query.data;

  return (
    <main className="executive-dashboard-viewport">
      <div className="executive-dashboard-canvas">
        <ExecutiveSidebar />
        <div className="executive-dashboard-content">
          <ExecutiveHeader
            filters={filters}
            years={years}
            months={months}
            days={days}
            onChange={changeFilters}
            onUseCurrentPeriod={useCurrentPeriod}
            generatedAt={data.generatedAt}
            isFetching={query.isFetching}
            refreshFailed={query.isError}
            onRefresh={() => void query.refetch()}
          />
          <div className="executive-dashboard-grid">
            <IndicatorPanel data={data} />
            <SellerRanking sellers={data.sellers} dailyDate={data.selection.dailyDate} />
            <DailyPiecesChart
              points={data.dailySeries}
              dailyTarget={data.summary.dailyTarget}
              monthScreenItems={data.summary.monthScreenItems}
              month={data.selection.month}
            />
            <MonthlyCustomersChart data={data.monthlyCustomers} year={data.selection.year} />
          </div>
        </div>
      </div>
    </main>
  );
}

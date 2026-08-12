import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
  PackageCheck,
  PlugZap,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Target,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import type {
  ExecutiveDashboardDailyPoint,
  ExecutiveDashboardMetrics,
  ExecutiveDashboardSeller,
} from "@olist-crm/shared";
import { api } from "../lib/api";
import "./executiveSalesDashboard.css";

const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const RANK_EMOJIS = ["🏆", "🥈", "🥉", "❤"];
const SELLER_COLORS = ["#8ea9ef", "#7193ea", "#557be1", "#3f67d5"];
const CLIENT_BAR_COLORS = ["#df68d8", "#db4c62", "#8b70e8", "#62e0dc", "#80edc5"];

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

      <div className="executive-tv-mode" title="Modo TV com atualização automática a cada hora">
        <span className="executive-live-dot" />
        <div>
          <strong>TV</strong>
          <small>1h</small>
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
          <option value="">Último com venda</option>
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
        <div className="executive-refresh-copy" title="Os dados são buscados novamente sem precisar recarregar a página">
          <RefreshCw className={isFetching ? "is-spinning" : ""} aria-hidden="true" />
          <span>
            <strong>ATUALIZA SOZINHO</strong>
            <small>1 hora · {updatedAt}</small>
          </span>
        </div>
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
      <div>
        <span>PRODUTOS</span>
        <strong>{formatNumber(data.productCount)}</strong>
      </div>
      <Boxes aria-hidden="true" />
      <div>
        <span>ESTOQUE</span>
        <strong>{formatCompact(data.stockPieces)}</strong>
      </div>
      <XpDotMark />
    </div>
  );
}

function IndicatorPanel({ data }: { data: ExecutiveDashboardMetrics }) {
  const progressPercent = Math.round(data.summary.targetProgress * 100);
  const dailyProgress = data.summary.dailyTarget > 0
    ? data.productBreakdown.screenItems / data.summary.dailyTarget
    : 0;
  const dailyProgressPercent = dailyProgress * 100;
  const gaugeStyle = {
    "--executive-progress": `${Math.max(0, Math.min(100, progressPercent)) * 3.6}deg`,
  } as CSSProperties;
  const maxSellerCustomers = Math.max(...data.sellers.map((seller) => seller.uniqueCustomers), 1);

  return (
    <section className="executive-indicators-card">
      <div className="executive-card-heading">
        <div className="executive-card-title">
          <h2>PRINCIPAIS INDICADORES</h2>
          <span>{formatDailyDate(data.selection.dailyDate)}</span>
        </div>
        <InventorySummary data={data.inventory} />
      </div>

      <div className="executive-indicator-columns">
        <article className="executive-metric-column metric-primary">
          <h3>TELAS DO DIA <span>XP</span></h3>
          <strong className="executive-hero-value">{formatNumber(data.productBreakdown.screenItems)}</strong>
          <div className="executive-product-breakdown" aria-label="Telas vendidas por fábrica e acessórios">
            <div className="executive-factory-breakdown">
              <div><span>XP</span><strong>{formatNumber(data.productBreakdown.screenXpItems)}</strong></div>
              <div><span>VV</span><strong>{formatNumber(data.productBreakdown.screenVvItems)}</strong></div>
              <div><span>DE</span><strong>{formatNumber(data.productBreakdown.screenDeItems)}</strong></div>
            </div>
            <div className="executive-accessory-breakdown">
              <div><BatteryCharging aria-hidden="true" /><span>Baterias</span><strong>{formatNumber(data.productBreakdown.batteryItems)}</strong></div>
              <div><PlugZap aria-hidden="true" /><span>Doc. de carga</span><strong>{formatNumber(data.productBreakdown.chargingDockItems)}</strong></div>
            </div>
          </div>
          <div className="executive-daily-target">
            <span>META DIÁRIA</span>
            <strong>{formatNumber(data.summary.dailyTarget)}</strong>
          </div>
          <div className="executive-daily-progress" aria-label={`${dailyProgressPercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% da meta diária`}>
            <span style={{ width: `${Math.max(Math.min(dailyProgressPercent, 100), dailyProgress > 0 ? 12 : 0)}%` }}>
              <strong>{dailyProgressPercent.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong>
            </span>
          </div>
        </article>

        <article className="executive-metric-column metric-orders">
          <h3>PEDIDOS DO DIA <PackageCheck aria-hidden="true" /></h3>
          <strong className="executive-hero-value">{formatNumber(data.summary.totalOrders)}</strong>
          <div className="executive-clients-heading">
              <span>CLIENTES NO DIA</span>
            <UsersRound aria-hidden="true" />
            <strong>{formatNumber(data.summary.uniqueCustomers)}</strong>
          </div>
          <div className="executive-client-bars" aria-label="Clientes atendidos por vendedor">
            {data.sellers.slice(0, 5).map((seller, index) => (
              <div key={seller.attendant}>
                <span
                  style={{
                    width: `${Math.max((seller.uniqueCustomers / maxSellerCustomers) * 100, 12)}%`,
                    backgroundColor: CLIENT_BAR_COLORS[index],
                  }}
                >
                  <strong>{formatNumber(seller.uniqueCustomers)}</strong>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="executive-metric-column metric-target">
          <div className="executive-target-heading">
            <h3>META MÊS <Target aria-hidden="true" /></h3>
            <strong>{formatNumber(data.summary.monthlyTarget)}</strong>
          </div>
          <div className="executive-gauge" style={gaugeStyle}>
            <div>
              <strong>{progressPercent}%</strong>
              <span>{formatNumber(data.summary.monthScreenItems)}</span>
              <small>ACUMULADO NO MÊS</small>
            </div>
          </div>
        </article>
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
          <strong title={seller ? `${formatNumber(seller.screenItems)} telas · ${seller.batteryItems} baterias · ${seller.chargingDockItems} doc. carga` : undefined}>
            {seller ? formatNumber(seller.screenItems) : "—"}
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
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
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

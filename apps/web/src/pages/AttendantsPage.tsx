import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
  type AttendantSortKey,
  buildTrendChartData,
  chartMetricLabel,
  getAttendantColor,
  getInitialSelectedAttendants,
  sortAttendantsForBoard,
  toggleComparedAttendant,
} from "./attendantsPage.helpers";

type WindowMonths = 3 | 6 | 12 | 24;

const metricOptions: AttendantChartMetric[] = ["revenue", "orders", "pieces", "uniqueCustomers"];
const windowOptions: WindowMonths[] = [3, 6, 12, 24];

function formatMonthLabel(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  if (!matched) {
    return value;
  }

  const [, year = "", month = ""] = matched;
  return `${month}/${year.slice(2)}`;
}

function formatGrowth(value: number | null) {
  if (value === null || value === undefined) {
    return "Sem base";
  }

  const percent = value * 100;
  const prefix = percent > 0 ? "+" : "";

  return `${prefix}${percent.toFixed(1).replace(".", ",")}%`;
}

function growthClass(value: number | null) {
  if (value === null || value === undefined) {
    return "neutral";
  }

  if (value > 0) {
    return "success";
  }

  if (value < 0) {
    return "danger";
  }

  return "neutral";
}

function formatMetricValue(value: number, metric: AttendantChartMetric) {
  return metric === "revenue" ? formatCurrency(value) : formatNumber(value);
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

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

function activeShare(totalCustomers: number, activeCustomers: number) {
  return safeDivide(activeCustomers, totalCustomers);
}

function reactivationPressure(totalCustomers: number, attentionCustomers: number, inactiveCustomers: number) {
  return safeDivide(attentionCustomers + inactiveCustomers, totalCustomers);
}

function repeatIntensity(orders: number, uniqueCustomers: number) {
  return safeDivide(orders, uniqueCustomers);
}

function formatMetricAxis(value: number, metric: AttendantChartMetric) {
  if (metric !== "revenue") {
    return formatNumber(value);
  }

  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  }

  if (absoluteValue >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(0)}k`;
  }

  return formatCurrency(value);
}

function TrendTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; color?: string; value?: number; name?: string }>;
  label?: string;
  metric: AttendantChartMetric;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip trend-tooltip">
      <strong>{formatMonthLabel(label)}</strong>
      <div className="trend-tooltip-list">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="trend-tooltip-item">
            <span className="trend-tooltip-label">
              <span className="trend-tooltip-dot" style={{ backgroundColor: entry.color ?? "#2956d7" }} />
              {entry.name}
            </span>
            <div className="trend-tooltip-metric">
              <strong>{formatMetricValue(Number(entry.value ?? 0), metric)}</strong>
              <span>{chartMetricLabel(metric)} no mes</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; color?: string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <div className="trend-tooltip-list">
        {payload.map((entry) => (
          <div key={entry.name} className="trend-tooltip-item">
            <span className="trend-tooltip-label">
              <span className="trend-tooltip-dot" style={{ backgroundColor: entry.color ?? "#2956d7" }} />
              {entry.name}
            </span>
            <div className="trend-tooltip-metric">
              <strong>{formatNumber(Number(entry.value ?? 0))}</strong>
              <span>{formatPercent(safeDivide(Number(entry.value ?? 0), total))} da carteira</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AttendantsPage() {
  const { token } = useAuth();
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(12);
  const [chartMetric, setChartMetric] = useState<AttendantChartMetric>("uniqueCustomers");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<AttendantSortKey>("customers");
  const [selectedAttendants, setSelectedAttendants] = useState<string[]>([]);
  const [focusedAttendant, setFocusedAttendant] = useState("");

  const attendantsQuery = useQuery({
    queryKey: ["attendants", windowMonths],
    queryFn: () => api.attendants(token!, windowMonths),
    enabled: Boolean(token),
  });

  const data = attendantsQuery.data;
  const allAttendants = data?.attendants ?? [];
  const portfolioSummary = useMemo(
    () =>
      allAttendants.reduce(
        (totals, item) => ({
          totalCustomers: totals.totalCustomers + item.portfolio.totalCustomers,
          active: totals.active + item.portfolio.statusCounts.ACTIVE,
          attention: totals.attention + item.portfolio.statusCounts.ATTENTION,
          inactive: totals.inactive + item.portfolio.statusCounts.INACTIVE,
        }),
        {
          totalCustomers: 0,
          active: 0,
          attention: 0,
          inactive: 0,
        },
      ),
    [allAttendants],
  );
  const teamRepeatIntensity = repeatIntensity(data?.summary.currentPeriodOrders ?? 0, data?.summary.currentPeriodCustomers ?? 0);
  const teamPiecesPerOrder = safeDivide(data?.summary.currentPeriodPieces ?? 0, data?.summary.currentPeriodOrders ?? 0);

  useEffect(() => {
    if (!allAttendants.length) {
      if (selectedAttendants.length) {
        setSelectedAttendants([]);
      }
      return;
    }

    setSelectedAttendants((current) => {
      const validSelections = current.filter((item) => allAttendants.some((entry) => entry.attendant === item));
      if (!current.length) {
        return getInitialSelectedAttendants(allAttendants, 3);
      }

      return validSelections;
    });
  }, [allAttendants]);

  useEffect(() => {
    if (!allAttendants.length) {
      if (focusedAttendant) {
        setFocusedAttendant("");
      }
      return;
    }

    const exists = allAttendants.some((item) => item.attendant === focusedAttendant);
    if (!focusedAttendant || !exists) {
      setFocusedAttendant(allAttendants[0]?.attendant ?? "");
    }
  }, [allAttendants, focusedAttendant]);

  const visibleAttendants = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return sortAttendantsForBoard(
      allAttendants.filter((item) => {
        if (!normalizedSearch) {
          return true;
        }

        return item.attendant.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      }),
      sortKey,
    );
  }, [allAttendants, search, sortKey]);

  const { data: trendData, series: trendSeries } = useMemo(
    () => buildTrendChartData(allAttendants, selectedAttendants, chartMetric),
    [allAttendants, chartMetric, selectedAttendants],
  );
  const selectedSeriesByAttendant = useMemo(
    () => new Map(trendSeries.map((series) => [series.attendant, series.color])),
    [trendSeries],
  );
  const compareOptions = useMemo(
    () =>
      allAttendants.map((item) => ({
        attendant: item.attendant,
        color: getAttendantColor(item.attendant),
      })),
    [allAttendants],
  );
  const healthChartData = useMemo(
    () =>
      [...visibleAttendants]
        .sort((left, right) => {
          const activeShareDiff =
            activeShare(right.portfolio.totalCustomers, right.portfolio.statusCounts.ACTIVE) -
            activeShare(left.portfolio.totalCustomers, left.portfolio.statusCounts.ACTIVE);
          if (activeShareDiff !== 0) {
            return activeShareDiff;
          }

          return right.portfolio.totalCustomers - left.portfolio.totalCustomers;
        })
        .map((item) => ({
          attendant: item.attendant,
          active: item.portfolio.statusCounts.ACTIVE,
          attention: item.portfolio.statusCounts.ATTENTION,
          inactive: item.portfolio.statusCounts.INACTIVE,
          totalCustomers: item.portfolio.totalCustomers,
        })),
    [visibleAttendants],
  );

  const focusedItem =
    allAttendants.find((item) => item.attendant === focusedAttendant) ??
    allAttendants.find((item) => item.attendant === selectedAttendants[0]) ??
    visibleAttendants[0] ??
    null;

  if (attendantsQuery.isLoading) {
    return <div className="page-loading">Carregando aba de atendentes...</div>;
  }

  if (attendantsQuery.isError || !data) {
    return <div className="page-error">Nao foi possivel carregar o painel de atendentes.</div>;
  }

  return (
    <div className="page-stack attendants-page">
      <section className="hero-panel attendants-hero">
        <div className="hero-copy">
          <p className="eyebrow">Performance comercial</p>
          <h2 className="premium-header-title">Atendentes</h2>
          <p>
            Compare faturamento, vendas, pecas e clientes por vendedora, enxergando o corte atual, o historico mensal
            fechado e a carteira de cada nome.
          </p>
        </div>

        <div className="hero-meta attendants-hero-meta">
          <div className="hero-meta-item">
            <span>Janela atual</span>
            <strong>
              {formatDate(data.summary.currentPeriodStart)} ate {formatDate(data.summary.currentPeriodEnd)}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Comparativo</span>
            <strong>
              {formatDate(data.summary.previousPeriodStart)} ate {formatDate(data.summary.previousPeriodEnd)}
            </strong>
          </div>
          <div className="attendants-window-toggle" role="tablist" aria-label="Selecionar janela mensal">
            {windowOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`attendants-window-button ${windowMonths === option ? "active" : ""}`}
                onClick={() => setWindowMonths(option)}
              >
                {option} meses
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="stats-grid attendants-summary-grid">
        <article className="stat-card">
          <p className="eyebrow">Time monitorado</p>
          <strong>{formatNumber(data.summary.totalAttendants)}</strong>
          <span>{formatNumber(data.summary.activeAttendants)} com venda no corte atual</span>
        </article>

        <article className="stat-card">
          <p className="eyebrow">Clientes do mes</p>
          <strong>{formatNumber(data.summary.currentPeriodCustomers)}</strong>
          <span>{formatNumber(data.summary.currentPeriodOrders)} vendas fechadas no corte</span>
        </article>

        <article className="stat-card">
          <p className="eyebrow">Recorrencia do time</p>
          <strong>{formatDecimal(teamRepeatIntensity, 2)}</strong>
          <span>{formatDecimal(teamPiecesPerOrder, 1)} pecas por venda em media</span>
        </article>

        <article className="stat-card">
          <p className="eyebrow">Clientes para reativar</p>
          <strong>{formatNumber(portfolioSummary.attention + portfolioSummary.inactive)}</strong>
          <span>
            {formatPercent(
              reactivationPressure(portfolioSummary.totalCustomers, portfolioSummary.attention, portfolioSummary.inactive),
            )}{" "}
            da carteira pedindo contato
          </span>
        </article>
      </section>

      <section className="grid-two attendants-dashboard-grid">
        <article className="panel chart-panel attendants-trend-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Evolucao mensal</p>
              <h3>Comparativo entre vendedoras</h3>
              <p className="panel-subcopy">
                Selecione quem entra no comparativo e acompanhe {chartMetricLabel(chartMetric).toLocaleLowerCase("pt-BR")} ao longo de{" "}
                {windowMonths} meses fechados.
              </p>
            </div>
          </div>

          <div className="attendants-toolbar">
            <div className="attendants-toolbar-main">
              <div className="ambassador-chart-toggle" role="tablist" aria-label="Selecionar metrica do grafico">
                {metricOptions.map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    className={`ambassador-chart-button ${chartMetric === metric ? "active" : ""}`}
                    onClick={() => setChartMetric(metric)}
                  >
                    {chartMetricLabel(metric)}
                  </button>
                ))}
              </div>

              <div className="attendants-compare-picker" aria-label="Selecionar atendentes para comparar">
                {compareOptions.map((option) => {
                  const isSelected = selectedAttendants.includes(option.attendant);
                  const compareDisabled = !isSelected && selectedAttendants.length >= 5;

                  return (
                    <button
                      key={option.attendant}
                      type="button"
                      className={`attendants-compare-chip ${isSelected ? "active" : ""}`}
                      onClick={() => setSelectedAttendants((current) => toggleComparedAttendant(current, option.attendant, 5))}
                      disabled={compareDisabled}
                    >
                      <span className="trend-tooltip-dot" style={{ backgroundColor: option.color }} />
                      {option.attendant}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="attendants-compare-summary">
              <span>Comparando {selectedAttendants.length}/5</span>
              <div className="attendants-compare-tags">
                {selectedAttendants.map((attendant) => (
                  <span
                    key={attendant}
                    className="tag attendants-compare-tag"
                    style={{
                      borderColor: `${selectedSeriesByAttendant.get(attendant) ?? getAttendantColor(attendant)}44`,
                      color: selectedSeriesByAttendant.get(attendant) ?? getAttendantColor(attendant),
                    }}
                  >
                    <span
                      className="trend-tooltip-dot"
                      style={{ backgroundColor: selectedSeriesByAttendant.get(attendant) ?? getAttendantColor(attendant) }}
                    />
                    {attendant}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="trend-chart-wrap attendants-trend-wrap">
            {trendSeries.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={trendData} margin={{ top: 12, right: 18, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(value) => formatMonthLabel(String(value))}
                    stroke="#5f6f95"
                    minTickGap={20}
                  />
                  <YAxis tickFormatter={(value) => formatMetricAxis(Number(value), chartMetric)} stroke="#5f6f95" />
                  <Tooltip content={<TrendTooltip metric={chartMetric} />} />
                  {trendSeries.map((series) => (
                    <Line
                      key={series.dataKey}
                      type="monotone"
                      dataKey={series.dataKey}
                      name={series.attendant}
                      stroke={series.color}
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">Selecione pelo menos uma atendente para montar o comparativo.</div>
            )}
          </div>

          {trendSeries.length ? (
            <div className="trend-legend attendants-legend" aria-label="Legenda do grafico de comparacao">
              {trendSeries.map((series) => (
                <span key={series.dataKey} className="trend-legend-item">
                  <span className="trend-legend-dot" style={{ backgroundColor: series.color }} />
                  {series.attendant}
                </span>
              ))}
            </div>
          ) : null}
        </article>

        <article className="panel attendants-ranking-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Carteira hoje</p>
              <h3>Distribuicao por status</h3>
              <p className="panel-subcopy">
                Troquei o ranking de faturamento por uma leitura mais util: quantos clientes cada atendente tem em ativo,
                atencao e inativo hoje.
              </p>
            </div>
          </div>

          <div className="trend-chart-wrap attendants-ranking-wrap">
            {healthChartData.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart
                  data={healthChartData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 16, bottom: 4 }}
                >
                  <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" horizontal={false} />
                  <XAxis type="number" stroke="#5f6f95" tickFormatter={(value) => formatNumber(Number(value))} />
                  <YAxis type="category" dataKey="attendant" width={92} stroke="#5f6f95" />
                  <Tooltip content={<HealthTooltip />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                  <Bar dataKey="active" name="Ativos" stackId="portfolio" fill="#2f9d67" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="attention" name="Atencao" stackId="portfolio" fill="#d09a29" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="inactive" name="Inativos" stackId="portfolio" fill="#d9534f" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state">Nenhuma atendente encontrada para esse filtro.</div>
            )}
          </div>

          <div className="trend-legend attendants-health-legend">
            <span className="trend-legend-item">
              <span className="trend-legend-dot" style={{ backgroundColor: "#2f9d67" }} />
              Ativos
            </span>
            <span className="trend-legend-item">
              <span className="trend-legend-dot" style={{ backgroundColor: "#d09a29" }} />
              Atencao
            </span>
            <span className="trend-legend-item">
              <span className="trend-legend-dot" style={{ backgroundColor: "#d9534f" }} />
              Inativos
            </span>
          </div>
        </article>
      </section>

      <section className="grid-two attendants-detail-grid">
        <article className="panel attendants-board-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Leaderboard</p>
              <h3>Quem esta puxando relacionamento e carteira</h3>
              <p className="panel-subcopy">
                Busque uma vendedora, ordene a lista e use os botoes para comparar ou abrir o painel detalhado.
              </p>
            </div>
          </div>

          <div className="filters-grid filters-grid-four attendants-filters">
            <label>
              Buscar
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome da atendente" />
            </label>

            <label>
              Ordenar por
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as AttendantSortKey)}>
                <option value="customers">Clientes atendidos</option>
                <option value="orders">Vendas</option>
                <option value="recurrence">Recorrencia</option>
                <option value="activeShare">Carteira ativa</option>
                <option value="reactivationRisk">Pressao de reativacao</option>
                <option value="pieces">Pecas</option>
                <option value="portfolio">Carteira total</option>
                <option value="growth">Crescimento de clientes</option>
                <option value="name">Nome</option>
              </select>
            </label>
          </div>

          <div className="attendants-board-list">
            {visibleAttendants.length ? (
              visibleAttendants.map((item, index) => {
                const isCompared = selectedAttendants.includes(item.attendant);
                const isFocused = focusedItem?.attendant === item.attendant;
                const compareDisabled = !isCompared && selectedAttendants.length >= 5;

                return (
                  <article
                    key={item.attendant}
                    className={`attendants-board-card ${isFocused ? "is-focused" : ""}`}
                    onClick={() => setFocusedAttendant(item.attendant)}
                  >
                    <div className="attendants-board-header">
                      <div className="leaderboard-rank">#{index + 1}</div>
                      <div className="attendants-board-copy">
                        <strong>{item.attendant}</strong>
                        <span>
                          {formatNumber(item.currentPeriod.uniqueCustomers)} clientes - {formatNumber(item.currentPeriod.orders)} vendas -{" "}
                          {formatPercent(activeShare(item.portfolio.totalCustomers, item.portfolio.statusCounts.ACTIVE))} da carteira ativa
                        </span>
                      </div>
                      <div className="attendants-board-growth">
                        <span>Crescimento de clientes</span>
                        <strong className={`attendants-growth ${growthClass(item.growth.uniqueCustomers)}`}>
                          {formatGrowth(item.growth.uniqueCustomers)}
                        </strong>
                      </div>
                    </div>

                    <div className="attendants-board-metrics">
                      <span>Recorrencia: {formatDecimal(repeatIntensity(item.currentPeriod.orders, item.currentPeriod.uniqueCustomers), 2)} vendas/cliente</span>
                      <span>Pecas por venda: {formatDecimal(item.currentPeriod.piecesPerOrder, 1)}</span>
                      <span>Reativar: {formatNumber(item.portfolio.statusCounts.ATTENTION + item.portfolio.statusCounts.INACTIVE)}</span>
                      <span>Carteira: {formatNumber(item.portfolio.totalCustomers)}</span>
                      <span>Ultima venda: {formatDate(item.currentPeriod.lastOrderAt)}</span>
                    </div>

                    <div className="attendants-board-actions">
                      <button
                        type="button"
                        className={`ghost-button ${isFocused ? "attendants-focus-button active" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setFocusedAttendant(item.attendant);
                        }}
                      >
                        {isFocused ? "No painel" : "Ver painel"}
                      </button>
                      <button
                        type="button"
                        className={`ghost-button ${isCompared ? "attendants-focus-button active" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedAttendants((current) => toggleComparedAttendant(current, item.attendant, 5));
                        }}
                        disabled={compareDisabled}
                      >
                        {isCompared ? "Remover do grafico" : compareDisabled ? "Limite de 5" : "Comparar"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">Nenhuma atendente encontrada para esse recorte.</div>
            )}
          </div>
        </article>

        <article className="panel attendants-focus-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Drill-down</p>
              <h3>{focusedItem?.attendant ?? "Selecione uma atendente"}</h3>
              <p className="panel-subcopy">Resumo do corte atual, carteira sob responsabilidade e os destaques do mes.</p>
            </div>
          </div>

          {focusedItem ? (
            <div className="attendants-focus-shell">
              <div className="attendants-focus-grid">
                <div className="attendants-focus-card">
                  <span>Clientes do mes</span>
                  <strong>{formatNumber(focusedItem.currentPeriod.uniqueCustomers)}</strong>
                  <p>{formatNumber(focusedItem.currentPeriod.orders)} vendas no corte atual</p>
                </div>
                <div className="attendants-focus-card">
                  <span>Recorrencia</span>
                  <strong>{formatDecimal(repeatIntensity(focusedItem.currentPeriod.orders, focusedItem.currentPeriod.uniqueCustomers), 2)}</strong>
                  <p>vendas por cliente no mes</p>
                </div>
                <div className="attendants-focus-card">
                  <span>Pecas por venda</span>
                  <strong>{formatDecimal(focusedItem.currentPeriod.piecesPerOrder, 1)}</strong>
                  <p>{formatNumber(focusedItem.currentPeriod.pieces)} pecas no corte</p>
                </div>
                <div className="attendants-focus-card">
                  <span>Pressao de reativacao</span>
                  <strong>
                    {formatPercent(
                      reactivationPressure(
                        focusedItem.portfolio.totalCustomers,
                        focusedItem.portfolio.statusCounts.ATTENTION,
                        focusedItem.portfolio.statusCounts.INACTIVE,
                      ),
                    )}
                  </strong>
                  <p>
                    {formatNumber(focusedItem.portfolio.statusCounts.ATTENTION + focusedItem.portfolio.statusCounts.INACTIVE)} clientes pedindo contato
                  </p>
                </div>
              </div>

              <div className="attendants-portfolio-card">
                <div>
                  <span className="eyebrow">Carteira atual</span>
                  <h4>{formatNumber(focusedItem.portfolio.totalCustomers)} clientes</h4>
                </div>

                <div className="attendants-portfolio-metrics">
                  <span className="status-badge status-active">
                    {formatNumber(focusedItem.portfolio.statusCounts.ACTIVE)} ativos
                  </span>
                  <span className="status-badge status-attention">
                    {formatNumber(focusedItem.portfolio.statusCounts.ATTENTION)} atencao
                  </span>
                  <span className="status-badge status-inactive">
                    {formatNumber(focusedItem.portfolio.statusCounts.INACTIVE)} inativos
                  </span>
                </div>

                <div className="attendants-board-metrics">
                  <span>Faturamento: {formatCurrency(focusedItem.currentPeriod.revenue)}</span>
                  <span>Ticket medio: {formatCurrency(focusedItem.currentPeriod.avgTicket)}</span>
                  <span>Receita por cliente: {formatCurrency(focusedItem.currentPeriod.revenuePerCustomer)}</span>
                  <span>Ultima venda: {formatDate(focusedItem.currentPeriod.lastOrderAt)}</span>
                </div>
              </div>

              <div className="attendants-focus-section">
                <div className="panel-header compact">
                  <div>
                    <p className="eyebrow">Top clientes</p>
                    <h4>Quem mais comprou no corte</h4>
                  </div>
                </div>

                {focusedItem.topCustomers.length ? (
                  <div className="attendants-customer-list">
                    {focusedItem.topCustomers.map((customer) => (
                      <article key={customer.customerId} className="attendants-customer-card">
                        <div className="attendants-customer-main">
                          <div className="attendants-customer-copy">
                            <strong>{customer.displayName}</strong>
                            <span>{customer.customerCode || "Sem codigo"}</span>
                          </div>
                          <span className={`status-badge status-${customer.status.toLowerCase()}`}>
                            {statusLabel(customer.status)}
                          </span>
                        </div>
                        <div className="attendants-board-metrics">
                          <span>{formatCurrency(customer.revenue)}</span>
                          <span>{formatNumber(customer.orders)} vendas</span>
                          <span>{formatNumber(customer.pieces)} pecas</span>
                          <span>Ultima: {formatDate(customer.lastOrderAt)}</span>
                        </div>
                        <div className="attendants-board-actions">
                          <Link className="ghost-button" to={`/clientes/${customer.customerId}`}>
                            Abrir cliente
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Sem clientes no corte atual para esta atendente.</div>
                )}
              </div>

              <div className="attendants-focus-section">
                <div className="panel-header compact">
                  <div>
                    <p className="eyebrow">Top produtos</p>
                    <h4>Mix vendido no corte</h4>
                  </div>
                </div>

                {focusedItem.topProducts.length ? (
                  <div className="ambassador-top-products">
                    {focusedItem.topProducts.map((product) => (
                      <article key={`${focusedItem.attendant}-${product.sku ?? product.itemDescription}`} className="ambassador-top-product">
                        <strong>{product.itemDescription}</strong>
                        <span>{product.sku ? `SKU ${product.sku}` : "SKU nao informado"}</span>
                        <span>
                          {formatNumber(product.totalQuantity)} pecas - {formatNumber(product.orderCount)} vendas
                        </span>
                        <span>Ultima venda: {formatDate(product.lastBoughtAt)}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Sem produtos registrados no corte atual para esta atendente.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state">Selecione uma atendente no leaderboard para abrir o drill-down.</div>
          )}
        </article>
      </section>
    </div>
  );
}


import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatNumber, formatShortDate } from "../lib/format";

const bucketFilters = {
  "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
  "15-29": { minDaysInactive: 15, maxDaysInactive: 29 },
  "30-59": { minDaysInactive: 30, maxDaysInactive: 59 },
  "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
  "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
  "180+": { minDaysInactive: 180 },
} as const;

type BucketLabel = keyof typeof bucketFilters;
type ChartView = "inactivity" | "trend";

const trendSeries = [
  {
    shareKey: "activeShare",
    countKey: "activeCount",
    label: "Ativos",
    color: "#2f9d67",
    gradientId: "trend-active-fill",
    fillOpacityStart: 0.14,
    fillOpacityEnd: 0.03,
  },
  {
    shareKey: "attentionShare",
    countKey: "attentionCount",
    label: "Atencao",
    color: "#d09a29",
    gradientId: "trend-attention-fill",
    fillOpacityStart: 0.12,
    fillOpacityEnd: 0.025,
  },
  {
    shareKey: "inactiveShare",
    countKey: "inactiveCount",
    label: "Inativos",
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

  if (label === "0-14" || label === "15-29") {
    return "#a8c1ff";
  }

  if (label === "30-59" || label === "60-89") {
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

  if (label === "15-29") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "30-59") {
    return "Faixa de transicao: no dia 30 ainda pode estar Ativo; de 31 a 59 entra em Atencao.";
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
                <span className="trend-tooltip-dot" style={{ backgroundColor: entry?.color ?? line.color }} />
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

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(token!),
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

  return (
    <div className="page-stack">
      <section className="hero-panel dashboard-hero">
        <div className="hero-copy">
          <p className="eyebrow">Operacao comercial</p>
          <h2>Prioridades de contato e saude da carteira</h2>
          <p>Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada.</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/agenda">
              Abrir agenda do dia
            </Link>
            <button className="ghost-button" type="button" disabled={isSyncing} onClick={handleSync}>
              {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
            </button>
          </div>
        </div>

        <div className="hero-meta">
          <div className="hero-meta-item">
            <span>Ultima sincronizacao</span>
            <strong>
              {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString("pt-BR") : "Sincronizacao pendente"}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Frequencia media</span>
            <strong>{metrics.averageFrequencyDays.toFixed(1)} dias</strong>
          </div>
          <div className="hero-meta-item">
            <span>Agenda acionavel</span>
            <strong>{formatNumber(metrics.agendaEligibleCount)} clientes</strong>
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
        <StatCard title="Frequencia media" value={`${metrics.averageFrequencyDays.toFixed(1)} dias`} helper="Intervalo medio entre pedidos" />
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
                    margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis dataKey="label" stroke="#5f6f95" />
                    <Tooltip content={<InactivityTooltip />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor="pointer">
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
          ) : (
            <>
              <div className="trend-toolbar">
                <div className="trend-toolbar-copy">
                  <strong>Leitura diaria em percentual</strong>
                  <span>
                    Cada faixa representa a participacao de um status. Todo dia fecha em 100% da carteira para deixar a saude da
                    base evidente.
                  </span>
                  {latestTrendPoint ? (
                    <small className="trend-toolbar-meta">
                      Ultimo dia: {formatShortDate(latestTrendPoint.date)} com {formatNumber(latestTrendPoint.totalCustomers)} clientes na
                      base.
                    </small>
                  ) : null}
                </div>
              </div>
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
                    <span className="trend-legend-dot" style={{ backgroundColor: series.color }} />
                    {series.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="panel insight-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Agenda de hoje</p>
              <h3>{formatNumber(metrics.agendaEligibleCount)} clientes pedem contato agora</h3>
              <p className="panel-subcopy">Fila pronta para a vendedora agir sem sair da tela inicial.</p>
            </div>
            <Link className="ghost-button" to="/agenda">
              Ver agenda completa
            </Link>
          </div>

          {agendaQuery.isLoading ? <div className="page-loading">Montando fila de contato...</div> : null}
          {agendaQuery.isError ? <div className="page-error">Nao foi possivel carregar a agenda de hoje.</div> : null}
          {!agendaQuery.isLoading && !agendaQuery.isError ? (
            agendaItems.length ? (
              <div className="stack-list agenda-scroll-list">
                {agendaItems.map((customer) => (
                  <ContactQueueCard key={customer.id} item={customer} compact />
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum cliente precisa de contato imediato neste momento.</div>
            )
          ) : null}
        </article>
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

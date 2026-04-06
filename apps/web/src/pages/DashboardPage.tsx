import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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
type TrendGranularity = "daily" | "monthly";

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
    eyebrow: "Tendencia da carteira",
    title: "Evolucao diaria da base",
    description:
      "Acompanhe dia a dia quantos clientes estao ativos, em atencao, inativos e como o total da base evoluiu nos ultimos 90 dias.",
    toggleLabel: "Evolucao da base",
    toggleHelper: "Compare as linhas de status com o crescimento da carteira.",
  },
} as const;

const shortMonthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const longMonthNames = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function extractTrendParts(value: string) {
  const monthlyMatch = value.match(/^(\d{4})-(\d{2})$/);
  if (monthlyMatch) {
    return {
      year: monthlyMatch[1],
      month: Number(monthlyMatch[2]),
      day: null,
    };
  }

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

function formatTrendAxisLabel(value: string, granularity: TrendGranularity) {
  const parts = extractTrendParts(value);
  if (!parts) {
    return "--";
  }

  const safeYear = parts.year ?? "0000";
  const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));

  if (granularity === "monthly") {
    return `${shortMonthNames[safeMonth - 1]}/${safeYear.slice(2)}`;
  }

  return `${String(parts.day ?? 0).padStart(2, "0")}/${String(safeMonth).padStart(2, "0")}`;
}

function formatTrendTooltipLabel(value: string, granularity: TrendGranularity) {
  const parts = extractTrendParts(value);
  if (!parts) {
    return "--";
  }

  const safeYear = parts.year ?? "0000";
  const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));

  if (granularity === "monthly") {
    return `Fechamento de ${longMonthNames[safeMonth - 1]} de ${safeYear}`;
  }

  return formatDate(value);
}

function groupTrendByMonth(points: PortfolioTrendPoint[]) {
  const grouped = new Map<string, PortfolioTrendPoint>();

  for (const point of points) {
    grouped.set(point.date.slice(0, 7), point);
  }

  return Array.from(grouped.entries()).map(([monthKey, point]) => ({
    ...point,
    date: monthKey,
  }));
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
  granularity,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
  granularity: TrendGranularity;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const lines = [
    { key: "activeCount", label: "Ativos" },
    { key: "attentionCount", label: "Atencao" },
    { key: "inactiveCount", label: "Inativos" },
    { key: "totalCustomers", label: "Total da base" },
  ];

  return (
    <div className="chart-tooltip trend-tooltip">
      <strong>{formatTrendTooltipLabel(label, granularity)}</strong>
      <div className="trend-tooltip-list">
        {lines.map((line) => {
          const point = payload.find((entry) => entry.dataKey === line.key);
          return (
            <div key={line.key} className="trend-tooltip-item">
              <span>{line.label}</span>
              <strong>{formatNumber(point?.value ?? 0)}</strong>
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
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>("daily");
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
  const trendData = trendGranularity === "monthly" ? groupTrendByMonth(metrics.portfolioTrend) : metrics.portfolioTrend;
  const chartDescription =
    chartView === "trend" && trendGranularity === "monthly"
      ? "Veja o fechamento consolidado de cada mes para comparar a direcao da carteira sem o ruido do dia a dia."
      : activeChartCopy.description;
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
                  <strong>{trendGranularity === "daily" ? "Leitura diaria" : "Fechamento mensal"}</strong>
                  <span>
                    {trendGranularity === "daily"
                      ? "Ideal para acompanhar viradas recentes de status e pequenas oscilacoes da base."
                      : "Ideal para ver a direcao geral do mes e comparar a carteira com menos ruido."}
                  </span>
                </div>
                <div className="trend-granularity-toggle" role="tablist" aria-label="Alternar periodo do grafico de evolucao">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={trendGranularity === "daily"}
                    className={`trend-granularity-button ${trendGranularity === "daily" ? "active" : ""}`}
                    onClick={() => setTrendGranularity("daily")}
                  >
                    Dia
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={trendGranularity === "monthly"}
                    className={`trend-granularity-button ${trendGranularity === "monthly" ? "active" : ""}`}
                    onClick={() => setTrendGranularity("monthly")}
                  >
                    Mes
                  </button>
                </div>
              </div>
              <div className="trend-chart-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendData} margin={{ top: 12, right: 8, left: -12, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => formatTrendAxisLabel(String(value), trendGranularity)}
                      stroke="#5f6f95"
                      minTickGap={trendGranularity === "monthly" ? 0 : 24}
                    />
                    <YAxis stroke="#5f6f95" />
                    <Tooltip content={<TrendTooltip granularity={trendGranularity} />} />
                    <Legend />
                    <Line type="monotone" dataKey="activeCount" name="Ativos" stroke="#2f9d67" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="attentionCount" name="Atencao" stroke="#d09a29" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="inactiveCount" name="Inativos" stroke="#d9534f" strokeWidth={2.4} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="totalCustomers"
                      name="Total da base"
                      stroke="#2956d7"
                      strokeWidth={2.2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
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

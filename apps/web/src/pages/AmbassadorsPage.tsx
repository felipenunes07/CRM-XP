import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AmbassadorListItem, InsightTag } from "@olist-crm/shared";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber, statusLabel } from "../lib/format";

type ChartMetric = "revenue" | "orders" | "pieces";
type SortKey = "revenue" | "growth" | "recency" | "priority" | "name";
type TrendWindow = 6 | 12 | 24;

const alertLabels: Record<string, string> = {
  sem_pedido_no_mes: "Sem pedido no mes",
  queda_vs_mes_anterior: "Queda vs mes anterior",
  atencao: "Atencao",
  inativo: "Inativo",
  compra_prevista_vencida: "Compra prevista vencida",
};

const insightLabels: Record<InsightTag, string> = {
  alto_valor: "Alto valor",
  reativacao: "Reativacao",
  recorrente: "Recorrente",
  queda_frequencia: "Queda de frequencia",
  risco_churn: "Risco de churn",
  compra_prevista_vencida: "Compra prevista vencida",
  novo_cliente: "Novo cliente",
};

function formatMonthLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const year = match?.[1];
  const month = match?.[2];

  if (!year || !month) {
    return value;
  }

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

function growthTone(value: number | null) {
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

function primaryInsightLabel(ambassador: AmbassadorListItem) {
  if (!ambassador.primaryInsight) {
    return "Sem sinal dominante";
  }

  return insightLabels[ambassador.primaryInsight];
}

function ambassadorFocusTone(ambassador: AmbassadorListItem) {
  if (ambassador.alerts.includes("sem_pedido_no_mes") || ambassador.status === "INACTIVE") {
    return "danger";
  }

  if (
    ambassador.status === "ATTENTION" ||
    ambassador.alerts.includes("queda_vs_mes_anterior") ||
    ambassador.alerts.includes("compra_prevista_vencida")
  ) {
    return "warning";
  }

  return "success";
}

function ambassadorFocusSummary(ambassador: AmbassadorListItem) {
  if (ambassador.alerts.includes("sem_pedido_no_mes")) {
    return "Ainda nao comprou na janela atual. Vale contato proativo neste corte.";
  }

  if (ambassador.status === "INACTIVE") {
    return "Ja saiu da zona ativa. Precisa reengajar antes de perder recorrencia.";
  }

  if (ambassador.status === "ATTENTION") {
    return "Entrou em monitoramento. O ideal e agir antes de virar inativo.";
  }

  if ((ambassador.revenueGrowthRatio ?? 0) <= -0.15) {
    return "Comprou menos do que no corte anterior e merece revisao de rotina.";
  }

  if ((ambassador.revenueGrowthRatio ?? 0) >= 0.15) {
    return "Vem acelerando no corte atual e pode puxar volume adicional.";
  }

  return "Segue estavel, sem alerta critico no momento.";
}

function ambassadorFocusHeadline(ambassador: AmbassadorListItem) {
  if (ambassador.alerts.includes("sem_pedido_no_mes") || ambassador.status === "INACTIVE") {
    return "Risco de esfriar";
  }

  if (
    ambassador.status === "ATTENTION" ||
    ambassador.alerts.includes("queda_vs_mes_anterior") ||
    ambassador.alerts.includes("compra_prevista_vencida")
  ) {
    return "Pede acompanhamento";
  }

  if ((ambassador.revenueGrowthRatio ?? 0) >= 0.15) {
    return "Boa tracao no corte";
  }

  return "Relacao saudavel";
}

function statusClass(status: AmbassadorListItem["status"]) {
  if (status === "ACTIVE") {
    return "status-active";
  }

  if (status === "ATTENTION") {
    return "status-attention";
  }

  return "status-inactive";
}

function metricValue(item: AmbassadorListItem, sortKey: SortKey) {
  switch (sortKey) {
    case "growth":
      return item.revenueGrowthRatio ?? Number.NEGATIVE_INFINITY;
    case "recency":
      return item.daysSinceLastPurchase ?? Number.POSITIVE_INFINITY;
    case "priority":
      return item.priorityScore;
    case "name":
      return item.displayName.toLocaleLowerCase("pt-BR");
    case "revenue":
    default:
      return item.currentPeriodRevenue;
  }
}

function chartMetricLabel(metric: ChartMetric) {
  if (metric === "orders") {
    return "Pedidos";
  }

  if (metric === "pieces") {
    return "Pecas";
  }

  return "Faturamento";
}

function chartMetricColor(metric: ChartMetric) {
  if (metric === "orders") {
    return "#5f8cff";
  }

  if (metric === "pieces") {
    return "#2f9d67";
  }

  return "#2956d7";
}

function AmbassadorTrendTooltip({
  active,
  payload,
  label,
  metric,
  subjectLabel,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  metric: ChartMetric;
  subjectLabel: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const value = payload[0]?.value ?? 0;

  return (
    <div className="chart-tooltip">
      <strong>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count">
        <strong>{metric === "revenue" ? formatCurrency(value) : formatNumber(value)}</strong>
        <span>
          {chartMetricLabel(metric)} de {subjectLabel}
        </span>
      </div>
      <p>Historico mensal de desempenho. Troque o embaixador acima para atualizar essa leitura.</p>
    </div>
  );
}

export function AmbassadorsPage() {
  const { token } = useAuth();
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(12);
  const [selectedAmbassadorId, setSelectedAmbassadorId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [alertFilter, setAlertFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");

  const ambassadorsQuery = useQuery({
    queryKey: ["ambassadors"],
    queryFn: () => api.ambassadors(token!),
    enabled: Boolean(token),
  });

  const data = ambassadorsQuery.data;
  const allAmbassadors = data?.ambassadors ?? [];

  const selectableAmbassadors = useMemo(
    () =>
      [...allAmbassadors].sort((left, right) => {
        const revenueDiff = right.currentPeriodRevenue - left.currentPeriodRevenue;
        if (revenueDiff !== 0) {
          return revenueDiff;
        }

        return left.displayName.localeCompare(right.displayName, "pt-BR");
      }),
    [allAmbassadors],
  );

  const ambassadors = useMemo(() => {
    return [...allAmbassadors]
      .filter((item) => {
        if (search.trim()) {
          const haystack = `${item.displayName} ${item.customerCode}`.toLocaleLowerCase("pt-BR");
          if (!haystack.includes(search.trim().toLocaleLowerCase("pt-BR"))) {
            return false;
          }
        }

        if (statusFilter && item.status !== statusFilter) {
          return false;
        }

        if (alertFilter && !item.alerts.includes(alertFilter)) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftValue = metricValue(left, sortKey);
        const rightValue = metricValue(right, sortKey);

        if (typeof leftValue === "string" && typeof rightValue === "string") {
          return leftValue.localeCompare(rightValue, "pt-BR");
        }

        return Number(rightValue) - Number(leftValue);
      });
  }, [alertFilter, allAmbassadors, search, sortKey, statusFilter]);

  useEffect(() => {
    if (!selectableAmbassadors.length) {
      if (selectedAmbassadorId) {
        setSelectedAmbassadorId("");
      }
      return;
    }

    const firstAmbassador = selectableAmbassadors[0];
    const hasSelected = selectableAmbassadors.some((item) => item.id === selectedAmbassadorId);
    if ((!selectedAmbassadorId || !hasSelected) && firstAmbassador) {
      setSelectedAmbassadorId(firstAmbassador.id);
    }
  }, [selectableAmbassadors, selectedAmbassadorId]);

  if (ambassadorsQuery.isLoading) {
    return <div className="page-loading">Carregando aba de embaixadores...</div>;
  }

  if (ambassadorsQuery.isError || !data) {
    return <div className="page-error">Nao foi possivel carregar os embaixadores.</div>;
  }

  const { summary, monthlyTrend } = data;
  const selectedAmbassador = selectableAmbassadors.find((item) => item.id === selectedAmbassadorId) ?? selectableAmbassadors[0] ?? null;
  const activeTrendDataFull = selectedAmbassador?.monthlyTrend?.length ? selectedAmbassador.monthlyTrend : monthlyTrend;
  const activeTrendData = activeTrendDataFull.slice(-trendWindow);
  const activeTrendLabel = selectedAmbassador ? selectedAmbassador.displayName : "a carteira";
  const overviewItems = [
    {
      label: "Carteira atual",
      value: `${formatNumber(summary.totalAmbassadors)} embaixadores`,
      detail: `${formatNumber(summary.statusCounts.ACTIVE)} ativos, ${formatNumber(summary.statusCounts.ATTENTION)} em atencao, ${formatNumber(summary.statusCounts.INACTIVE)} inativos.`,
      tone: "neutral",
    },
    {
      label: "Faturamento do corte",
      value: formatCurrency(summary.currentPeriodRevenue),
      detail: `${formatNumber(summary.currentPeriodOrders)} pedidos e ${formatNumber(summary.currentPeriodPieces)} pecas na janela atual.`,
      tone: "neutral",
    },
    {
      label: "Peças compradas",
      value: formatNumber(summary.currentPeriodPieces),
      detail: `${formatDate(summary.currentPeriodStart)} a ${formatDate(summary.currentPeriodEnd)}.`,
      tone: "neutral",
    },
    {
      label: "Crescimento",
      value: formatGrowth(summary.revenueGrowthRatio),
      detail: `Base anterior: ${formatCurrency(summary.previousPeriodRevenue)}.`,
      tone: growthTone(summary.revenueGrowthRatio),
    },
    {
      label: "Sem pedido no corte",
      value: formatNumber(summary.withoutOrdersThisMonth),
      detail: "Embaixadores que ainda nao compraram nesta janela.",
      tone: summary.withoutOrdersThisMonth ? "warning" : "success",
    },
  ];
  const selectedAmbassadorMetrics = selectedAmbassador
    ? [
        {
          label: "Faturamento no corte",
          value: formatCurrency(selectedAmbassador.currentPeriodRevenue),
          detail: `Anterior: ${formatCurrency(selectedAmbassador.previousPeriodRevenue)}`,
          tone: "neutral",
        },
        {
          label: "Crescimento",
          value: formatGrowth(selectedAmbassador.revenueGrowthRatio),
          detail: selectedAmbassador.revenueGrowthRatio === null ? "Sem base comparavel" : "vs corte anterior",
          tone: growthTone(selectedAmbassador.revenueGrowthRatio),
        },
        {
          label: "Pedidos no corte",
          value: formatNumber(selectedAmbassador.currentPeriodOrders),
          detail: selectedAmbassador.currentPeriodOrders
            ? `Ticket atual: ${formatCurrency(selectedAmbassador.currentPeriodRevenue / selectedAmbassador.currentPeriodOrders)}`
            : "Sem pedidos nesta janela",
          tone: selectedAmbassador.currentPeriodOrders ? "neutral" : "warning",
        },
        {
          label: "Pecas no corte",
          value: formatNumber(selectedAmbassador.currentPeriodPieces),
          detail: "Volume comprado na janela atual",
          tone: "neutral",
        },
        {
          label: "Recencia",
          value: formatDaysSince(selectedAmbassador.daysSinceLastPurchase),
          detail: `Ultima compra: ${formatDate(selectedAmbassador.lastPurchaseAt)}`,
          tone:
            selectedAmbassador.status === "ACTIVE"
              ? "success"
              : selectedAmbassador.status === "ATTENTION"
                ? "warning"
                : "danger",
        },
        {
          label: "Historico total",
          value: formatCurrency(selectedAmbassador.totalSpent),
          detail: `Ticket medio historico: ${formatCurrency(selectedAmbassador.avgTicket)}`,
          tone: "neutral",
        },
      ]
    : [];

  return (
    <div className="page-stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: '0.2rem' }}>Clientes chave</p>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Embaixadores da empresa</h2>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Janela atual</span>
            <strong style={{ fontSize: '0.85rem' }}>{formatDate(summary.currentPeriodStart)} - {formatDate(summary.currentPeriodEnd)}</strong>
          </div>
          <div style={{ background: 'var(--panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Comparacao</span>
            <strong style={{ fontSize: '0.85rem' }}>{formatDate(summary.previousPeriodStart)} - {formatDate(summary.previousPeriodEnd)}</strong>
          </div>
          <div style={{ background: 'var(--panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Cohort atual</span>
            <strong style={{ fontSize: '0.85rem' }}>{formatNumber(summary.totalAmbassadors)} embaixadores</strong>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {overviewItems.map((item) => (
          <div key={item.label} className={`stat-card tone-${item.tone}`}>
            <div className="stat-card-header">
              <h3 className="stat-card-title">{item.label}</h3>
            </div>
            <div className="stat-card-body">
              <strong>{item.value}</strong>
              <p className="stat-card-helper">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-two dashboard-grid" style={{ alignItems: "flex-start", marginTop: "1rem" }}>
        
        {/* LEFT COLUMN: Charts & Selected Focus */}
        <div className="page-stack">
          {selectedAmbassador && (
             <section className="panel" style={{ padding: '1.25rem' }}>
                <div className="panel-header" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedAmbassador.displayName}</h3>
                    <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.4rem', alignItems: 'center' }}>
                      <span className={`status-badge ${statusClass(selectedAmbassador.status)}`}>{statusLabel(selectedAmbassador.status)}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{selectedAmbassador.customerCode || "Sem codigo"}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Link className="ghost-button" to={`/clientes/${selectedAmbassador.id}`} style={{ padding: '0.4rem 1rem' }}>Abrir perfil</Link>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', background: 'var(--line)', padding: '1rem', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Faturamento atual</span>
                       <strong style={{ fontSize: '1.1rem' }}>{formatCurrency(selectedAmbassador.currentPeriodRevenue)}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Crescimento</span>
                       <strong style={{ fontSize: '1.1rem', color: ambassadorFocusTone(selectedAmbassador) === 'success' ? 'var(--success)' : 'inherit' }}>{formatGrowth(selectedAmbassador.revenueGrowthRatio)}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Pedidos no corte</span>
                       <strong style={{ fontSize: '1.1rem' }}>{formatNumber(selectedAmbassador.currentPeriodOrders)}</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Recencia</span>
                       <strong style={{ fontSize: '1.1rem' }}>{formatDaysSince(selectedAmbassador.daysSinceLastPurchase)}</strong>
                    </div>
                </div>
             </section>
          )}

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Historico mensal</p>
                <h3>{selectedAmbassador ? `Tendencia de ${selectedAmbassador.displayName}` : "Tendencia mensal"}</h3>
              </div>
              <div className="ambassador-chart-controls" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="ambassador-chart-toggle" role="tablist">
                  {(["revenue", "orders", "pieces"] as ChartMetric[]).map((metric) => (
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
                
                <div style={{ width: '1px', height: '24px', background: 'var(--line)' }} />

                <div className="ambassador-range-toggle" role="tablist">
                  {([6, 12, 24] as TrendWindow[]).map((windowSize) => (
                    <button
                      key={windowSize}
                      type="button"
                      className={`ambassador-range-button ${trendWindow === windowSize ? "active" : ""}`}
                      onClick={() => setTrendWindow(windowSize)}
                    >
                      {windowSize}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="trend-chart-wrap">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={activeTrendData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(value) => formatMonthLabel(String(value))} stroke="#5f6f95" minTickGap={trendWindow === 24 ? 18 : 8} />
                  <YAxis stroke="#5f6f95" tickFormatter={(value) => formatNumber(Number(value))} />
                  <Tooltip content={<AmbassadorTrendTooltip metric={chartMetric} subjectLabel={activeTrendLabel} />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                  <Bar dataKey={chartMetric} fill={chartMetricColor(chartMetric)} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Filter & List */}
        <section className="panel search-sidebar">
          <div className="panel-header" style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Encontrar Embaixador</h3>
          </div>
          
          <div className="search-container">
            <div className="search-input-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input 
                 value={search} 
                 onChange={(event) => setSearch(event.target.value)} 
                 placeholder="Nome ou codigo..." 
              />
            </div>
            
            <div className="filter-row">
                <select 
                   className="filter-select"
                   value={statusFilter} 
                   onChange={(event) => setStatusFilter(event.target.value)} 
                >
                  <option value="">Status</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="ATTENTION">Atencao</option>
                  <option value="INACTIVE">Inativos</option>
                </select>
                <select 
                   className="filter-select"
                   value={sortKey} 
                   onChange={(event) => setSortKey(event.target.value as SortKey)} 
                >
                  <option value="revenue">Vendas</option>
                  <option value="growth">Crescimento</option>
                  <option value="recency">Recencia</option>
                </select>
            </div>
          </div>

          <div className="ambassador-list">
            {ambassadors.length ? ambassadors.map((ambassador) => (
              <article 
                key={ambassador.id} 
                onClick={() => setSelectedAmbassadorId(ambassador.id)}
                className={`ambassador-item-card ${selectedAmbassador?.id === ambassador.id ? 'selected' : ''}`}
              >
                <div className="ambassador-item-card-header">
                  <div className="ambassador-item-name">{ambassador.displayName}</div>
                  <div className="ambassador-item-revenue">{formatCurrency(ambassador.currentPeriodRevenue)}</div>
                </div>
                <div className="ambassador-item-footer">
                    <span className={`status-badge ${statusClass(ambassador.status)}`} style={{ padding: '0.15rem 0.5rem', fontSize: '0.65rem' }}>{statusLabel(ambassador.status)}</span>
                    <span className="ambassador-item-growth">Crescem: <strong>{formatGrowth(ambassador.revenueGrowthRatio)}</strong></span>
                </div>
              </article>
            )) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', gap: '1rem', opacity: 0.6 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span style={{ fontSize: '0.9rem' }}>Nenhum embaixador encontrado</span>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

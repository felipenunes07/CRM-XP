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
      <p>Historico mensal fechado. Troque o embaixador acima para atualizar essa leitura.</p>
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
      label: "Ticket medio",
      value: formatCurrency(summary.currentPeriodAvgTicket),
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
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Clientes chave</p>
          <h2>Embaixadores da empresa</h2>
          <p>
            Acompanhe de perto quem a chefia definiu como {AMBASSADOR_LABEL_NAME.toLowerCase()} e veja se essa carteira
            esta comprando mais, crescendo e puxando volume com a XP.
          </p>
        </div>
        <div className="hero-meta">
          <div className="hero-meta-item">
            <span>Janela atual</span>
            <strong>
              {formatDate(summary.currentPeriodStart)} a {formatDate(summary.currentPeriodEnd)}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Comparacao</span>
            <strong>
              {formatDate(summary.previousPeriodStart)} a {formatDate(summary.previousPeriodEnd)}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Cohort atual</span>
            <strong>{formatNumber(summary.totalAmbassadors)} embaixadores</strong>
          </div>
        </div>
      </section>

      <section className="panel ambassador-overview-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Resumo da carteira</p>
            <h3>O que importa neste corte</h3>
            <p className="panel-subcopy">Visao do grupo inteiro para saber tamanho, faturamento e risco da carteira de embaixadores.</p>
          </div>
        </div>

        <div className="ambassador-overview-grid">
          {overviewItems.map((item) => (
            <article key={item.label} className={`ambassador-overview-item tone-${item.tone}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel ambassador-focus-panel">
        <div className="ambassador-focus-toolbar">
          <div>
            <p className="eyebrow">Embaixador selecionado</p>
            <h3>{selectedAmbassador ? selectedAmbassador.displayName : "Selecione um embaixador"}</h3>
            <p className="panel-subcopy">Ao trocar o nome, esse resumo e o grafico mensal abaixo atualizam juntos.</p>
          </div>
          <div className="ambassador-focus-controls">
            <label className="ambassador-focus-select">
              Embaixador
              <select
                value={selectedAmbassador?.id ?? ""}
                onChange={(event) => setSelectedAmbassadorId(event.target.value)}
                disabled={!selectableAmbassadors.length}
              >
                {selectableAmbassadors.map((ambassador) => (
                  <option key={ambassador.id} value={ambassador.id}>
                    {ambassador.displayName} {ambassador.customerCode ? `| ${ambassador.customerCode}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedAmbassador ? (
              <Link className="ghost-button" to={`/clientes/${selectedAmbassador.id}`}>
                Abrir cliente
              </Link>
            ) : null}
          </div>
        </div>

        {selectedAmbassador ? (
          <div className="ambassador-focus-shell">
            <div className="ambassador-focus-summary">
              <div className="ambassador-focus-identity">
                <div className="ambassador-focus-copy">
                  <div className="ambassador-title-row">
                    <strong>{selectedAmbassador.displayName}</strong>
                    <span className={`status-badge ${statusClass(selectedAmbassador.status)}`}>{statusLabel(selectedAmbassador.status)}</span>
                  </div>
                  <span>
                    {selectedAmbassador.customerCode || "Sem codigo"} | Embaixador desde {formatDate(selectedAmbassador.ambassadorAssignedAt)}
                  </span>
                  <span>Ultima atendente: {selectedAmbassador.lastAttendant ?? "Nao informado"}</span>
                </div>
              </div>
              <div className={`ambassador-focus-note tone-${ambassadorFocusTone(selectedAmbassador)}`}>
                <span>Leitura rapida</span>
                <strong>{ambassadorFocusHeadline(selectedAmbassador)}</strong>
                <p>{ambassadorFocusSummary(selectedAmbassador)}</p>
              </div>
            </div>

            <div className="tag-row compact ambassador-focus-tags">
              <span className="tag ambassador-insight-tag">{primaryInsightLabel(selectedAmbassador)}</span>
              <span className="tag ambassador-tag">
                Prioridade {formatNumber(selectedAmbassador.priorityScore)}
              </span>
              <span className="tag ambassador-tag">
                Valor {formatCurrency(selectedAmbassador.totalSpent)}
              </span>
              {selectedAmbassador.alerts.length ? (
                selectedAmbassador.alerts.map((alert) => (
                  <span key={alert} className="tag ambassador-alert-tag">
                    {alertLabels[alert] ?? alert}
                  </span>
                ))
              ) : (
                <span className="muted-copy">Sem alertas no momento.</span>
              )}
            </div>

            <div className="ambassador-focus-metrics">
              {selectedAmbassadorMetrics.map((metric) => (
                <article key={metric.label} className={`ambassador-focus-metric tone-${metric.tone}`}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <p>{metric.detail}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state">Nenhum embaixador disponivel para esse recorte.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Historico mensal</p>
            <h3>{selectedAmbassador ? `Tendencia de ${selectedAmbassador.displayName}` : "Tendencia mensal da carteira"}</h3>
            <p className="panel-subcopy">
              {selectedAmbassador
                ? "Esse grafico acompanha o embaixador selecionado acima e troca assim que voce muda o nome."
                : "Historico mensal da carteira inteira de embaixadores."}{" "}
              Janela atual: ultimos {trendWindow} meses fechados.
            </p>
          </div>
          <div className="ambassador-chart-controls">
            <div className="ambassador-chart-toggle" role="tablist" aria-label="Selecionar metrica do grafico">
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
            <div className="ambassador-range-toggle" role="tablist" aria-label="Selecionar janela de tempo">
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
              <XAxis
                dataKey="month"
                tickFormatter={(value) => formatMonthLabel(String(value))}
                stroke="#5f6f95"
                minTickGap={trendWindow === 24 ? 18 : 8}
              />
              <YAxis stroke="#5f6f95" tickFormatter={(value) => formatNumber(Number(value))} />
              <Tooltip
                content={<AmbassadorTrendTooltip metric={chartMetric} subjectLabel={activeTrendLabel} />}
                cursor={{ fill: "rgba(41, 86, 215, 0.04)" }}
              />
              <Bar dataKey={chartMetric} fill={chartMetricColor(chartMetric)} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Carteira monitorada</p>
            <h3>Quem esta crescendo, parado ou pedindo atencao</h3>
            <p className="panel-subcopy">Use os filtros para encontrar um nome e clique em "Ver no painel" para atualizar o resumo acima.</p>
          </div>
        </div>

        <div className="filters-grid filters-grid-four ambassador-filters">
          <label>
            Buscar
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou codigo" />
          </label>

          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="ATTENTION">Atencao</option>
              <option value="INACTIVE">Inativos</option>
            </select>
          </label>

          <label>
            Alerta
            <select value={alertFilter} onChange={(event) => setAlertFilter(event.target.value)}>
              <option value="">Todos</option>
              <option value="sem_pedido_no_mes">Sem pedido no mes</option>
              <option value="queda_vs_mes_anterior">Queda vs mes anterior</option>
              <option value="atencao">Atencao</option>
              <option value="inativo">Inativo</option>
              <option value="compra_prevista_vencida">Compra prevista vencida</option>
            </select>
          </label>

          <label>
            Ordenar por
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              <option value="revenue">Faturamento do mes</option>
              <option value="growth">Crescimento</option>
              <option value="recency">Recencia</option>
              <option value="priority">Prioridade</option>
              <option value="name">Nome</option>
            </select>
          </label>
        </div>

        {ambassadors.length ? (
          <div className="ambassador-card-list">
            {ambassadors.map((ambassador) => (
              <article key={ambassador.id} className={`ambassador-card ${selectedAmbassador?.id === ambassador.id ? "is-selected" : ""}`}>
                <div className="ambassador-card-top">
                  <div className="ambassador-card-copy">
                    <div className="ambassador-title-row">
                      <strong>{ambassador.displayName}</strong>
                      <span className={`status-badge ${statusClass(ambassador.status)}`}>{statusLabel(ambassador.status)}</span>
                    </div>
                    <span>
                      {ambassador.customerCode || "Sem codigo"} | Embaixador desde {formatDate(ambassador.ambassadorAssignedAt)}
                    </span>
                  </div>
                  <div className="ambassador-card-actions">
                    <button
                      type="button"
                      className={`ghost-button ambassador-select-button ${selectedAmbassador?.id === ambassador.id ? "active" : ""}`}
                      onClick={() => setSelectedAmbassadorId(ambassador.id)}
                    >
                      {selectedAmbassador?.id === ambassador.id ? "No painel" : "Ver no painel"}
                    </button>
                    <Link className="ghost-button" to={`/clientes/${ambassador.id}`}>
                      Abrir cliente
                    </Link>
                  </div>
                </div>

                <div className="ambassador-metric-strip">
                  <span>Faturamento no mes: {formatCurrency(ambassador.currentPeriodRevenue)}</span>
                  <span>Crescimento: {formatGrowth(ambassador.revenueGrowthRatio)}</span>
                  <span>Pedidos no mes: {formatNumber(ambassador.currentPeriodOrders)}</span>
                  <span>Pecas no mes: {formatNumber(ambassador.currentPeriodPieces)}</span>
                  <span>Total historico: {formatCurrency(ambassador.totalSpent)}</span>
                  <span>Ticket medio: {formatCurrency(ambassador.avgTicket)}</span>
                  <span>Ultima compra: {formatDate(ambassador.lastPurchaseAt)}</span>
                  <span>Recencia: {formatDaysSince(ambassador.daysSinceLastPurchase)}</span>
                  <span>Ultima atendente: {ambassador.lastAttendant ?? "Nao informado"}</span>
                </div>

                <div className="ambassador-card-section">
                  <strong>Alertas</strong>
                  <div className="tag-row compact">
                    {ambassador.alerts.length ? (
                      ambassador.alerts.map((alert) => (
                        <span key={alert} className="tag ambassador-alert-tag">
                          {alertLabels[alert] ?? alert}
                        </span>
                      ))
                    ) : (
                      <span className="muted-copy">Sem alertas no momento.</span>
                    )}
                  </div>
                </div>

                <div className="ambassador-card-section">
                  <strong>Top 3 produtos mais comprados</strong>
                  {ambassador.topProducts.length ? (
                    <div className="ambassador-top-products">
                      {ambassador.topProducts.map((product) => (
                        <div key={`${ambassador.id}-${product.sku ?? product.itemDescription}`} className="ambassador-top-product">
                          <strong>{product.itemDescription}</strong>
                          <span>{product.sku ? `SKU ${product.sku}` : "SKU nao informado"}</span>
                          <span>
                            {formatNumber(product.totalQuantity)} pecas | {formatNumber(product.orderCount)} pedidos
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="muted-copy">Ainda nao ha historico suficiente para montar o mix.</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Nenhum embaixador encontrado para esse recorte.</div>
        )}
      </section>
    </div>
  );
}

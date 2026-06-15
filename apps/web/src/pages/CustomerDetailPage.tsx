import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import type { CustomerDetail, InsightTag } from "@olist-crm/shared";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoaderCircle, CheckCircle2 } from "lucide-react";
import { InfoHint } from "../components/InfoHint";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import {
  formatCurrency,
  formatDate,
  formatDaysSince,
  formatPercent,
  formatNumber,
  statusLabel,
} from "../lib/format";

type ChartMetric = "revenue" | "orders" | "pieces";
type TrendWindow = 6 | 12 | 24;

const insightLabels: Record<InsightTag, string> = {
  alto_valor: "Alto valor",
  reativacao: "Reativacao",
  recorrente: "Recorrente",
  queda_frequencia: "Queda de frequencia",
  risco_churn: "Risco de churn",
  compra_prevista_vencida: "Compra prevista vencida",
  novo_cliente: "Novo cliente",
};

function insightExplanation(tag: InsightTag, customer: CustomerDetail) {
  switch (tag) {
    case "risco_churn":
      return `Considera queda de frequencia a partir de 50% entre os ultimos 90 dias e os 90 dias anteriores, com o cliente ja fora do status ativo. Hoje a queda estimada e ${formatPercent(customer.frequencyDropRatio)}.`;
    case "queda_frequencia":
      return `O ritmo de compra caiu na comparacao entre os ultimos 90 dias e a janela anterior. A queda atual estimada e ${formatPercent(customer.frequencyDropRatio)}.`;
    case "reativacao":
      return "Cliente esta inativo e vale abordagem de retorno, principalmente quando ja teve boa recorrencia ou bom historico de compra.";
    case "recorrente":
      return "Cliente ativo, com intervalo medio de compra curto e sem queda relevante de frequencia.";
    case "alto_valor":
      return "Cliente com gasto total acima da faixa alta da base. Merece prioridade de relacionamento.";
    case "compra_prevista_vencida":
      return "A previsao simples da proxima compra usa a media de dias corridos entre pedidos. Quando essa data passa e nao entra pedido novo, o cliente sobe de prioridade.";
    case "novo_cliente":
      return "Cliente recente, com ate 2 pedidos e compra nos ultimos 30 dias.";
    default:
      return "Insight calculado automaticamente com base em recencia, frequencia e valor.";
  }
}

function primaryInsightLabel(customer: CustomerDetail) {
  if (!customer.primaryInsight) {
    return "sem alerta";
  }

  return insightLabels[customer.primaryInsight];
}

function statusClass(status: CustomerDetail["status"]) {
  if (status === "ACTIVE") {
    return "status-active";
  }

  if (status === "ATTENTION") {
    return "status-attention";
  }

  if (status === "NEW") {
    return "status-active";
  }

  return "status-inactive";
}

function statusTone(status: CustomerDetail["status"]) {
  if (status === "ACTIVE" || status === "NEW") {
    return "success";
  }

  if (status === "ATTENTION") {
    return "warning";
  }

  return "danger";
}

function frequencyTone(ratio: number) {
  if (ratio >= 0.5) {
    return "danger";
  }

  if (ratio >= 0.25) {
    return "warning";
  }

  return "success";
}

function customerDiagnosis(customer: CustomerDetail): { tone: string; headline: string; summary: string } {
  if (customer.status === "INACTIVE") {
    return {
      tone: "danger",
      headline: "Cliente inativo",
      summary: "Ja saiu da zona ativa. Precisa de reativacao antes de perder a recorrencia construida.",
    };
  }

  if (customer.insightTags.includes("risco_churn") || customer.frequencyDropRatio >= 0.5) {
    return {
      tone: "danger",
      headline: "Risco de churn",
      summary: `Frequencia de compra caiu ${formatPercent(customer.frequencyDropRatio)} na comparacao recente. Vale contato imediato.`,
    };
  }

  if (customer.status === "ATTENTION" || customer.insightTags.includes("compra_prevista_vencida")) {
    return {
      tone: "warning",
      headline: "Pede acompanhamento",
      summary: "Entrou em monitoramento. O ideal e agir antes de virar inativo e revisar a rotina de contato.",
    };
  }

  if (customer.insightTags.includes("alto_valor")) {
    return {
      tone: "success",
      headline: "Cliente de alto valor",
      summary: "Gasto total acima da faixa alta da base. Merece prioridade de relacionamento e atencao dedicada.",
    };
  }

  return {
    tone: "success",
    headline: "Relacao saudavel",
    summary: "Sem alerta critico no momento. Cliente segue dentro do ritmo esperado de compra.",
  };
}

function formatMonthLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const year = match?.[1];
  const month = match?.[2];

  if (!year || !month) {
    return value;
  }

  return `${month}/${year.slice(2)}`;
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

function CustomerTrendTooltip({
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
      <p>Historico mensal de compra desse cliente. Troque a metrica ou a janela acima.</p>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [labelMessage, setLabelMessage] = useState("");
  const [notesMessage, setNotesMessage] = useState("");
  const [ambassadorMessage, setAmbassadorMessage] = useState("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(12);

  const detailQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.customer(token!, id!),
    enabled: Boolean(token && id),
  });
  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const customer = detailQuery.data ?? null;
  const knownLabels = useMemo(() => labelsQuery.data?.map((label) => label.name) ?? [], [labelsQuery.data]);
  const availableLabels = useMemo(
    () =>
      knownLabels.filter((labelName) => {
        if (labelName === AMBASSADOR_LABEL_NAME || selectedLabels.includes(labelName)) {
          return false;
        }

        return labelName.toLowerCase().includes(labelSearch.trim().toLowerCase());
      }),
    [knownLabels, selectedLabels, labelSearch],
  );

  useEffect(() => {
    if (!customer) {
      return;
    }

    setSelectedLabels(customer.labels.map((label) => label.name));
    setInternalNotes(customer.internalNotes);
  }, [customer]);

  const saveLabelsMutation = useMutation({
    mutationFn: (input: { labels: string[] }) => api.updateCustomerLabels(token!, id!, input),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
      setLabelMessage("Rotulos salvos com sucesso.");
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: (input: { internalNotes: string }) => api.updateCustomerLabels(token!, id!, input),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setNotesMessage("Observacao salva com sucesso.");
    },
  });

  const ambassadorMutation = useMutation({
    mutationFn: (isAmbassador: boolean) => api.updateCustomerAmbassador(token!, id!, isAmbassador),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
      setAmbassadorMessage(
        updatedCustomer.isAmbassador ? "Cliente marcado como embaixador." : "Cliente removido da aba de embaixadores.",
      );
    },
  });

  if (detailQuery.isLoading) {
    return <div className="page-loading">Carregando ficha do cliente...</div>;
  }

  if (detailQuery.isError || !customer) {
    return <div className="page-error">Nao foi possivel carregar a ficha do cliente.</div>;
  }

  function addExistingLabel(labelName: string) {
    if (selectedLabels.includes(labelName) || labelName === AMBASSADOR_LABEL_NAME) {
      return;
    }

    const nextLabels = [...selectedLabels, labelName];
    setSelectedLabels(nextLabels);
    saveLabelsMutation.mutate({ labels: nextLabels });
    setLabelSearch("");
    setLabelMessage("");
  }

  function addNewLabel() {
    const cleaned = newLabel.trim();
    if (!cleaned || selectedLabels.includes(cleaned)) {
      return;
    }

    if (cleaned.toLowerCase() === AMBASSADOR_LABEL_NAME.toLowerCase()) {
      setLabelMessage(`Use o botao dedicado para marcar ${AMBASSADOR_LABEL_NAME}.`);
      return;
    }

    const nextLabels = [...selectedLabels, cleaned];
    setSelectedLabels(nextLabels);
    saveLabelsMutation.mutate({ labels: nextLabels });
    setNewLabel("");
    setLabelMessage("");
  }

  function removeLabel(labelName: string) {
    if (labelName === AMBASSADOR_LABEL_NAME) {
      return;
    }

    const nextLabels = selectedLabels.filter((item) => item !== labelName);
    setSelectedLabels(nextLabels);
    saveLabelsMutation.mutate({ labels: nextLabels });
    setLabelMessage("");
  }

  function handleSaveLabels(event: FormEvent) {
    event.preventDefault();
    saveLabelsMutation.mutate({
      labels: selectedLabels,
    });
  }

  function handleSaveNotes(event: FormEvent) {
    event.preventDefault();
    saveNotesMutation.mutate({
      internalNotes,
    });
  }

  const diagnosis = customerDiagnosis(customer);
  const trendData = (customer.monthlyTrend ?? []).slice(-trendWindow);
  const kpiCards = [
    {
      label: "Total gasto",
      value: formatCurrency(customer.totalSpent),
      detail: `Score de valor ${customer.valueScore.toFixed(1)} de 100.`,
      tone: "purple",
    },
    {
      label: "Ticket medio",
      value: formatCurrency(customer.avgTicket),
      detail: `${formatNumber(customer.totalOrders)} pedidos no historico.`,
      tone: "neutral",
    },
    {
      label: "Recencia",
      value: formatDaysSince(customer.daysSinceLastPurchase),
      detail: `Ultima compra: ${formatDate(customer.lastPurchaseAt)}.`,
      tone: statusTone(customer.status),
    },
    {
      label: "Queda de frequencia",
      value: formatPercent(customer.frequencyDropRatio),
      detail:
        customer.frequencyDropRatio >= 0.5
          ? "Queda relevante: priorize contato."
          : "Ritmo de compra sob controle.",
      tone: frequencyTone(customer.frequencyDropRatio),
    },
    {
      label: "Proxima compra prevista",
      value: formatDate(customer.predictedNextPurchaseAt),
      detail: customer.insightTags.includes("compra_prevista_vencida")
        ? "Previsao vencida sem novo pedido."
        : `Intervalo medio: ${customer.avgDaysBetweenOrders?.toFixed(0) ?? "--"} dias.`,
      tone: customer.insightTags.includes("compra_prevista_vencida") ? "warning" : "neutral",
    },
    {
      label: "Score de prioridade",
      value: customer.priorityScore.toFixed(1),
      detail: "40% recencia, 25% valor, 20% queda, 15% previsao vencida.",
      tone: "neutral",
    },
  ];

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Ficha do cliente</p>
          <h2>{customer.displayName}</h2>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.4rem" }}>
            <span className={`status-badge ${statusClass(customer.status)}`}>{statusLabel(customer.status)}</span>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{customer.customerCode || "Sem codigo"}</span>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Insight principal: <strong>{primaryInsightLabel(customer)}</strong>
            </span>
          </div>
        </div>
        <div className="hero-actions">
          {customer.isAmbassador ? (
            <span className="tag ambassador-tag">
              {AMBASSADOR_LABEL_NAME}
              {customer.ambassadorAssignedAt ? ` desde ${formatDate(customer.ambassadorAssignedAt)}` : ""}
            </span>
          ) : null}
          <button
            type="button"
            className={customer.isAmbassador ? "ghost-button" : "primary-button"}
            disabled={ambassadorMutation.isPending}
            onClick={() => {
              setAmbassadorMessage("");
              ambassadorMutation.mutate(!customer.isAmbassador);
            }}
          >
            {ambassadorMutation.isPending
              ? "Salvando..."
              : customer.isAmbassador
                ? "Remover de embaixadores"
                : "Marcar como embaixador"}
          </button>
          {ambassadorMessage ? <span className="save-ok">{ambassadorMessage}</span> : null}
        </div>
      </section>

      <section className={`panel customer-diagnosis tone-${diagnosis.tone}`} style={{ borderLeft: `4px solid var(--${diagnosis.tone === "neutral" ? "line" : diagnosis.tone})` }}>
        <div className="panel-header" style={{ marginBottom: "0.3rem" }}>
          <div>
            <p className="eyebrow">Diagnostico comercial</p>
            <h3 style={{ margin: 0 }}>{diagnosis.headline}</h3>
          </div>
        </div>
        <p className="panel-subcopy" style={{ margin: 0 }}>{diagnosis.summary}</p>
      </section>

      <section className="stats-grid">
        {kpiCards.map((card) => (
          <div key={card.label} className={`stat-card tone-${card.tone}`}>
            <div className="stat-card-header">
              <h3 className="stat-card-title">{card.label}</h3>
            </div>
            <div className="stat-card-body">
              <strong>{card.value}</strong>
              <p className="stat-card-helper">{card.detail}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Historico mensal</p>
            <h3>Tendencia de {customer.displayName}</h3>
          </div>
          <div className="ambassador-chart-controls" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
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

            <div style={{ width: "1px", height: "24px", background: "var(--line)" }} />

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

        {trendData.length ? (
          <div className="trend-chart-wrap">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(value) => formatMonthLabel(String(value))}
                  stroke="#5f6f95"
                  minTickGap={trendWindow === 24 ? 18 : 8}
                />
                <YAxis stroke="#5f6f95" tickFormatter={(value) => formatNumber(Number(value))} />
                <Tooltip
                  content={<CustomerTrendTooltip metric={chartMetric} subjectLabel={customer.displayName} />}
                  cursor={{ fill: "rgba(41, 86, 215, 0.04)" }}
                />
                <Bar dataKey={chartMetric} fill={chartMetricColor(chartMetric)} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="empty-state">Ainda nao ha historico de compra suficiente para montar a tendencia.</div>
        )}
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Sinais analiticos</p>
              <h3>Leitura comercial rapida</h3>
            </div>
          </div>

          <div className="detail-grid">
            <div>
              <span>Frequencia nos ultimos 90 dias</span>
              <strong>{customer.purchaseFrequency90d.toFixed(1)}</strong>
            </div>
            <div>
              <span>Media entre pedidos</span>
              <strong>{customer.avgDaysBetweenOrders?.toFixed(1) ?? "Sem base"}</strong>
            </div>
            <div>
              <span>Queda de frequencia</span>
              <strong>{formatPercent(customer.frequencyDropRatio)}</strong>
            </div>
            <div>
              <span>Proxima compra prevista</span>
              <strong>{formatDate(customer.predictedNextPurchaseAt)}</strong>
            </div>
            <div>
              <span>Atendente mais recente</span>
              <strong>{customer.lastAttendant ?? "Nao informado"}</strong>
            </div>
            <div>
              <span className="label-with-info">
                Score de prioridade
                <InfoHint text="Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida." />
              </span>
              <strong>{customer.priorityScore.toFixed(1)}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Como ler os insights</p>
              <h3>O que o sistema esta vendo</h3>
            </div>
          </div>

          <div className="insight-list">
            {customer.insightTags.length ? (
              customer.insightTags.map((tag) => (
                <article key={tag} className="insight-card">
                  <strong>{insightLabels[tag]}</strong>
                  <p>{insightExplanation(tag, customer)}</p>
                </article>
              ))
            ) : (
              <article className="insight-card">
                <strong>Sem alerta no momento</strong>
                <p>O cliente nao bateu nenhum gatilho especial de prioridade ou risco agora.</p>
              </article>
            )}
          </div>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Mix de compra</p>
              <h3>Pecas que esse cliente mais compra</h3>
            </div>
          </div>

          {customer.topProducts.length ? (
            <div className="top-products-list">
              {customer.topProducts.map((product) => (
                <article key={`${product.sku ?? product.itemDescription}`} className="top-product-card">
                  <div className="top-product-copy">
                    <strong>{product.itemDescription}</strong>
                    <span>{product.sku ? `SKU ${product.sku}` : "SKU nao informado"}</span>
                  </div>
                  <div className="top-product-metrics">
                    <span>{formatNumber(product.totalQuantity)} pecas</span>
                    <span>{formatNumber(product.orderCount)} pedidos</span>
                    <span>Ultima compra: {formatDate(product.lastBoughtAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Ainda nao ha base suficiente para montar o mix de compra.</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Classificacao interna</p>
              <h3>Rotulos e observacoes do comercial</h3>
            </div>
          </div>

          <div className="stack-list">
            <form className="label-block" onSubmit={handleSaveLabels}>
              <span className="label-block-title">Rotulos do cliente</span>
              <p className="panel-subcopy">Os rotulos sao salvos automaticamente ao serem alterados.</p>

              <div className="tag-row compact">
                {selectedLabels.length ? (
                  selectedLabels.map((labelName) => (
                    <span
                      key={labelName}
                      className={`tag ${labelName === AMBASSADOR_LABEL_NAME ? "ambassador-tag" : "removable-tag"}`}
                    >
                      <span>{labelName}</span>
                      {labelName !== AMBASSADOR_LABEL_NAME ? (
                        <button type="button" className="tag-remove-button" onClick={() => removeLabel(labelName)}>
                          x
                        </button>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="muted-copy">Nenhum rotulo aplicado.</span>
                )}
              </div>

              <div className="label-create-row">
                <input
                  value={labelSearch}
                  onChange={(event) => setLabelSearch(event.target.value)}
                  placeholder="Buscar rotulo existente"
                />
              </div>

              <div className="tag-row compact">
                {availableLabels.length ? (
                  availableLabels.slice(0, 12).map((labelName) => (
                    <button
                      key={labelName}
                      type="button"
                      className="tag-selector"
                      onClick={() => addExistingLabel(labelName)}
                    >
                      + {labelName}
                    </button>
                  ))
                ) : (
                  <span className="muted-copy">Nenhum rotulo disponivel para esse filtro.</span>
                )}
              </div>

              <div className="label-create-row">
                <input
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="Criar novo rotulo"
                />
                <button type="button" className="ghost-button" onClick={addNewLabel}>
                  Adicionar
                </button>
              </div>

              {labelMessage ? <span className="muted-copy" style={{ fontSize: "0.85rem" }}>{labelMessage}</span> : null}

              <div className="inline-actions" style={{ minHeight: "36px", display: "flex", alignItems: "center" }}>
                {saveLabelsMutation.isPending ? (
                  <span className="muted-copy" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
                    <LoaderCircle className="spinner-small" size={16} style={{ animation: "spin 1s linear infinite" }} /> Salvando alteracoes...
                  </span>
                ) : saveLabelsMutation.isError ? (
                  <span className="inline-error" style={{ fontSize: "0.85rem" }}>Nao foi possivel salvar os rotulos.</span>
                ) : (
                  <span className="save-ok" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", color: "var(--semantic-positive)" }}>
                    <CheckCircle2 size={16} /> Rotulos salvos automaticamente!
                  </span>
                )}
              </div>
            </form>

            <form className="label-block" onSubmit={handleSaveNotes}>
              <span className="label-block-title">Observacao interna</span>
              <textarea
                rows={5}
                value={internalNotes}
                onChange={(event) => {
                  setInternalNotes(event.target.value);
                  setNotesMessage("");
                }}
                placeholder="Ex: cliente pede credito, esta bloqueado, e parceiro bom para reativacao, historico sensivel..."
              />

              <div className="inline-actions">
                <button type="submit" className="ghost-button" disabled={saveNotesMutation.isPending}>
                  {saveNotesMutation.isPending ? "Salvando..." : "Salvar observacao"}
                </button>
                {saveNotesMutation.isError ? <span className="inline-error">Nao foi possivel salvar a observacao.</span> : null}
                {notesMessage ? <span className="save-ok">{notesMessage}</span> : null}
              </div>
            </form>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Historico recente</p>
            <h3>Pedidos mais recentes</h3>
          </div>
        </div>

        <div className="stack-list">
          {customer.recentOrders.map((order) => (
            <div key={order.id} className="history-card">
              <div>
                <strong>{order.orderNumber}</strong>
                <p>{formatDate(order.orderDate)}</p>
              </div>
              <div className="history-card-meta">
                <span>{order.itemCount} itens</span>
                <strong>{formatCurrency(order.totalAmount)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

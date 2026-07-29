import type {
  InventoryDailySeriesPoint,
  InventoryModelDetailResponse,
  InventoryModelTopCustomer,
  InventoryProductKind,
} from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  MessageCircle,
  Phone,
  Search,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber, formatShortDate } from "../lib/format";
import "../components/inventorySales.css";

type AnalysisTab = "sales" | "history";
type CustomerFilter = "all" | "overdue" | "next_15" | "active";

function productKindLabel(kind: InventoryProductKind) {
  if (kind === "DOC_DE_CARGA") return "DOC de carga";
  if (kind === "BATERIA") return "Bateria";
  return "Tela";
}

function formatMonthlyAverage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function daysSinceDate(value: string | null) {
  if (!value) return null;
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;

  const [year, month, day] = parts as [number, number, number];
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.floor((today - target) / 86_400_000));
}

function daysUntilDate(value: string | null) {
  if (!value) return null;
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;

  const [year, month, day] = parts as [number, number, number];
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(year, month - 1, day);
  return Math.ceil((target - today) / 86_400_000);
}

function opportunityForCustomer(customer: InventoryModelTopCustomer) {
  const daysSincePurchase = daysSinceDate(customer.lastPurchaseAt);
  const daysUntilExpected = daysUntilDate(customer.predictedNextPurchaseAt);
  const potentialQuantity = Math.max(customer.averageOrderQuantity, customer.averageMonthlyQuantity, 1);
  const potentialRevenue = potentialQuantity * customer.averageUnitPrice;
  const overdueDays = daysUntilExpected !== null && daysUntilExpected < 0 ? Math.abs(daysUntilExpected) : 0;
  const isCold = (daysSincePurchase ?? 0) > 45;
  const isOverdue = overdueDays > 0 || (daysUntilExpected === null && isCold);
  const isNext15 = daysUntilExpected !== null && daysUntilExpected >= 0 && daysUntilExpected <= 15;

  let label = "Acompanhar";
  let tone = "attention";
  let action = "Reforce disponibilidade e confirme o próximo pedido.";
  let priority = 3;

  if (isOverdue) {
    label = overdueDays ? `Recompra atrasada ${overdueDays}d` : "Reativar agora";
    tone = "danger";
    action = "Contato imediato: o cliente já passou do ritmo normal de recompra.";
    priority = 0;
  } else if (isNext15) {
    label = daysUntilExpected === 0 ? "Recompra prevista hoje" : `Recompra em até ${daysUntilExpected}d`;
    tone = "warning";
    action = "Antecipe a necessidade e reserve quantidade antes do próximo pedido.";
    priority = 1;
  } else if (customer.quantity30Days > 0) {
    label = "Comprando agora";
    tone = "success";
    action = "Cliente ativo: ofereça reposição, aumento de volume ou combinação com outros itens.";
    priority = 4;
  } else if (isCold) {
    label = "Cliente esfriando";
    tone = "warning";
    action = "Investigue preço, qualidade e concorrência; leve uma condição de retorno.";
    priority = 2;
  }

  const opportunityScore = Math.round(
    overdueDays * 1.4
    + customer.averageMonthlyQuantity * 4
    + customer.customerPriorityScore * 0.35
    + (customer.trend90dPercent !== null && customer.trend90dPercent < 0 ? 12 : 0)
    + (isNext15 ? 30 : 0)
    + (isCold ? 18 : 0),
  );

  return {
    action,
    daysSincePurchase,
    daysUntilExpected,
    isCold,
    isNext15,
    isOverdue,
    label,
    opportunityScore,
    potentialQuantity,
    potentialRevenue,
    priority,
    tone,
  };
}

function whatsappLink(customer: InventoryModelTopCustomer, modelLabel: string) {
  const phone = customer.phone?.replace(/\D/g, "");
  if (!phone) return null;
  const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
  const message = [
    `Olá, ${customer.customerDisplayName}!`,
    `Estamos com ${modelLabel} disponível.`,
    `Vi que esse modelo faz parte do seu histórico e separei uma condição para sua próxima reposição.`,
    "Posso te passar quantidade e valor?",
  ].join(" ");
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function customerSearchText(customer: InventoryModelTopCustomer) {
  return [
    customer.customerDisplayName,
    customer.customerCode,
    customer.lastAttendant ?? "",
  ].join(" ").toLocaleLowerCase("pt-BR");
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
  }).format(value);
}

function ModelSalesHistoryChart({ series }: { series: InventoryDailySeriesPoint[] }) {
  return (
    <div className="model-history-chart" aria-label="Histórico diário de estoque e vendas">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={series}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.11)" />
          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="stock"
            tickFormatter={(value) => formatCompactNumber(Number(value))}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="sales"
            orientation="right"
            tickFormatter={(value) => formatCompactNumber(Number(value))}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            labelFormatter={(value) => formatDate(String(value))}
            formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name)]}
          />
          <Line
            dataKey="stockUnits"
            dot={false}
            name="Estoque"
            stroke="#2956d7"
            strokeWidth={2.5}
            type="monotone"
            yAxisId="stock"
          />
          <Bar
            dataKey="salesUnits"
            fill="#d09a29"
            maxBarSize={15}
            name="Vendas"
            radius={[6, 6, 0, 0]}
            yAxisId="sales"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InventoryModelAnalysisContent({
  detail,
  initialTab = "sales",
}: {
  detail: InventoryModelDetailResponse;
  initialTab?: AnalysisTab;
}) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>(initialTab);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const model = detail.model;

  const customerRows = useMemo(
    () =>
      detail.topCustomers.map((customer) => {
        return {
          customer,
          opportunity: opportunityForCustomer(customer),
        };
      }),
    [detail.topCustomers],
  );

  const visibleCustomers = useMemo(() => {
    const filtered = customerRows.filter(({ customer, opportunity }) => {
      if (deferredSearch && !customerSearchText(customer).includes(deferredSearch)) return false;
      if (filter === "overdue" && !opportunity.isOverdue) return false;
      if (filter === "next_15" && !opportunity.isNext15) return false;
      if (filter === "active" && customer.quantity30Days <= 0) return false;
      return true;
    });

    return [...filtered].sort(
      (left, right) =>
        right.opportunity.opportunityScore - left.opportunity.opportunityScore
        || left.opportunity.priority - right.opportunity.priority,
    );
  }, [customerRows, deferredSearch, filter]);

  if (!model) {
    return (
      <section className="panel model-analysis-empty">
        <h2>Modelo não encontrado</h2>
        <p>Este modelo não está disponível no retrato atual do estoque.</p>
        <Link className="ghost-button" to="/estoque"><ArrowLeft size={16} /> Voltar ao estoque</Link>
      </section>
    );
  }

  const totalCustomerVolume = customerRows.reduce((total, row) => total + row.customer.totalQuantity, 0);
  const monthlyCustomerVolume = customerRows.reduce((total, row) => total + row.customer.averageMonthlyQuantity, 0);
  const customersToReactivate = customerRows.filter((row) => row.opportunity.isOverdue);
  const customersNext15 = customerRows.filter((row) => row.opportunity.isNext15);
  const customersActive30 = customerRows.filter((row) => row.customer.quantity30Days > 0);
  const customersDeclining = customerRows.filter(
    (row) => row.customer.trend90dPercent !== null && row.customer.trend90dPercent < -10,
  );
  const potentialPipeline = customerRows
    .filter((row) => row.opportunity.isOverdue || row.opportunity.isNext15)
    .reduce((total, row) => total + row.opportunity.potentialRevenue, 0);
  const revenue12Months = customerRows.reduce((total, row) => total + row.customer.revenue12Months, 0);
  const topFiveVolume = [...customerRows]
    .sort((left, right) => right.customer.totalQuantity - left.customer.totalQuantity)
    .slice(0, 5)
    .reduce((total, row) => total + row.customer.totalQuantity, 0);
  const topFiveShare = totalCustomerVolume ? Math.round((topFiveVolume / totalCustomerVolume) * 100) : 0;
  const priorityCount = customersToReactivate.length + customersNext15.length;
  const historyInsights = detail.highlights.length
    ? detail.highlights
    : [
        `A carteira compra em média ${formatMonthlyAverage(monthlyCustomerVolume)} peças deste modelo por mês.`,
        `Os 5 maiores clientes representam ${formatNumber(topFiveShare)}% do volume histórico do ranking.`,
        customersDeclining.length
          ? `${formatNumber(customersDeclining.length)} clientes reduziram o consumo nos últimos 90 dias.`
          : "Nenhum cliente relevante apresenta queda forte de consumo nos últimos 90 dias.",
      ];

  return (
    <div className="model-analysis-page">
      <div className="model-analysis-back-row">
        <Link className="ghost-button small-button" to="/estoque">
          <ArrowLeft size={16} /> Voltar ao estoque
        </Link>
      </div>

      <section className="panel model-analysis-hero model-analysis-hero-simple">
        <div className="model-analysis-heading">
          <div>
            <p className="eyebrow">Modelo selecionado</p>
            <h1>{model.modelLabel}</h1>
            <p>Veja quem pode comprar agora ou consulte o histórico do modelo.</p>
          </div>
          <div className="model-analysis-tags" aria-label="Características do modelo">
            <span>{productKindLabel(model.productKind)}</span>
            <span>{model.brand || "Sem marca"}</span>
            {model.qualityLabels.map((quality) => <span key={quality}>{quality}</span>)}
          </div>
        </div>

        <div className="model-analysis-summary model-analysis-summary-simple" aria-label="Resumo do modelo">
          <div>
            <span>Estoque atual</span>
            <strong>{formatNumber(model.stockUnits)}</strong>
            <small>peças</small>
          </div>
          <div>
            <span>Vendas em 30 dias</span>
            <strong>{formatNumber(model.sales30)}</strong>
            <small>{formatNumber(model.orders30)} pedidos</small>
          </div>
          <div>
            <span>Contatos prioritários</span>
            <strong>{formatNumber(priorityCount)}</strong>
            <small>{formatCurrency(potentialPipeline)} em pedidos estimados</small>
          </div>
        </div>

        <div className="model-analysis-tabs" role="tablist" aria-label="Visões do modelo">
          <button
            aria-selected={activeTab === "sales"}
            className={activeTab === "sales" ? "active" : ""}
            onClick={() => setActiveTab("sales")}
            role="tab"
            type="button"
          >
            Clientes para vender
          </button>
          <button
            aria-selected={activeTab === "history"}
            className={activeTab === "history" ? "active" : ""}
            onClick={() => setActiveTab("history")}
            role="tab"
            type="button"
          >
            Histórico do modelo
          </button>
        </div>
      </section>

      <section
        aria-labelledby="model-sales-tab-title"
        className={`panel model-analysis-clients model-analysis-tab-panel ${activeTab === "sales" ? "active" : ""}`}
      >
        <div className="model-analysis-client-head">
          <div>
            <h2 id="model-sales-tab-title">Quem pode comprar agora</h2>
            <p>{formatNumber(customerRows.length)} clientes com histórico deste modelo, ordenados por prioridade.</p>
          </div>
          <div className="model-analysis-client-tools">
            <label className="model-analysis-search">
              <Search size={15} />
              <input
                aria-label="Buscar cliente ou vendedora"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente ou vendedora"
                value={search}
              />
            </label>
          </div>
        </div>

        <div className="model-analysis-filter-row" role="group" aria-label="Filtrar oportunidades">
          {([
            { value: "all", label: `Todos (${customerRows.length})` },
            { value: "overdue", label: `Atrasados (${customersToReactivate.length})` },
            { value: "next_15", label: `Próximos 15 dias (${customersNext15.length})` },
            { value: "active", label: `Comprando agora (${customersActive30.length})` },
          ] satisfies Array<{ value: CustomerFilter; label: string }>).map((option) => (
            <button
              className={filter === option.value ? "active" : ""}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        {visibleCustomers.length ? (
          <div className="invsales-table-wrap model-analysis-table-wrap">
            <table className="invsales-table model-analysis-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Situação</th>
                  <th className="num">Pedido estimado</th>
                  <th>Última compra</th>
                  <th>Vendedora</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(({ customer, opportunity }) => {
                  const contactLink = whatsappLink(customer, model.modelLabel);

                  return (
                    <tr key={customer.customerId}>
                      <td>
                        <div className="model-analysis-customer">
                          <strong>{customer.customerDisplayName}</strong>
                          <span>{customer.customerCode || "Sem código"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="model-analysis-action">
                          <span className={`model-analysis-status ${opportunity.tone}`}>{opportunity.label}</span>
                          <small>Recompra prevista: {formatDate(customer.predictedNextPurchaseAt)}</small>
                        </div>
                      </td>
                      <td className="num">
                        <div className="model-analysis-money">
                          <strong>{formatCurrency(opportunity.potentialRevenue)}</strong>
                          <span>≈ {formatMonthlyAverage(opportunity.potentialQuantity)} peças</span>
                        </div>
                      </td>
                      <td>
                        <div className="model-analysis-date">
                          <strong>{formatDate(customer.lastPurchaseAt)}</strong>
                          <span>{formatDaysSince(opportunity.daysSincePurchase)}</span>
                        </div>
                      </td>
                      <td>{customer.lastAttendant || "Sem vendedora"}</td>
                      <td>
                        <div className="model-analysis-row-actions">
                          {contactLink ? (
                            <a className="primary-button small-button" href={contactLink} rel="noreferrer" target="_blank">
                              <MessageCircle size={14} /> WhatsApp
                            </a>
                          ) : (
                            <span className="model-analysis-no-phone"><Phone size={13} /> Sem telefone</span>
                          )}
                          <Link className="ghost-button small-button" to={`/clientes/${customer.customerId}`}>
                            Cliente <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="invsales-empty">
            {detail.topCustomers.length
              ? "Nenhum cliente corresponde à busca."
              : "Ainda não há clientes com compras registradas para este modelo."}
          </div>
        )}
      </section>

      <section
        aria-labelledby="model-history-tab-title"
        className={`panel model-history-panel model-analysis-tab-panel ${activeTab === "history" ? "active" : ""}`}
      >
        <div className="model-history-head">
          <div>
            <h2 id="model-history-tab-title">Histórico do modelo</h2>
            <p>Vendas, estoque e sinais que ajudam a entender o desempenho deste produto.</p>
          </div>
          <div className="model-history-dates">
            <span>Última venda <strong>{formatDate(model.lastSaleAt)}</strong></span>
            <span>Última reposição <strong>{formatDate(model.lastRestockAt)}</strong></span>
          </div>
        </div>

        <div className="model-history-facts" aria-label="Indicadores históricos">
          <div><span>Vendas 30 dias</span><strong>{formatNumber(model.sales30)}</strong></div>
          <div><span>Vendas 90 dias</span><strong>{formatNumber(model.sales90)}</strong></div>
          <div><span>Receita em 12 meses</span><strong>{formatCurrency(revenue12Months)}</strong></div>
          <div>
            <span>Cobertura do estoque</span>
            <strong>{model.coverageDays === null ? "Sem base" : `${formatNumber(model.coverageDays)} dias`}</strong>
          </div>
        </div>

        <div className="model-history-chart-section">
          <div>
            <h3>Estoque x vendas</h3>
            <p>A linha mostra o saldo disponível; as barras mostram as vendas de cada dia.</p>
          </div>
          {detail.dailySeries.length ? (
            <ModelSalesHistoryChart series={detail.dailySeries} />
          ) : (
            <div className="invsales-empty">Ainda não há histórico diário suficiente para este modelo.</div>
          )}
        </div>

        <div className="model-history-bottom">
          <section>
            <h3>O que o histórico mostra</h3>
            <ul>
              {historyInsights.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <section>
            <h3>Comparações históricas</h3>
            <div className="model-history-comparisons">
              <div>
                <span>Com estoque baixo</span>
                <strong>
                  {detail.benchmarks.lowStockAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.lowStockAvgSales)} peças/dia`}
                </strong>
              </div>
              <div>
                <span>Com estoque alto</span>
                <strong>
                  {detail.benchmarks.highStockAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.highStockAvgSales)} peças/dia`}
                </strong>
              </div>
              <div>
                <span>Com poucas variações</span>
                <strong>
                  {detail.benchmarks.shortMixAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.shortMixAvgSales)} peças/dia`}
                </strong>
              </div>
              <div>
                <span>Com mais variações</span>
                <strong>
                  {detail.benchmarks.wideMixAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.wideMixAvgSales)} peças/dia`}
                </strong>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function InventoryModelAnalysisPage() {
  const { modelKey } = useParams<{ modelKey: string }>();
  const { token } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["inventory-model-detail", modelKey],
    queryFn: () => api.inventoryModelDetail(token!, modelKey!),
    enabled: Boolean(token && modelKey),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="model-analysis-page">
        <div className="model-analysis-back-row">
          <Link className="ghost-button small-button" to="/estoque"><ArrowLeft size={16} /> Voltar ao estoque</Link>
        </div>
        <section className="panel invsales-empty">Carregando análise comercial do modelo...</section>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="model-analysis-page">
        <div className="model-analysis-back-row">
          <Link className="ghost-button small-button" to="/estoque"><ArrowLeft size={16} /> Voltar ao estoque</Link>
        </div>
        <section className="panel model-analysis-empty">
          <h2>Não foi possível carregar esta análise</h2>
          <p>Tente novamente em alguns instantes ou volte para a lista de estoque.</p>
        </section>
      </div>
    );
  }

  return <InventoryModelAnalysisContent detail={detailQuery.data} />;
}

import type {
  InventoryModelDetailResponse,
  InventoryModelTopCustomer,
  InventoryProductKind,
} from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleAlert,
  DollarSign,
  MessageCircle,
  PackageCheck,
  Phone,
  Search,
  ShoppingBag,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber } from "../lib/format";
import "../components/inventorySales.css";

type CustomerSort = "opportunity" | "potential" | "revenue" | "volume" | "monthly" | "recent";
type CustomerFilter = "all" | "overdue" | "next_15" | "active" | "cold";

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

function formatCadence(value: number | null) {
  if (value === null) return "Sem padrão";
  return `A cada ${Math.max(1, Math.round(value))} dias`;
}

function trendLabel(customer: InventoryModelTopCustomer) {
  if (customer.trend90dPercent === null) {
    return customer.quantity90Days > 0 ? "Nova demanda" : "Sem movimento";
  }
  if (customer.trend90dPercent > 0) return `+${formatNumber(customer.trend90dPercent)}%`;
  return `${formatNumber(customer.trend90dPercent)}%`;
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

export function InventoryModelAnalysisContent({ detail }: { detail: InventoryModelDetailResponse }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSort>("opportunity");
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
      if (filter === "cold" && !opportunity.isCold) return false;
      return true;
    });

    return [...filtered].sort((left, right) => {
      if (sort === "potential") {
        return right.opportunity.potentialRevenue - left.opportunity.potentialRevenue;
      }
      if (sort === "revenue") {
        return right.customer.revenue12Months - left.customer.revenue12Months;
      }
      if (sort === "volume") {
        return right.customer.totalQuantity - left.customer.totalQuantity;
      }
      if (sort === "monthly") {
        return right.customer.averageMonthlyQuantity - left.customer.averageMonthlyQuantity;
      }
      if (sort === "recent") {
        return (left.opportunity.daysSincePurchase ?? Number.MAX_SAFE_INTEGER)
          - (right.opportunity.daysSincePurchase ?? Number.MAX_SAFE_INTEGER);
      }
      return right.opportunity.opportunityScore - left.opportunity.opportunityScore
        || left.opportunity.priority - right.opportunity.priority;
    });
  }, [customerRows, deferredSearch, filter, sort]);

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
  const topCustomer = [...customerRows].sort(
    (left, right) => right.customer.totalQuantity - left.customer.totalQuantity,
  )[0]?.customer ?? null;
  const topCustomerShare = topCustomer && totalCustomerVolume
    ? Math.round((topCustomer.totalQuantity / totalCustomerVolume) * 100)
    : 0;
  const topFiveVolume = [...customerRows]
    .sort((left, right) => right.customer.totalQuantity - left.customer.totalQuantity)
    .slice(0, 5)
    .reduce((total, row) => total + row.customer.totalQuantity, 0);
  const topFiveShare = totalCustomerVolume ? Math.round((topFiveVolume / totalCustomerVolume) * 100) : 0;

  return (
    <div className="model-analysis-page">
      <div className="model-analysis-back-row">
        <Link className="ghost-button small-button" to="/estoque">
          <ArrowLeft size={16} /> Voltar ao estoque
        </Link>
      </div>

      <section className="panel model-analysis-hero">
        <div className="model-analysis-heading">
          <div>
            <p className="eyebrow">Análise comercial do modelo</p>
            <h1>{model.modelLabel}</h1>
            <p>
              Painel de venda com até 50 compradores, previsão de recompra, potencial em reais e fila de contato.
            </p>
          </div>
          <div className="model-analysis-tags" aria-label="Características do modelo">
            <span>{productKindLabel(model.productKind)}</span>
            <span>{model.brand || "Sem marca"}</span>
            {model.qualityLabels.map((quality) => <span key={quality}>{quality}</span>)}
          </div>
        </div>

        <div className="model-analysis-summary" aria-label="Resumo do modelo">
          <div>
            <span><PackageCheck size={15} /> Estoque atual</span>
            <strong>{formatNumber(model.stockUnits)}</strong>
            <small>peças disponíveis</small>
          </div>
          <div>
            <span><ShoppingBag size={15} /> Vendas em 30 dias</span>
            <strong>{formatNumber(model.sales30)}</strong>
            <small>{formatNumber(model.orders30)} pedidos</small>
          </div>
          <div>
            <span><Users size={15} /> Clientes no ranking</span>
            <strong>{formatNumber(customerRows.length)}</strong>
            <small>até 50 compradores do modelo</small>
          </div>
          <div>
            <span><DollarSign size={15} /> Receita em 12 meses</span>
            <strong>{formatCurrency(revenue12Months)}</strong>
            <small>somente deste modelo</small>
          </div>
          <div className="highlight">
            <span><Target size={15} /> Pipeline estimado</span>
            <strong>{formatCurrency(potentialPipeline)}</strong>
            <small>recompras vencidas ou próximas</small>
          </div>
        </div>
      </section>

      <section className="model-analysis-opportunities" aria-label="Prioridades comerciais">
        <article className={customersToReactivate.length ? "danger" : "success"}>
          <span className="model-analysis-opportunity-icon"><CircleAlert size={20} /></span>
          <div>
            <small>Prioridade de contato</small>
            <strong>
              {customersToReactivate.length
                ? `${customersToReactivate.length} ${customersToReactivate.length === 1 ? "recompra atrasada" : "recompras atrasadas"}`
                : "Nenhuma recompra atrasada"}
            </strong>
            <p>
              {customersToReactivate.length
                ? "A fila já considera ritmo de compra, potencial do pedido e prioridade do cliente."
                : "Os compradores recorrentes ainda estão dentro do ritmo esperado."}
            </p>
          </div>
        </article>

        <article>
          <span className="model-analysis-opportunity-icon"><Zap size={20} /></span>
          <div>
            <small>Próximos 15 dias</small>
            <strong>{formatNumber(customersNext15.length)} recompras previstas</strong>
            <p>Aborde antes do concorrente e tente reservar o próximo lote.</p>
          </div>
        </article>

        <article>
          <span className="model-analysis-opportunity-icon"><TrendingUp size={20} /></span>
          <div>
            <small>Maior comprador</small>
            <strong>{topCustomer?.customerDisplayName ?? "Sem histórico"}</strong>
            <p>
              {topCustomer
                ? `${formatNumber(topCustomer.totalQuantity)} peças compradas · ${topCustomerShare}% do volume do ranking.`
                : "Ainda não há compras relacionadas a este modelo."}
            </p>
          </div>
        </article>

        <article>
          <span className="model-analysis-opportunity-icon"><TrendingDown size={20} /></span>
          <div>
            <small>Queda de consumo</small>
            <strong>
              {formatNumber(customersDeclining.length)} {customersDeclining.length === 1 ? "cliente em queda" : "clientes em queda"}
            </strong>
            <p>Compare os últimos 90 dias com o período anterior e recupere volume perdido.</p>
          </div>
        </article>
      </section>

      <section className="panel model-analysis-sales-readout">
        <div>
          <span>Clientes ativos em 30 dias</span>
          <strong>{formatNumber(customersActive30.length)}</strong>
          <small>compraram este modelo recentemente</small>
        </div>
        <div>
          <span>Demanda mensal da carteira</span>
          <strong>{formatMonthlyAverage(monthlyCustomerVolume)} peças</strong>
          <small>soma da média dos clientes exibidos</small>
        </div>
        <div>
          <span>Concentração nos 5 maiores</span>
          <strong>{formatNumber(topFiveShare)}%</strong>
          <small>{topFiveShare > 60 ? "dependência alta: proteja essas contas" : "carteira relativamente distribuída"}</small>
        </div>
        <div>
          <span>Ritmo do estoque</span>
          <strong>{model.coverageDays === null ? "Sem base" : `${formatNumber(model.coverageDays)} dias`}</strong>
          <small>{formatNumber(model.sales90)} peças vendidas em 90 dias</small>
        </div>
      </section>

      <section className="panel model-analysis-clients">
        <div className="model-analysis-client-head">
          <div>
            <p className="eyebrow">Carteira deste produto</p>
            <h2>Top {formatNumber(customerRows.length)} clientes para vender {model.modelLabel}</h2>
            <p>Ordene pelo dinheiro na mesa, identifique a próxima recompra e abra o WhatsApp com uma abordagem pronta.</p>
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
            <label>
              <span>Ordenar por</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as CustomerSort)}>
                <option value="opportunity">Prioridade de venda</option>
                <option value="potential">Maior pedido potencial</option>
                <option value="revenue">Maior receita em 12 meses</option>
                <option value="volume">Maior volume total</option>
                <option value="monthly">Maior média mensal</option>
                <option value="recent">Compra mais recente</option>
              </select>
            </label>
          </div>
        </div>

        <div className="model-analysis-filter-row" role="group" aria-label="Filtrar oportunidades">
          {([
            { value: "all", label: `Todos (${customerRows.length})` },
            { value: "overdue", label: `Recompra atrasada (${customersToReactivate.length})` },
            { value: "next_15", label: `Próximos 15 dias (${customersNext15.length})` },
            { value: "active", label: `Ativos 30d (${customersActive30.length})` },
            { value: "cold", label: `Esfriando (${customerRows.filter((row) => row.opportunity.isCold).length})` },
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
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Próxima ação</th>
                  <th className="num">Pedido potencial</th>
                  <th>Recompra prevista</th>
                  <th className="num">30d / 90d</th>
                  <th>Tendência 90d</th>
                  <th className="num">Ritmo de compra</th>
                  <th className="num">Histórico do modelo</th>
                  <th>Última compra</th>
                  <th>Vendedora</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(({ customer, opportunity }, index) => {
                  const contactLink = whatsappLink(customer, model.modelLabel);
                  const trendTone = customer.trend90dPercent === null
                    ? "neutral"
                    : customer.trend90dPercent > 10
                      ? "success"
                      : customer.trend90dPercent < -10
                        ? "danger"
                        : "neutral";

                  return (
                    <tr key={customer.customerId}>
                      <td className="invsales-rank">{index + 1}</td>
                      <td>
                        <div className="model-analysis-customer">
                          <strong>{customer.customerDisplayName}</strong>
                          <span>{customer.customerCode || "Sem código"} · prioridade {formatNumber(customer.customerPriorityScore)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="model-analysis-action">
                          <span className={`model-analysis-status ${opportunity.tone}`}>{opportunity.label}</span>
                          <small>{opportunity.action}</small>
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
                          <strong>{formatDate(customer.predictedNextPurchaseAt)}</strong>
                          <span>{formatCadence(customer.averageDaysBetweenPurchases)}</span>
                        </div>
                      </td>
                      <td className="num">
                        <div className="model-analysis-monthly">
                          <strong>{formatNumber(customer.quantity30Days)} / {formatNumber(customer.quantity90Days)}</strong>
                          <span>{formatNumber(customer.orders30Days)} / {formatNumber(customer.orders90Days)} pedidos</span>
                        </div>
                      </td>
                      <td>
                        <span className={`model-analysis-trend ${trendTone}`}>
                          {trendTone === "danger" ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                          {trendLabel(customer)}
                        </span>
                      </td>
                      <td className="num">
                        <div className="model-analysis-monthly">
                          <strong>{formatMonthlyAverage(customer.averageMonthlyQuantity)} peças/mês</strong>
                          <span>{formatMonthlyAverage(customer.averageOrderQuantity)} por pedido</span>
                        </div>
                      </td>
                      <td className="num">
                        <div className="model-analysis-money">
                          <strong>{formatCurrency(customer.totalRevenue)}</strong>
                          <span>{formatNumber(customer.totalQuantity)} peças · {formatNumber(customer.totalOrders)} pedidos</span>
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
                              <MessageCircle size={14} /> Vender agora
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

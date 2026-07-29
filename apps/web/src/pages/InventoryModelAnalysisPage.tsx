import type {
  InventoryModelDetailResponse,
  InventoryModelTopCustomer,
  InventoryProductKind,
} from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CircleAlert,
  PackageCheck,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatDaysSince, formatNumber } from "../lib/format";
import "../components/inventorySales.css";

type CustomerSort = "opportunity" | "volume" | "monthly" | "recent";

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

function customerTemperature(days: number | null) {
  if (days === null) {
    return { label: "Sem histórico recente", tone: "neutral", priority: 3 };
  }
  if (days > 45) {
    return { label: "Reativar agora", tone: "danger", priority: 0 };
  }
  if (days > 30) {
    return { label: "Cliente esfriando", tone: "warning", priority: 1 };
  }
  if (days > 15) {
    return { label: "Hora de acompanhar", tone: "attention", priority: 2 };
  }
  return { label: "Compra recente", tone: "success", priority: 4 };
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
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const model = detail.model;

  const customerRows = useMemo(
    () =>
      detail.topCustomers.map((customer) => {
        const daysSincePurchase = daysSinceDate(customer.lastPurchaseAt);
        return {
          customer,
          daysSincePurchase,
          temperature: customerTemperature(daysSincePurchase),
        };
      }),
    [detail.topCustomers],
  );

  const visibleCustomers = useMemo(() => {
    const filtered = customerRows.filter(({ customer }) =>
      !deferredSearch || customerSearchText(customer).includes(deferredSearch),
    );

    return [...filtered].sort((left, right) => {
      if (sort === "volume") {
        return right.customer.totalQuantity - left.customer.totalQuantity;
      }
      if (sort === "monthly") {
        return right.customer.averageMonthlyQuantity - left.customer.averageMonthlyQuantity;
      }
      if (sort === "recent") {
        return (left.daysSincePurchase ?? Number.MAX_SAFE_INTEGER) - (right.daysSincePurchase ?? Number.MAX_SAFE_INTEGER);
      }
      return left.temperature.priority - right.temperature.priority
        || right.customer.averageMonthlyQuantity - left.customer.averageMonthlyQuantity;
    });
  }, [customerRows, deferredSearch, sort]);

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
  const customersToReactivate = customerRows.filter((row) => row.daysSincePurchase !== null && row.daysSincePurchase > 30);
  const topCustomer = [...customerRows].sort(
    (left, right) => right.customer.totalQuantity - left.customer.totalQuantity,
  )[0]?.customer ?? null;
  const topCustomerShare = topCustomer && totalCustomerVolume
    ? Math.round((topCustomer.totalQuantity / totalCustomerVolume) * 100)
    : 0;

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
              Veja quem mais compra, quem está no momento de recompra e quais clientes merecem contato primeiro.
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
            <small>{formatNumber(totalCustomerVolume)} peças no histórico</small>
          </div>
          <div>
            <span><TrendingUp size={15} /> Média mensal conjunta</span>
            <strong>{formatMonthlyAverage(monthlyCustomerVolume)}</strong>
            <small>peças/mês dos principais clientes</small>
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
                ? `${customersToReactivate.length} ${customersToReactivate.length === 1 ? "cliente está" : "clientes estão"} esfriando`
                : "Nenhum cliente esfriando"}
            </strong>
            <p>
              {customersToReactivate.length
                ? "Comece pelos clientes com maior média mensal e mais de 30 dias sem comprar."
                : "Os principais compradores estão com compras recentes."}
            </p>
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
          <span className="model-analysis-opportunity-icon"><CalendarClock size={20} /></span>
          <div>
            <small>Ritmo recente do modelo</small>
            <strong>{formatNumber(model.sales90)} peças em 90 dias</strong>
            <p>Última venda: {formatDate(model.lastSaleAt)} · cobertura de {model.coverageDays ?? "—"} dias.</p>
          </div>
        </article>
      </section>

      <section className="panel model-analysis-clients">
        <div className="model-analysis-client-head">
          <div>
            <p className="eyebrow">Carteira deste produto</p>
            <h2>Clientes que mais compram {model.modelLabel}</h2>
            <p>Use o status para decidir quem contatar primeiro e a média mensal para estimar o potencial do pedido.</p>
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
                <option value="opportunity">Melhores oportunidades</option>
                <option value="volume">Maior volume total</option>
                <option value="monthly">Maior média mensal</option>
                <option value="recent">Compra mais recente</option>
              </select>
            </label>
          </div>
        </div>

        {visibleCustomers.length ? (
          <div className="invsales-table-wrap model-analysis-table-wrap">
            <table className="invsales-table model-analysis-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Status comercial</th>
                  <th className="num">Total comprado</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Média mensal</th>
                  <th>Última compra</th>
                  <th>Sem comprar</th>
                  <th>Vendedora</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(({ customer, daysSincePurchase, temperature }, index) => (
                  <tr key={customer.customerId}>
                    <td className="invsales-rank">{index + 1}</td>
                    <td>
                      <div className="model-analysis-customer">
                        <strong>{customer.customerDisplayName}</strong>
                        <span>{customer.customerCode || "Sem código"}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`model-analysis-status ${temperature.tone}`}>{temperature.label}</span>
                    </td>
                    <td className="num"><strong>{formatNumber(customer.totalQuantity)}</strong></td>
                    <td className="num">{formatNumber(customer.totalOrders)}</td>
                    <td className="num">
                      <div className="model-analysis-monthly">
                        <strong>{formatMonthlyAverage(customer.averageMonthlyQuantity)}</strong>
                        <span>peças/mês · base {customer.observedMonths}m</span>
                      </div>
                    </td>
                    <td>{formatDate(customer.lastPurchaseAt)}</td>
                    <td><strong>{formatDaysSince(daysSincePurchase)}</strong></td>
                    <td>{customer.lastAttendant || "Sem vendedora"}</td>
                    <td>
                      <Link className="ghost-button small-button" to={`/clientes/${customer.customerId}`}>
                        Abrir cliente <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
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

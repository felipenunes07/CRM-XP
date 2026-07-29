import type {
  InventoryModelDetailResponse,
  InventoryModelListItem,
  InventoryModelsResponse,
  InventoryProductKind,
} from "@olist-crm/shared";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { Boxes, ChevronRight, Download, PackageCheck, Tags, Warehouse, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatDaysSince, formatNumber } from "../lib/format";
import "./inventorySales.css";

type StockKindFilter = "all" | InventoryProductKind;
type StockSort = "stock_desc" | "stock_asc" | "name_asc";

interface InventoryStockTabProps {
  data: InventoryModelsResponse | undefined;
  isError: boolean;
  isLoading: boolean;
  detail: InventoryModelDetailResponse | undefined;
  isDetailError: boolean;
  isDetailLoading: boolean;
  selectedModelKey: string | null;
  onSelectModel: (modelKey: string | null) => void;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function productKindLabel(kind: InventoryProductKind) {
  if (kind === "DOC_DE_CARGA") return "DOC de carga";
  if (kind === "BATERIA") return "Bateria";
  return "Tela";
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

function formatMonthlyAverage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function matchesSearch(item: InventoryModelListItem, search: string) {
  if (!search) return true;

  return [item.modelLabel, item.brand, item.qualityLabels.join(" ")]
    .join(" ")
    .toLocaleLowerCase("pt-BR")
    .includes(search);
}

function exportStockCsv(items: InventoryModelListItem[]) {
  const headers = ["Modelo", "Tipo", "Marca", "Qualidade", "Quantidade"];
  const rows = items.map((item) => [
    item.modelLabel,
    productKindLabel(item.productKind),
    item.brand,
    item.qualityLabels.join(", ") || "Sem qualidade",
    item.stockUnits,
  ]);
  const lines = [
    `\uFEFF${headers.join(";")}`,
    ...rows.map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(";"),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estoque_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StockCustomerDrilldown({
  detail,
  isError,
  isLoading,
  model,
  onClose,
}: {
  detail: InventoryModelDetailResponse | undefined;
  isError: boolean;
  isLoading: boolean;
  model: InventoryModelListItem;
  onClose: () => void;
}) {
  const customers = detail?.topCustomers ?? [];
  const customerSummary = {
    totalQuantity: customers.reduce((total, customer) => total + customer.totalQuantity, 0),
    averageMonthly: customers.reduce((total, customer) => total + customer.averageMonthlyQuantity, 0),
    mostRecentPurchaseAt: customers.reduce<string | null>(
      (latest, customer) => !latest || (customer.lastPurchaseAt && customer.lastPurchaseAt > latest)
        ? customer.lastPurchaseAt
        : latest,
      null,
    ),
  };

  return (
    <div className="invstock-customer-drill" aria-live="polite">
      <div className="invstock-customer-head">
        <div>
          <p className="eyebrow">Quem compra este modelo</p>
          <h4>Clientes que mais compram {model.modelLabel}</h4>
          <p>
            Ranking pelo volume total. A média mensal considera até os últimos 12 meses de histórico de cada cliente.
          </p>
        </div>
        <button type="button" className="ghost-button small-button" onClick={onClose}>
          <X size={14} /> Fechar
        </button>
      </div>

      {isLoading ? <div className="invsales-empty">Carregando histórico dos clientes...</div> : null}
      {isError ? <div className="invsales-empty">Não foi possível carregar os clientes deste modelo agora.</div> : null}

      {!isLoading && !isError && detail ? (
        customers.length ? (
          <>
            <div className="invstock-customer-kpis">
              <article>
                <span>Principais clientes</span>
                <strong>{formatNumber(customers.length)}</strong>
                <small>Até 8 clientes no ranking</small>
              </article>
              <article>
                <span>Volume comprado</span>
                <strong>{formatNumber(customerSummary.totalQuantity)}</strong>
                <small>Peças compradas pelos clientes exibidos</small>
              </article>
              <article>
                <span>Média mensal conjunta</span>
                <strong>{formatMonthlyAverage(customerSummary.averageMonthly)}</strong>
                <small>Peças por mês no histórico recente</small>
              </article>
              <article>
                <span>Compra mais recente</span>
                <strong>{formatDaysSince(daysSinceDate(customerSummary.mostRecentPurchaseAt))}</strong>
                <small>{formatDate(customerSummary.mostRecentPurchaseAt)}</small>
              </article>
            </div>

            <div className="invsales-table-wrap invstock-customer-table-wrap">
              <table className="invsales-table invstock-customer-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Cliente</th>
                    <th className="num">Total comprado</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Média mensal</th>
                    <th>Última compra</th>
                    <th>Tempo sem comprar</th>
                    <th>Vendedora</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer, index) => (
                    <tr key={customer.customerId}>
                      <td className="invsales-rank">{index + 1}</td>
                      <td>
                        <div className="invstock-customer-name">
                          <strong>{customer.customerDisplayName}</strong>
                          <span>{customer.customerCode}</span>
                        </div>
                      </td>
                      <td className="num"><strong>{formatNumber(customer.totalQuantity)}</strong></td>
                      <td className="num">{formatNumber(customer.totalOrders)}</td>
                      <td className="num">
                        <div className="invstock-monthly-average">
                          <strong>{formatMonthlyAverage(customer.averageMonthlyQuantity)}</strong>
                          <span>peças/mês · base {customer.observedMonths}m</span>
                        </div>
                      </td>
                      <td>{formatDate(customer.lastPurchaseAt)}</td>
                      <td>
                        <span className="invstock-recency-pill">
                          {formatDaysSince(daysSinceDate(customer.lastPurchaseAt))}
                        </span>
                      </td>
                      <td>{customer.lastAttendant || "Sem vendedora"}</td>
                      <td>
                        <Link className="ghost-button small-button" to={`/clientes/${customer.customerId}`}>
                          Ver cliente
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="invsales-empty">Ainda não há clientes com compras registradas para este modelo.</div>
        )
      ) : null}
    </div>
  );
}

export function InventoryStockTab({
  data,
  detail,
  isDetailError,
  isDetailLoading,
  isError,
  isLoading,
  onSelectModel,
  selectedModelKey,
}: InventoryStockTabProps) {
  const [kind, setKind] = useState<StockKindFilter>("all");
  const [brand, setBrand] = useState("");
  const [quality, setQuality] = useState("");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [sort, setSort] = useState<StockSort>("stock_desc");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const brands = useMemo(() => uniqueSorted(items.map((item) => item.brand)), [items]);
  const qualities = useMemo(() => uniqueSorted(items.flatMap((item) => item.qualityLabels)), [items]);
  const kindCounts = useMemo(() => {
    const counts = new Map<InventoryProductKind, number>();
    for (const item of items) {
      counts.set(item.productKind, (counts.get(item.productKind) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const filteredInventory = useMemo(
    () =>
      items.filter((item) => {
        if (kind !== "all" && item.productKind !== kind) return false;
        if (brand && item.brand !== brand) return false;
        if (quality && !item.qualityLabels.includes(quality)) return false;
        return matchesSearch(item, deferredSearch);
      }),
    [brand, deferredSearch, items, kind, quality],
  );

  const visibleItems = useMemo(() => {
    const filtered = onlyInStock
      ? filteredInventory.filter((item) => item.stockUnits > 0)
      : filteredInventory;

    return [...filtered].sort((left, right) => {
      if (sort === "stock_asc") {
        return left.stockUnits - right.stockUnits || left.modelLabel.localeCompare(right.modelLabel, "pt-BR");
      }
      if (sort === "name_asc") {
        return left.modelLabel.localeCompare(right.modelLabel, "pt-BR");
      }
      return right.stockUnits - left.stockUnits || left.modelLabel.localeCompare(right.modelLabel, "pt-BR");
    });
  }, [filteredInventory, onlyInStock, sort]);

  const summary = useMemo(() => {
    const stockedItems = filteredInventory.filter((item) => item.stockUnits > 0);
    return {
      units: stockedItems.reduce((total, item) => total + item.stockUnits, 0),
      stockedModels: stockedItems.length,
      brands: new Set(filteredInventory.map((item) => item.brand).filter(Boolean)).size,
      emptyModels: filteredInventory.length - stockedItems.length,
    };
  }, [filteredInventory]);

  const maxVisibleStock = Math.max(...visibleItems.map((item) => item.stockUnits), 1);
  const activeCrumbs = [
    kind !== "all" ? { label: `Tipo: ${productKindLabel(kind)}`, clear: () => setKind("all") } : null,
    brand ? { label: `Marca: ${brand}`, clear: () => setBrand("") } : null,
    quality ? { label: `Qualidade: ${quality}`, clear: () => setQuality("") } : null,
    search ? { label: `Busca: ${search}`, clear: () => setSearch("") } : null,
    !onlyInStock ? { label: "Incluindo zerados", clear: () => setOnlyInStock(true) } : null,
  ].filter((crumb): crumb is { label: string; clear: () => void } => Boolean(crumb));

  function clearAllFilters() {
    setKind("all");
    setBrand("");
    setQuality("");
    setSearch("");
    setOnlyInStock(true);
    setSort("stock_desc");
  }

  if (isLoading) {
    return <section className="panel invsales-empty">Carregando estoque...</section>;
  }

  if (isError || !data) {
    return <section className="panel invsales-empty">Não foi possível carregar o estoque agora.</section>;
  }

  return (
    <div className="invsales-stack invstock-stack">
      <section className="panel invsales-filterbar">
        <div className="invsales-filterbar-row">
          <div className="invsales-control">
            <span className="invsales-control-label">Tipo de produto</span>
            <div className="invsales-seg" role="group" aria-label="Tipo de produto">
              {(
                [
                  { value: "all", label: "Todos" },
                  { value: "TELA", label: "Telas" },
                  { value: "DOC_DE_CARGA", label: "DOCs" },
                  { value: "BATERIA", label: "Baterias" },
                ] satisfies { value: StockKindFilter; label: string }[]
              )
                .filter((option) => option.value === "all" || (kindCounts.get(option.value) ?? 0) > 0 || kind === option.value)
                .map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={kind === option.value ? "active" : ""}
                    onClick={() => setKind(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Disponibilidade</span>
            <div className="invsales-seg" role="group" aria-label="Disponibilidade">
              <button type="button" className={onlyInStock ? "active" : ""} onClick={() => setOnlyInStock(true)}>
                Com estoque
              </button>
              <button type="button" className={!onlyInStock ? "active" : ""} onClick={() => setOnlyInStock(false)}>
                Todos
              </button>
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Marca</span>
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="">Todas</option>
              {brands.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Qualidade</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              <option value="">Todas</option>
              {qualities.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Buscar</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Modelo, marca ou qualidade" />
          </div>
        </div>

        {activeCrumbs.length ? (
          <div className="invsales-crumbs">
            <span className="invsales-crumbs-label">Filtrando por:</span>
            {activeCrumbs.map((crumb) => (
              <button key={crumb.label} type="button" className="invsales-crumb" onClick={crumb.clear}>
                {crumb.label} <X size={12} />
              </button>
            ))}
            <button type="button" className="invsales-crumb-clear" onClick={clearAllFilters}>
              limpar tudo
            </button>
          </div>
        ) : null}
      </section>

      <section className="invsales-kpi-grid">
        <article className="invsales-kpi">
          <span className="invsales-kpi-label"><Warehouse size={14} /> Peças em estoque</span>
          <strong className="invsales-kpi-value">{formatNumber(summary.units)}</strong>
          <span className="invsales-kpi-hint">Quantidade dos filtros atuais</span>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label"><PackageCheck size={14} /> Modelos disponíveis</span>
          <strong className="invsales-kpi-value">{formatNumber(summary.stockedModels)}</strong>
          <span className="invsales-kpi-hint">Modelos com quantidade positiva</span>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label"><Tags size={14} /> Marcas encontradas</span>
          <strong className="invsales-kpi-value">{formatNumber(summary.brands)}</strong>
          <span className="invsales-kpi-hint">Dentro do recorte selecionado</span>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label"><Boxes size={14} /> Modelos zerados</span>
          <strong className="invsales-kpi-value">{formatNumber(summary.emptyModels)}</strong>
          <span className="invsales-kpi-hint">Use “Todos” para exibir na lista</span>
        </article>
      </section>

      <section className="panel">
        <div className="invsales-section-head">
          <div>
            <p className="eyebrow">Estoque atual</p>
            <h3>Quantidade por modelo</h3>
            <p className="invsales-section-sub">
              Clique numa linha para abrir os detalhes. Clique em Modelo ou Quantidade para reordenar.
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={() => exportStockCsv(visibleItems)}>
            <Download size={16} /> Baixar CSV
          </button>
        </div>

        <div className="invsales-table-wrap">
          <table className="invsales-table invstock-table">
            <thead>
              <tr>
                <th>#</th>
                <th>
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sort === "name_asc" ? "active" : ""}`}
                    onClick={() => setSort("name_asc")}
                  >
                    Modelo
                  </button>
                </th>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Qualidade</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sort !== "name_asc" ? "active" : ""}`}
                    onClick={() => setSort((current) => current === "stock_desc" ? "stock_asc" : "stock_desc")}
                  >
                    Quantidade
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const isSelected = selectedModelKey === item.modelKey;

                return (
                  <Fragment key={item.modelKey}>
                    <tr
                      className={`group-row invstock-model-row ${isSelected ? "open" : ""}`}
                      tabIndex={0}
                      aria-expanded={isSelected}
                      onClick={() => onSelectModel(isSelected ? null : item.modelKey)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectModel(isSelected ? null : item.modelKey);
                        }
                      }}
                    >
                      <td className="invsales-rank">{index + 1}</td>
                      <td>
                        <div className="invsales-cell-main">
                          <strong>
                            <ChevronRight className={isSelected ? "expanded" : ""} size={14} />
                            {item.modelLabel}
                          </strong>
                        </div>
                      </td>
                      <td><span className={`invstock-type ${item.productKind.toLowerCase()}`}>{productKindLabel(item.productKind)}</span></td>
                      <td><span className="invstock-brand">{item.brand || "Sem marca"}</span></td>
                      <td>{item.qualityLabels.join(", ") || "Sem qualidade"}</td>
                      <td className="num">
                        <div className="invstock-quantity">
                          <span className="invstock-quantity-track">
                            <i style={{ width: `${Math.max((item.stockUnits / maxVisibleStock) * 100, item.stockUnits > 0 ? 4 : 0)}%` }} />
                          </span>
                          <strong>{formatNumber(item.stockUnits)}</strong>
                          <small>peças</small>
                        </div>
                      </td>
                    </tr>
                    {isSelected ? (
                      <tr className="invstock-customer-drill-row">
                        <td colSpan={6}>
                          <StockCustomerDrilldown
                            detail={detail}
                            isError={isDetailError}
                            isLoading={isDetailLoading}
                            model={item}
                            onClose={() => onSelectModel(null)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!visibleItems.length ? <div className="invsales-empty">Nenhum produto corresponde aos filtros.</div> : null}
      </section>
    </div>
  );
}

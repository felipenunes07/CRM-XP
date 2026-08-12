import type {
  InventoryModelDetailResponse,
  InventoryModelListItem,
  InventoryModelsResponse,
  InventoryProductKind,
} from "@olist-crm/shared";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { BarChart3, Boxes, ChevronRight, Download, PackageCheck, Tags, Warehouse, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import "./inventorySales.css";

type StockKindFilter = "all" | InventoryProductKind;
type StockFactoryFilter = "" | InventoryModelListItem["factory"];
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

function factoryLabel(factory: InventoryModelListItem["factory"]) {
  return factory === "BATERIA" ? "Baterias" : factory;
}

function matchesSearch(item: InventoryModelListItem, search: string) {
  if (!search) return true;

  return [item.modelLabel, item.brand, item.qualityLabels.join(" ")]
    .join(" ")
    .toLocaleLowerCase("pt-BR")
    .includes(search);
}

function exportStockCsv(items: InventoryModelListItem[]) {
  const headers = ["Modelo", "Tipo", "Fábrica", "Marca", "Qualidade", "Quantidade"];
  const rows = items.map((item) => [
    item.modelLabel,
    productKindLabel(item.productKind),
    factoryLabel(item.factory),
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

function StockCustomerPreview({
  detail,
  isError,
  isLoading,
  model,
}: {
  detail: InventoryModelDetailResponse | undefined;
  isError: boolean;
  isLoading: boolean;
  model: InventoryModelListItem;
}) {
  const customers = detail?.topCustomers.slice(0, 10) ?? [];

  return (
    <div className="invstock-preview">
      <div className="invstock-preview-head">
        <div>
          <p className="eyebrow">Atalho comercial</p>
          <h4>Top 10 clientes de {model.modelLabel}</h4>
          <p>Prévia rápida dos compradores. Abra a análise completa para ver até 50 clientes e oportunidades.</p>
        </div>
        <Link
          className="primary-button small-button"
          onClick={(event) => event.stopPropagation()}
          to={`/estoque/modelos/${encodeURIComponent(model.modelKey)}`}
        >
          <BarChart3 size={14} /> Análise completa
        </Link>
      </div>

      {isLoading ? <div className="invsales-empty">Carregando os principais clientes...</div> : null}
      {isError ? <div className="invsales-empty">Não foi possível carregar os clientes agora.</div> : null}
      {!isLoading && !isError && detail ? (
        customers.length ? (
          <div className="invsales-table-wrap invstock-preview-table-wrap">
            <table className="invsales-table invstock-preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th className="num">Total do modelo</th>
                  <th className="num">Últimos 30d</th>
                  <th className="num">Média mensal</th>
                  <th>Última compra</th>
                  <th>Próxima recompra</th>
                  <th>Vendedora</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer, index) => (
                  <tr key={customer.customerId}>
                    <td className="invsales-rank">{index + 1}</td>
                    <td>
                      <div className="invstock-preview-customer">
                        <strong>{customer.customerDisplayName}</strong>
                        <span>{customer.customerCode || "Sem código"}</span>
                      </div>
                    </td>
                    <td className="num">
                      <strong>{formatNumber(customer.totalQuantity)} peças</strong>
                      <small>{formatCurrency(customer.totalRevenue)}</small>
                    </td>
                    <td className="num">{formatNumber(customer.quantity30Days)} peças</td>
                    <td className="num">{customer.averageMonthlyQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                    <td>{formatDate(customer.lastPurchaseAt)}</td>
                    <td>{formatDate(customer.predictedNextPurchaseAt)}</td>
                    <td>{customer.lastAttendant || "Sem vendedora"}</td>
                    <td>
                      <Link
                        className="ghost-button small-button"
                        onClick={(event) => event.stopPropagation()}
                        to={`/clientes/${customer.customerId}`}
                      >
                        Ver cliente
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="invsales-empty">Ainda não há compradores registrados para este modelo.</div>
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
  const [factory, setFactory] = useState<StockFactoryFilter>("");
  const [quality, setQuality] = useState("");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [sort, setSort] = useState<StockSort>("stock_desc");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const brands = useMemo(() => uniqueSorted(items.map((item) => item.brand)), [items]);
  const qualities = useMemo(() => uniqueSorted(items.flatMap((item) => item.qualityLabels)), [items]);
  const factories = useMemo(
    () => uniqueSorted(items.map((item) => item.factory)) as InventoryModelListItem["factory"][],
    [items],
  );
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
        if (factory && item.factory !== factory) return false;
        if (brand && item.brand !== brand) return false;
        if (quality && !item.qualityLabels.includes(quality)) return false;
        return matchesSearch(item, deferredSearch);
      }),
    [brand, deferredSearch, factory, items, kind, quality],
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
    factory ? { label: `Fábrica: ${factoryLabel(factory)}`, clear: () => setFactory("") } : null,
    brand ? { label: `Marca: ${brand}`, clear: () => setBrand("") } : null,
    quality ? { label: `Qualidade: ${quality}`, clear: () => setQuality("") } : null,
    search ? { label: `Busca: ${search}`, clear: () => setSearch("") } : null,
    !onlyInStock ? { label: "Incluindo zerados", clear: () => setOnlyInStock(true) } : null,
  ].filter((crumb): crumb is { label: string; clear: () => void } => Boolean(crumb));

  function clearAllFilters() {
    setKind("all");
    setBrand("");
    setFactory("");
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
            <span className="invsales-control-label">Fábrica</span>
            <select value={factory} onChange={(event) => setFactory(event.target.value as StockFactoryFilter)}>
              <option value="">Todas</option>
              {factories.map((item) => (
                <option key={item} value={item}>{factoryLabel(item)}</option>
              ))}
            </select>
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
              Clique na linha para ver o top 10 de clientes ou use Analisar para abrir a visão comercial completa.
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
                <th>Fábrica</th>
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
                <th className="num">Análise</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const isSelected = selectedModelKey === item.modelKey;

                return (
                  <Fragment key={item.modelKey}>
                    <tr
                      aria-expanded={isSelected}
                      className={`group-row invstock-model-row ${isSelected ? "open" : ""}`}
                      onClick={() => onSelectModel(isSelected ? null : item.modelKey)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectModel(isSelected ? null : item.modelKey);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td className="invsales-rank">{index + 1}</td>
                      <td>
                        <div className="invsales-cell-main">
                          <strong><ChevronRight className={isSelected ? "expanded" : ""} size={14} /> {item.modelLabel}</strong>
                        </div>
                      </td>
                      <td><span className={`invstock-type ${item.productKind.toLowerCase()}`}>{productKindLabel(item.productKind)}</span></td>
                      <td><span className="invstock-brand">{factoryLabel(item.factory)}</span></td>
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
                      <td className="num">
                        <Link
                          className="ghost-button small-button invstock-analysis-button"
                          onClick={(event) => event.stopPropagation()}
                          to={`/estoque/modelos/${encodeURIComponent(item.modelKey)}`}
                        >
                          <BarChart3 size={14} /> Analisar
                        </Link>
                      </td>
                    </tr>
                    {isSelected ? (
                      <tr className="invstock-preview-row">
                        <td colSpan={8}>
                          <StockCustomerPreview
                            detail={detail}
                            isError={isDetailError}
                            isLoading={isDetailLoading}
                            model={item}
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

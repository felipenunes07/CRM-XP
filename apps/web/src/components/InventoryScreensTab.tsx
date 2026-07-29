import type { InventoryModelListItem, InventoryModelsResponse } from "@olist-crm/shared";
import { useDeferredValue, useMemo, useState } from "react";
import { MonitorSmartphone, PackageCheck, Tags } from "lucide-react";
import { formatNumber } from "../lib/format";

type ScreenSort = "stock_desc" | "stock_asc" | "name_asc";

interface InventoryScreensTabProps {
  data: InventoryModelsResponse | undefined;
  isError: boolean;
  isLoading: boolean;
  onOpenDetails: (modelKey: string) => void;
}

function sortLabels(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function matchesSearch(item: InventoryModelListItem, search: string) {
  if (!search) {
    return true;
  }

  return [item.sku, item.modelLabel, item.brand, item.family, item.qualityLabels.join(" "), item.sampleSkus.join(" ")]
    .join(" ")
    .toLocaleLowerCase("pt-BR")
    .includes(search);
}

export function InventoryScreensTab({ data, isError, isLoading, onOpenDetails }: InventoryScreensTabProps) {
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [quality, setQuality] = useState("");
  const [sort, setSort] = useState<ScreenSort>("stock_desc");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));

  const screens = useMemo(() => (data?.items ?? []).filter((item) => item.productKind === "TELA"), [data?.items]);
  const brands = useMemo(() => sortLabels(screens.map((item) => item.brand)), [screens]);
  const qualities = useMemo(() => sortLabels(screens.flatMap((item) => item.qualityLabels)), [screens]);

  const visibleScreens = useMemo(() => {
    const filtered = screens.filter((item) => {
      if (onlyInStock && item.stockUnits <= 0) {
        return false;
      }

      if (brand && item.brand !== brand) {
        return false;
      }

      if (quality && !item.qualityLabels.includes(quality)) {
        return false;
      }

      return matchesSearch(item, deferredSearch);
    });

    return filtered.sort((left, right) => {
      if (sort === "stock_asc") {
        return left.stockUnits - right.stockUnits || left.modelLabel.localeCompare(right.modelLabel, "pt-BR");
      }

      if (sort === "name_asc") {
        return left.modelLabel.localeCompare(right.modelLabel, "pt-BR");
      }

      return right.stockUnits - left.stockUnits || left.modelLabel.localeCompare(right.modelLabel, "pt-BR");
    });
  }, [brand, deferredSearch, onlyInStock, quality, screens, sort]);

  const totalStockUnits = useMemo(() => screens.reduce((total, item) => total + Math.max(0, item.stockUnits), 0), [screens]);
  const filteredStockUnits = useMemo(
    () => visibleScreens.reduce((total, item) => total + Math.max(0, item.stockUnits), 0),
    [visibleScreens],
  );
  const activeScreenCount = useMemo(() => screens.filter((item) => item.stockUnits > 0).length, [screens]);

  function clearFilters() {
    setSearch("");
    setBrand("");
    setQuality("");
    setSort("stock_desc");
    setOnlyInStock(true);
  }

  if (isLoading) {
    return <div className="empty-state">Carregando telas da planilha...</div>;
  }

  if (isError) {
    return <div className="empty-state">Não foi possível carregar as telas agora. Tente atualizar a página.</div>;
  }

  return (
    <>
      <section className="inventory-screen-summary" aria-label="Resumo das telas">
        <article className="panel inventory-screen-summary-card">
          <span className="inventory-screen-summary-icon tone-primary">
            <MonitorSmartphone size={20} />
          </span>
          <div>
            <span>Telas em estoque</span>
            <strong>{formatNumber(totalStockUnits)}</strong>
            <small>Quantidade total disponível</small>
          </div>
        </article>

        <article className="panel inventory-screen-summary-card">
          <span className="inventory-screen-summary-icon tone-success">
            <PackageCheck size={20} />
          </span>
          <div>
            <span>Modelos com saldo</span>
            <strong>{formatNumber(activeScreenCount)}</strong>
            <small>Telas disponíveis para venda</small>
          </div>
        </article>

        <article className="panel inventory-screen-summary-card">
          <span className="inventory-screen-summary-icon tone-neutral">
            <Tags size={20} />
          </span>
          <div>
            <span>Marcas no catálogo</span>
            <strong>{formatNumber(brands.length)}</strong>
            <small>Use o filtro para encontrar rápido</small>
          </div>
        </article>
      </section>

      <section className="panel inventory-screen-filter-panel">
        <div className="inventory-screen-filter-grid">
          <label className="inventory-screen-search">
            Buscar tela
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Digite o modelo ou SKU"
            />
          </label>

          <label>
            Marca
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="">Todas as marcas</option>
              {brands.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Qualidade
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              <option value="">Todas as qualidades</option>
              {qualities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ordenar
            <select value={sort} onChange={(event) => setSort(event.target.value as ScreenSort)}>
              <option value="stock_desc">Maior estoque primeiro</option>
              <option value="stock_asc">Menor estoque primeiro</option>
              <option value="name_asc">Modelo de A a Z</option>
            </select>
          </label>
        </div>

        <div className="inventory-screen-filter-footer">
          <label className="inventory-screen-checkbox">
            <input type="checkbox" checked={onlyInStock} onChange={(event) => setOnlyInStock(event.target.checked)} />
            <span>Mostrar somente telas com estoque</span>
          </label>

          <div className="inventory-screen-filter-result">
            <span>
              {formatNumber(visibleScreens.length)} telas · {formatNumber(filteredStockUnits)} peças
            </span>
            {(search || brand || quality || sort !== "stock_desc" || !onlyInStock) ? (
              <button type="button" className="ghost-button small-button" onClick={clearFilters}>
                Limpar filtros
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="panel inventory-screen-table-panel">
        <div className="inventory-section-heading">
          <div>
            <p className="eyebrow">Estoque atual</p>
            <h3>Quantidade por tela</h3>
            <p className="panel-subcopy">Dados da última leitura da planilha diária.</p>
          </div>
          <span>{formatNumber(visibleScreens.length)} resultados</span>
        </div>

        {visibleScreens.length ? (
          <div className="inventory-screen-table-wrap">
            <table className="data-table inventory-screen-table">
              <thead>
                <tr>
                  <th>Tela</th>
                  <th>Marca</th>
                  <th>Família</th>
                  <th>Qualidade</th>
                  <th>SKUs com saldo</th>
                  <th>Quantidade</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visibleScreens.map((item) => (
                  <tr key={item.modelKey}>
                    <td>
                      <div className="inventory-screen-name">
                        <strong>{item.modelLabel}</strong>
                        <span>SKU {item.sku}</span>
                      </div>
                    </td>
                    <td>
                      <span className="inventory-screen-brand">{item.brand}</span>
                    </td>
                    <td>{item.family}</td>
                    <td>{item.qualityLabels.join(", ") || "Sem qualidade"}</td>
                    <td>
                      {formatNumber(item.activeSkuCount)} de {formatNumber(item.totalSkuCount)}
                    </td>
                    <td>
                      <div className={`inventory-screen-stock ${item.stockUnits <= 0 ? "is-empty" : ""}`}>
                        <strong>{formatNumber(item.stockUnits)}</strong>
                        <span>peças</span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button small-button"
                        onClick={() => onOpenDetails(item.modelKey)}
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Nenhuma tela corresponde aos filtros selecionados.</div>
        )}
      </section>
    </>
  );
}

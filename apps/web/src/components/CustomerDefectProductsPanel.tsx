import type { CustomerDefectProductRow, CustomerDefectProductsResponse } from "@olist-crm/shared";
import { useMemo, useState } from "react";
import { formatCurrency, formatNumber, formatPrecisePercent } from "../lib/format";

type ProductSort = "model" | "quality" | "sold" | "returned" | "rate" | "amount";
type SortDirection = "asc" | "desc";

function rateLabel(rate: number | null) {
  return rate === null ? "Sem vendas" : formatPrecisePercent(rate);
}

function sortProducts(rows: CustomerDefectProductRow[], sort: ProductSort, direction: SortDirection) {
  return [...rows].sort((left, right) => {
    let comparison = 0;
    if (sort === "model") comparison = left.model.localeCompare(right.model, "pt-BR");
    else if (sort === "quality") comparison = left.quality.localeCompare(right.quality, "pt-BR");
    else if (sort === "rate") comparison = (left.returnRate ?? -1) - (right.returnRate ?? -1);
    else if (sort === "sold") comparison = left.soldPieces - right.soldPieces;
    else if (sort === "amount") comparison = left.returnedAmount - right.returnedAmount;
    else comparison = left.returnedPieces - right.returnedPieces;
    return (direction === "asc" ? comparison : -comparison) || left.model.localeCompare(right.model, "pt-BR");
  });
}

function summarizeRows(rows: CustomerDefectProductRow[]) {
  const soldPieces = rows.reduce((sum, row) => sum + row.soldPieces, 0);
  const returnedPieces = rows.reduce((sum, row) => sum + row.returnedPieces, 0);
  return { soldPieces, returnedPieces, returnRate: soldPieces > 0 ? returnedPieces / soldPieces : null };
}

export function CustomerDefectProductsPanel({ data, isLoading, isError, years, year, onYearChange }: {
  data: CustomerDefectProductsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  years: number[];
  year: number;
  onYearChange: (year: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState("");
  const [factory, setFactory] = useState("");
  const [highlightBrand, setHighlightBrand] = useState("IPHONE");
  const [sort, setSort] = useState<ProductSort>("returned");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [onlyWithReturns, setOnlyWithReturns] = useState(true);

  const brands = useMemo(() => [...new Set((data?.rows ?? []).map((row) => row.brand))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data?.rows]);
  const factories = useMemo(() => [...new Set((data?.rows ?? []).map((row) => row.factory))], [data?.rows]);
  const highlightSummary = useMemo(() => summarizeRows((data?.rows ?? []).filter((row) => row.brand === highlightBrand)), [data?.rows, highlightBrand]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const rows = (data?.rows ?? []).filter((row) => {
      if (onlyWithReturns && row.returnedPieces <= 0) return false;
      if (quality && row.quality !== quality) return false;
      if (factory && row.factory !== factory) return false;
      if (!normalizedSearch) return true;
      return `${row.model} ${row.sku} ${row.brand} ${row.factory} ${row.quality}`.toLowerCase().includes(normalizedSearch);
    });
    return sortProducts(rows, sort, sortDirection);
  }, [data?.rows, factory, onlyWithReturns, quality, search, sort, sortDirection]);

  function changeSort(nextSort: ProductSort) {
    if (sort === nextSort) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSort(nextSort);
      setSortDirection(nextSort === "model" || nextSort === "quality" ? "asc" : "desc");
    }
  }

  function sortableHeader(key: ProductSort, label: string) {
    return <button type="button" onClick={() => changeSort(key)}>{label}<span aria-hidden>{sort === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button>;
  }

  return (
    <div className="customer-defect-products-workspace">
      <section className="customer-defect-vv-highlight customer-defect-brand-highlight">
        <div>
          <p className="eyebrow">Análise por marca</p>
          <h3>Percentual de troca de {highlightBrand}</h3>
          <span>Compare as peças trocadas com o volume vendido da marca no período selecionado.</span>
        </div>
        <label className="customer-defect-highlight-select">
          <span>Marca analisada</span>
          <select value={highlightBrand} onChange={(event) => setHighlightBrand(event.target.value)}>
            {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </label>
        <div className="customer-defect-vv-rate">
          <strong>{data ? rateLabel(highlightSummary.returnRate) : "--"}</strong>
          <span>{formatNumber(highlightSummary.returnedPieces)} trocadas de {formatNumber(highlightSummary.soldPieces)} vendidas</span>
        </div>
      </section>

      <section className="panel customer-defect-product-filters">
        <label><span>Ano</span><select value={year} onChange={(event) => onYearChange(Number(event.target.value))}>{years.map((availableYear) => <option key={availableYear} value={availableYear}>{availableYear}</option>)}</select></label>
        <label><span>Qualidade</span><select value={quality} onChange={(event) => setQuality(event.target.value)}><option value="">Todas</option>{(data?.qualities ?? []).map((entry) => <option key={entry.quality} value={entry.quality}>{entry.quality}</option>)}</select></label>
        <label><span>Fábrica</span><select value={factory} onChange={(event) => setFactory(event.target.value)}><option value="">Todas</option>{factories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
        <label className="customer-defect-product-search"><span>Modelo ou SKU</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: IP-XR ou CX059-1" /></label>
        <label className="customer-defect-product-toggle"><input type="checkbox" checked={onlyWithReturns} onChange={(event) => setOnlyWithReturns(event.target.checked)} /><span>Somente modelos com troca</span></label>
      </section>

      {isLoading ? <div className="page-loading">Calculando modelos e qualidades...</div> : null}
      {isError ? <div className="page-error">Não foi possível calcular as trocas por modelo.</div> : null}

      {data ? <>
        <section className="customer-defect-quality-summary" aria-label="Resumo por qualidade">
          {data.qualities.slice(0, 8).map((entry) => <button type="button" key={entry.quality} className={quality === entry.quality ? "active" : ""} onClick={() => setQuality(quality === entry.quality ? "" : entry.quality)}><span>{entry.quality}</span><strong>{rateLabel(entry.returnRate)}</strong><small>{formatNumber(entry.returnedPieces)} trocas</small></button>)}
        </section>
        <div className="credit-results-meta"><p>{formatNumber(filteredRows.length)} modelos no ranking de {data.periodStartDate} a {data.periodEndDate}.</p></div>
        <div className="panel table-panel customer-defect-products-table-panel"><div className="table-scroll"><table className="data-table customer-defect-products-table">
          <thead><tr><th>{sortableHeader("model", "Modelo")}</th><th>{sortableHeader("quality", "Qualidade")}</th><th>{sortableHeader("sold", "Vendidas")}</th><th>{sortableHeader("returned", "Trocadas")}</th><th>{sortableHeader("rate", "Taxa")}</th><th>{sortableHeader("amount", "Valor das trocas")}</th></tr></thead>
          <tbody>{filteredRows.map((row) => <tr key={`${row.sku}-${row.quality}`} className={row.isVv ? "is-vv" : ""}><td><strong>{row.model}</strong><span>{row.sku} · {row.brand} · {row.factory}</span></td><td><span className="defect-quality-pill">{row.quality}</span></td><td>{formatNumber(row.soldPieces)}</td><td><strong>{formatNumber(row.returnedPieces)}</strong></td><td><span className="defect-rate-pill">{rateLabel(row.returnRate)}</span></td><td>{formatCurrency(row.returnedAmount)}</td></tr>)}</tbody>
        </table></div></div>
      </> : null}
    </div>
  );
}

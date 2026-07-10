import type { CustomerDefectProductRow, CustomerDefectProductsResponse } from "@olist-crm/shared";
import { useMemo, useState } from "react";
import { formatCurrency, formatNumber, formatPrecisePercent } from "../lib/format";

type ProductSort = "returned" | "rate" | "sold";

function rateLabel(rate: number | null) {
  return rate === null ? "Sem vendas" : formatPrecisePercent(rate);
}

function sortProducts(rows: CustomerDefectProductRow[], sort: ProductSort) {
  return [...rows].sort((left, right) => {
    if (sort === "rate") {
      return (right.returnRate ?? -1) - (left.returnRate ?? -1) || right.returnedPieces - left.returnedPieces;
    }
    if (sort === "sold") {
      return right.soldPieces - left.soldPieces || right.returnedPieces - left.returnedPieces;
    }
    return right.returnedPieces - left.returnedPieces || (right.returnRate ?? -1) - (left.returnRate ?? -1);
  });
}

export function CustomerDefectProductsPanel({
  data,
  isLoading,
  isError,
  years,
  year,
  onYearChange,
}: {
  data: CustomerDefectProductsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  years: number[];
  year: number;
  onYearChange: (year: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState("");
  const [sort, setSort] = useState<ProductSort>("returned");
  const [onlyWithReturns, setOnlyWithReturns] = useState(true);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const rows = (data?.rows ?? []).filter((row) => {
      if (onlyWithReturns && row.returnedPieces <= 0) return false;
      if (quality && row.quality !== quality) return false;
      if (!normalizedSearch) return true;
      return `${row.model} ${row.sku} ${row.quality}`.toLowerCase().includes(normalizedSearch);
    });
    return sortProducts(rows, sort);
  }, [data?.rows, onlyWithReturns, quality, search, sort]);

  return (
    <div className="customer-defect-products-workspace">
      <section className="customer-defect-vv-highlight">
        <div>
          <p className="eyebrow">Linha [ VV ]</p>
          <h3>Percentual de troca da linha VV</h3>
          <span>
            Identificada somente por <strong>[ VV ]</strong> no modelo ou <strong>VV</strong> isolado na qualidade.
          </span>
        </div>
        <div className="customer-defect-vv-rate">
          <strong>{data ? rateLabel(data.vvSummary.returnRate) : "--"}</strong>
          <span>
            {formatNumber(data?.vvSummary.returnedPieces ?? 0)} trocadas de {formatNumber(data?.vvSummary.soldPieces ?? 0)} vendidas
          </span>
        </div>
      </section>

      <section className="panel customer-defect-product-filters">
        <label>
          <span>Ano</span>
          <select value={year} onChange={(event) => onYearChange(Number(event.target.value))}>
            {years.map((availableYear) => <option key={availableYear} value={availableYear}>{availableYear}</option>)}
          </select>
        </label>
        <label>
          <span>Qualidade</span>
          <select value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="">Todas</option>
            {(data?.qualities ?? []).map((entry) => (
              <option key={entry.quality} value={entry.quality}>{entry.quality}</option>
            ))}
          </select>
        </label>
        <label className="customer-defect-product-search">
          <span>Modelo ou SKU</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: IP-XR ou CX059-1" />
        </label>
        <label>
          <span>Ordenar</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as ProductSort)}>
            <option value="returned">Mais peças trocadas</option>
            <option value="rate">Maior taxa de troca</option>
            <option value="sold">Mais vendidas</option>
          </select>
        </label>
        <label className="customer-defect-product-toggle">
          <input type="checkbox" checked={onlyWithReturns} onChange={(event) => setOnlyWithReturns(event.target.checked)} />
          <span>Somente modelos com troca</span>
        </label>
      </section>

      {isLoading ? <div className="page-loading">Calculando modelos e qualidades...</div> : null}
      {isError ? <div className="page-error">Nao foi possivel calcular as trocas por modelo.</div> : null}

      {data ? (
        <>
          <section className="customer-defect-quality-summary" aria-label="Resumo por qualidade">
            {data.qualities.slice(0, 8).map((entry) => (
              <button type="button" key={entry.quality} className={quality === entry.quality ? "active" : ""} onClick={() => setQuality(quality === entry.quality ? "" : entry.quality)}>
                <span>{entry.quality}</span>
                <strong>{rateLabel(entry.returnRate)}</strong>
                <small>{formatNumber(entry.returnedPieces)} trocas</small>
              </button>
            ))}
          </section>

          <div className="credit-results-meta">
            <p>
              {formatNumber(filteredRows.length)} modelos no ranking de {data.periodStartDate} a {data.periodEndDate}.
            </p>
          </div>

          <div className="panel table-panel customer-defect-products-table-panel">
            <div className="table-scroll">
              <table className="data-table customer-defect-products-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Qualidade</th>
                    <th>Vendidas</th>
                    <th>Trocadas</th>
                    <th>Taxa</th>
                    <th>Valor das trocas</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={`${row.sku}-${row.quality}`} className={row.isVv ? "is-vv" : ""}>
                      <td><strong>{row.model}</strong><span>{row.sku}</span></td>
                      <td><span className="defect-quality-pill">{row.quality}</span></td>
                      <td>{formatNumber(row.soldPieces)}</td>
                      <td><strong>{formatNumber(row.returnedPieces)}</strong></td>
                      <td><span className="defect-rate-pill">{rateLabel(row.returnRate)}</span></td>
                      <td>{formatCurrency(row.returnedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

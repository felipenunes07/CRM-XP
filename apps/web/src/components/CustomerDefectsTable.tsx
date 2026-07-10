import type { CustomerDefectRow } from "@olist-crm/shared";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "../lib/format";
import type { CustomerDefectSortKey } from "../pages/customersPage.helpers";

function returnRateLabel(row: CustomerDefectRow) {
  if (row.returnRate === null) {
    return "Sem compra";
  }

  return formatPercent(row.returnRate);
}

function returnRateTone(row: CustomerDefectRow, overallRate: number | null | undefined) {
  if (row.returnRate === null) return "muted";
  if (overallRate !== null && overallRate !== undefined && row.returnRate > overallRate) return "danger";
  if (row.returnRate >= 0.08) return "warning";
  return "success";
}

export function CustomerDefectsTable({
  rows,
  overallRate,
  emptyMessage,
  sort,
  onSortChange,
  onSelectRow,
}: {
  rows: CustomerDefectRow[];
  overallRate: number | null | undefined;
  emptyMessage: string;
  sort: { key: CustomerDefectSortKey; direction: "asc" | "desc" };
  onSortChange: (key: CustomerDefectSortKey) => void;
  onSelectRow: (row: CustomerDefectRow) => void;
}) {
  if (!rows.length) {
    return (
      <div className="panel table-panel empty-panel">
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="panel table-panel customer-defects-table-panel">
      <div className="table-scroll">
        <table className="data-table customer-defects-table">
          <thead>
            <tr>
              <SortableHeader label="Cliente" column="customer" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Taxa troca" column="returnRate" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Comprou" column="purchasedPieces" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Trocou" column="returnedPieces" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Reposicoes" column="replacementPieces" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Faturamento" column="revenue" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Valor troca" column="returnedAmount" sort={sort} onSortChange={onSortChange} />
              <SortableHeader label="Ultima troca" column="lastDefectDate" sort={sort} onSortChange={onSortChange} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const client = (
                <span className="table-link">
                  <strong>{row.customerDisplayName}</strong>
                  <span>{row.customerCode}</span>
                </span>
              );

              return (
                <tr key={row.id} className="customer-defect-clickable-row" onClick={() => onSelectRow(row)}>
                  <td>
                    <button type="button" className="table-link-button">
                      {client}
                    </button>
                  </td>
                  <td>
                    <span className={`defect-rate-pill tone-${returnRateTone(row, overallRate)}`}>
                      {returnRateLabel(row)}
                    </span>
                  </td>
                  <td>
                    <div className="defect-table-metric">
                      <strong>{formatNumber(row.purchasedPieces)}</strong>
                      <span>{formatNumber(row.orderCount)} pedidos</span>
                    </div>
                  </td>
                  <td>
                    <div className="defect-table-metric">
                      <strong>{formatNumber(row.returnedPieces)}</strong>
                      <span>{formatNumber(row.defectSkuCount)} SKUs</span>
                    </div>
                  </td>
                  <td>
                    <div className="defect-table-metric">
                      <strong>{formatNumber(row.replacementPieces)}</strong>
                      <span>saidas registradas</span>
                    </div>
                  </td>
                  <td>{formatCurrency(row.revenue)}</td>
                  <td>{formatCurrency(row.returnedAmount)}</td>
                  <td>{formatDate(row.lastDefectDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  column,
  sort,
  onSortChange,
}: {
  label: string;
  column: CustomerDefectSortKey;
  sort: { key: CustomerDefectSortKey; direction: "asc" | "desc" };
  onSortChange: (key: CustomerDefectSortKey) => void;
}) {
  const active = sort.key === column;
  return (
    <th>
      <button
        type="button"
        className={`sortable-table-header ${active ? "active" : ""}`}
        onClick={() => onSortChange(column)}
      >
        <span>{label}</span>
        <span aria-hidden="true">{active ? (sort.direction === "desc" ? "DESC" : "ASC") : "SORT"}</span>
      </button>
    </th>
  );
}

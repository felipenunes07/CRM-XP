import type { CustomerDefectRow } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "../lib/format";

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
}: {
  rows: CustomerDefectRow[];
  overallRate: number | null | undefined;
  emptyMessage: string;
}) {
  if (!rows.length) {
    return (
      <div className="panel table-panel empty-panel">
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="panel table-panel">
      <div className="table-scroll">
        <table className="data-table customer-defects-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Taxa</th>
              <th>Comprou</th>
              <th>Retornou</th>
              <th>Trocadas</th>
              <th>Faturamento</th>
              <th>Valor retorno</th>
              <th>Ultimo retorno</th>
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
                <tr key={row.id}>
                  <td>{row.customerId ? <Link to={`/clientes/${row.customerId}`}>{client}</Link> : client}</td>
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
                      <span>saidas/trocas</span>
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

import type { CustomerOpportunityQueueItem } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatDaysSince, formatPercent } from "../lib/format";

interface CustomerOpportunityTableProps {
  rows: CustomerOpportunityQueueItem[];
  emptyMessage: string;
}

function sourceLabel(row: CustomerOpportunityQueueItem) {
  return row.primarySource === "CREDIT_BALANCE" ? "Saldo a favor" : "Credito livre";
}

export function CustomerOpportunityTable({ rows, emptyMessage }: CustomerOpportunityTableProps) {
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
        <table className="data-table opportunity-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Origem</th>
              <th>Valor alvo</th>
              <th>Sugestao</th>
              <th>Cobertura</th>
              <th>Mix em estoque</th>
              <th>Ultima compra</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.customerId}
                className={row.primarySource === "CREDIT_BALANCE" ? "opportunity-row-priority" : "opportunity-row-credit"}
              >
                <td>
                  <div className="table-link">
                    <strong>{row.customerDisplayName}</strong>
                    <span>{row.customerCode}</span>
                  </div>
                </td>
                <td>
                  <span className={`credit-action-pill ${row.primarySource === "CREDIT_BALANCE" ? "tone-success" : "tone-info"}`}>
                    {sourceLabel(row)}
                  </span>
                </td>
                <td>
                  <div className="table-link">
                    <strong>{formatCurrency(row.targetAmount)}</strong>
                    <span>
                      {row.creditBalanceAmount > 0 ? `Saldo ${formatCurrency(row.creditBalanceAmount)}` : `Credito ${formatCurrency(row.availableCreditAmount)}`}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="table-link">
                    <strong>{formatCurrency(row.suggestedAmount)}</strong>
                    <span>Gap {formatCurrency(row.remainingGapAmount)}</span>
                  </div>
                </td>
                <td>
                  <div className="table-link">
                    <strong>{formatPercent(row.coverageRatio)}</strong>
                    <span>
                      {row.suggestedLineCount} itens sugeridos / {row.matchedProductCount} do mix
                    </span>
                  </div>
                </td>
                <td>
                  <div className="table-link">
                    <strong>{row.topModelsInStock[0] ?? "Sem match"}</strong>
                    <span>{row.topModelsInStock.slice(1).join(", ") || "Sem outros modelos no topo"}</span>
                  </div>
                </td>
                <td>
                  <div className="table-link">
                    <strong>{formatDate(row.lastPurchaseAt)}</strong>
                    <span>{formatDaysSince(row.daysSinceLastPurchase)}</span>
                  </div>
                </td>
                <td className="credit-cell-action">
                  <Link className="primary-button small-button" to={`/clientes/${row.customerId}`}>
                    Montar abordagem
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { CustomerDocInsightListItem } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";

export function CustomerDocInsightsTable({ ranking }: { ranking: CustomerDocInsightListItem[] }) {
  if (!ranking.length) {
    return (
      <div className="panel table-panel empty-panel">
        <div className="empty-state">Ainda nao encontramos compras de DOC para montar o ranking.</div>
      </div>
    );
  }

  return (
    <div className="panel table-panel">
      <div className="table-scroll">
        <table className="data-table customer-doc-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Status</th>
              <th>Pecas DOC</th>
              <th>Pedidos DOC</th>
              <th>Faturamento DOC</th>
              <th>Ultima compra DOC</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link className="table-link" to={`/clientes/${customer.id}`}>
                    <strong>{customer.displayName}</strong>
                    <span>{customer.customerCode}</span>
                  </Link>
                </td>
                <td>
                  <span className={`status-badge status-${customer.status.toLowerCase()}`}>{statusLabel(customer.status)}</span>
                </td>
                <td>{formatNumber(customer.docQuantity)}</td>
                <td>{formatNumber(customer.docOrderCount)}</td>
                <td>{formatCurrency(customer.docRevenue)}</td>
                <td>{formatDate(customer.lastDocPurchaseAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

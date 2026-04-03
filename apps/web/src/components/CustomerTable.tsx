import type { CustomerListItem } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { InfoHint } from "./InfoHint";
import { formatCurrency, formatDate, formatDaysSince, statusLabel } from "../lib/format";

export function CustomerTable({ customers }: { customers: CustomerListItem[] }) {
  if (!customers.length) {
    return (
      <div className="panel table-panel empty-panel">
        <div className="empty-state">Nenhum cliente encontrado para esse filtro.</div>
      </div>
    );
  }

  return (
    <div className="panel table-panel">
      <table className="data-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Status</th>
            <th>Ultima compra</th>
            <th>Tempo sem comprar</th>
            <th>Pedidos</th>
            <th>Ticket medio</th>
            <th>Total gasto</th>
            <th>Rotulos</th>
            <th>
              <span className="header-with-info">
                Prioridade
                <InfoHint text="Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida." />
              </span>
            </th>
            <th>Insight</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
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
              <td>{formatDate(customer.lastPurchaseAt)}</td>
              <td>{formatDaysSince(customer.daysSinceLastPurchase)}</td>
              <td>{customer.totalOrders}</td>
              <td>{formatCurrency(customer.avgTicket)}</td>
              <td>{formatCurrency(customer.totalSpent)}</td>
              <td>
                <div className="tag-row compact">
                  {customer.labels.length ? (
                    customer.labels.map((label) => (
                      <span
                        key={label.id}
                        className="tag"
                        style={{ background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }}
                      >
                        {label.name}
                      </span>
                    ))
                  ) : (
                    <span className="muted-copy">Sem rótulo</span>
                  )}
                </div>
              </td>
              <td>{customer.priorityScore.toFixed(1)}</td>
              <td>{customer.primaryInsight ?? "Sem alerta"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

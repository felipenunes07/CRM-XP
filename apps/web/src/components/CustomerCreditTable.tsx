import type { CustomerCreditRow } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatDaysSince } from "../lib/format";
import {
  customerCreditHeadlineClassName,
  customerCreditHeadlineLabel,
  customerCreditPrimaryLabel,
  customerCreditRiskClassName,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";

interface CustomerCreditTableProps {
  rows: CustomerCreditRow[];
  emptyMessage: string;
  linkedOnly?: boolean;
}

export function CustomerCreditTable({
  rows,
  emptyMessage,
  linkedOnly = true,
}: CustomerCreditTableProps) {
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
        <table className="data-table customer-credit-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Leitura</th>
              <th>Em aberto / saldo</th>
              <th>Limite</th>
              <th>Disponivel</th>
              <th>Ult. pagamento</th>
              <th>Alertas</th>
              {linkedOnly ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const visibleFlags = customerCreditVisibleFlags(row);

              return (
                <tr key={row.id}>
                  <td>
                    {row.customerId ? (
                      <Link className="table-link" to={`/clientes/${row.customerId}`}>
                        <strong>{row.customerDisplayName}</strong>
                        <span>{row.customerCode}</span>
                        <small>{row.observation || "Sem observacao relevante."}</small>
                      </Link>
                    ) : (
                      <div className="table-link">
                        <strong>{row.sourceDisplayName ?? row.customerDisplayName}</strong>
                        <span>{row.customerCode}</span>
                        <small>{row.observation || "Sem observacao relevante."}</small>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="customer-credit-table-status">
                      <span className={`tag credit-badge ${customerCreditHeadlineClassName(row)}`}>
                        {customerCreditHeadlineLabel(row)}
                      </span>
                      <span className={`tag credit-badge ${customerCreditRiskClassName(row.riskLevel)}`}>
                        {customerCreditRiskLabel(row.riskLevel)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <strong
                      className={
                        row.debtAmount > 0
                          ? "credit-amount-danger"
                          : row.creditBalanceAmount > 0
                            ? "credit-amount-success"
                            : ""
                      }
                    >
                      {formatCurrency(row.debtAmount > 0 ? row.debtAmount : row.creditBalanceAmount)}
                    </strong>
                    <span className="table-inline-muted">{customerCreditPrimaryLabel(row)}</span>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.creditLimit)}</strong>
                  </td>
                  <td>
                    <strong>{formatCurrency(row.availableCreditAmount)}</strong>
                    <span className="table-inline-muted">
                      {row.hasOverCredit
                        ? "Acima do limite"
                        : row.withinCreditLimit
                          ? "Dentro do limite"
                          : row.creditLimit > 0
                            ? "Livre"
                            : "Sem limite"}
                    </span>
                  </td>
                  <td>
                    <strong>{formatDate(row.lastPaymentDate)}</strong>
                    <span className="table-inline-muted">{formatDaysSince(row.daysSinceLastPayment)}</span>
                  </td>
                  <td className="customer-credit-alert-cell">
                    <div className="tag-row compact">
                      {visibleFlags.length ? (
                        visibleFlags.map((flag) => (
                          <span key={`${row.id}-${flag}`} className="tag customer-credit-flag">
                            {flag}
                          </span>
                        ))
                      ) : (
                        <span className="muted-copy">Sem flags</span>
                      )}
                    </div>
                  </td>
                  {linkedOnly ? (
                    <td className="customer-credit-open-cell">
                      {row.customerId ? (
                        <Link className="ghost-button small" to={`/clientes/${row.customerId}`}>
                          Abrir
                        </Link>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { CustomerCreditRow } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "../lib/format";
import {
  customerCreditRiskClassName,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";

interface CustomerCreditTableProps {
  rows: CustomerCreditRow[];
  emptyMessage: string;
  linkedOnly?: boolean;
}

function creditUsagePercent(row: CustomerCreditRow) {
  if (row.creditLimit <= 0) {
    return row.debtAmount > 0 ? 100 : 0;
  }

  return Math.min((row.debtAmount / row.creditLimit) * 100, 120);
}

function usageBarColor(row: CustomerCreditRow) {
  if (row.hasOverCredit) return "danger";
  if (row.creditLimit <= 0 && row.debtAmount > 0) return "danger";
  const pct = creditUsagePercent(row);
  if (pct > 80) return "warning";
  if (pct > 0) return "info";
  return "success";
}

function prazoLabel(days: number | null) {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "Hoje";
  return `${days}d`;
}

function prazoTone(days: number | null) {
  if (days === null || days === undefined) return "";
  if (days > 90) return "credit-prazo-danger";
  if (days > 30) return "credit-prazo-warning";
  return "";
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
        <table className="data-table credit-table-v2">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Divida / Saldo</th>
              <th>Limite</th>
              <th>Disponivel</th>
              <th>Prazo</th>
              <th>Risco</th>
              <th>Uso do credito</th>
              {linkedOnly ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const flags = customerCreditVisibleFlags(row);
              const pct = creditUsagePercent(row);
              const barColor = usageBarColor(row);
              const hasBalance = row.creditBalanceAmount > 0;

              return (
                <tr key={row.id} className={row.hasOverCredit ? "credit-row-danger" : ""}>
                  {/* Cliente */}
                  <td>
                    <div className="credit-cell-client">
                      {row.customerId ? (
                        <Link className="credit-cell-client-link" to={`/clientes/${row.customerId}`}>
                          <strong>{row.customerDisplayName}</strong>
                          <span>{row.customerCode}</span>
                        </Link>
                      ) : (
                        <div className="credit-cell-client-link">
                          <strong>{row.sourceDisplayName ?? row.customerDisplayName}</strong>
                          <span>{row.customerCode}</span>
                        </div>
                      )}
                      {flags.length > 0 ? (
                        <div className="credit-cell-flags">
                          {flags.slice(0, 2).map((flag) => (
                            <span key={`${row.id}-${flag}`} className="credit-flag-dot" title={flag}>
                              {flag}
                            </span>
                          ))}
                          {flags.length > 2 ? (
                            <span className="credit-flag-more" title={flags.slice(2).join(", ")}>
                              +{flags.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>

                  {/* Dívida / Saldo */}
                  <td>
                    <div className="credit-cell-amount">
                      {row.debtAmount > 0 ? (
                        <>
                          <strong className="credit-amount-debt">{formatCurrency(row.debtAmount)}</strong>
                          <span>Em aberto</span>
                        </>
                      ) : hasBalance ? (
                        <>
                          <strong className="credit-amount-positive">{formatCurrency(row.creditBalanceAmount)}</strong>
                          <span>Saldo a favor</span>
                        </>
                      ) : (
                        <>
                          <strong>R$ 0,00</strong>
                          <span>Sem saldo</span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Limite */}
                  <td>
                    <strong>{row.creditLimit > 0 ? formatCurrency(row.creditLimit) : "—"}</strong>
                  </td>

                  {/* Disponível */}
                  <td>
                    <strong className={row.availableCreditAmount > 0 ? "credit-amount-positive" : ""}>
                      {row.creditLimit > 0 ? formatCurrency(row.availableCreditAmount) : "—"}
                    </strong>
                  </td>

                  {/* Prazo (dias sem pagar) */}
                  <td>
                    <div className="credit-cell-prazo">
                      <strong className={prazoTone(row.daysSinceLastPayment)}>
                        {prazoLabel(row.daysSinceLastPayment)}
                      </strong>
                      {row.lastPaymentDate ? (
                        <span>{formatDate(row.lastPaymentDate)}</span>
                      ) : (
                        <span>Sem pagamento</span>
                      )}
                    </div>
                  </td>

                  {/* Risco */}
                  <td>
                    <span className={`credit-risk-pill ${customerCreditRiskClassName(row.riskLevel)}`}>
                      {customerCreditRiskLabel(row.riskLevel)}
                    </span>
                  </td>

                  {/* Barra de Uso */}
                  <td>
                    {row.creditLimit > 0 ? (
                      <div className="credit-usage-cell">
                        <div className="credit-usage-track">
                          <div
                            className={`credit-usage-fill ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="credit-usage-label">
                          {pct > 100 ? `${Math.round(pct)}%` : `${Math.round(pct)}%`}
                        </span>
                      </div>
                    ) : (
                      <span className="credit-usage-nolimit">
                        {row.debtAmount > 0 ? "Sem limite" : "—"}
                      </span>
                    )}
                  </td>

                  {/* Ação */}
                  {linkedOnly ? (
                    <td className="credit-cell-action">
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

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

interface CustomerCreditCardListProps {
  rows: CustomerCreditRow[];
  emptyMessage: string;
  linkedOnly?: boolean;
}

function creditUsagePercent(row: CustomerCreditRow) {
  if (row.creditLimit <= 0) {
    return row.debtAmount > 0 ? 100 : 0;
  }

  return Math.min((row.debtAmount / row.creditLimit) * 100, 100);
}

export function CustomerCreditCardList({
  rows,
  emptyMessage,
  linkedOnly = true,
}: CustomerCreditCardListProps) {
  if (!rows.length) {
    return (
      <div className="panel empty-panel">
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="customer-credit-card-grid">
      {rows.map((row) => {
        const flags = customerCreditVisibleFlags(row);
        const progress = creditUsagePercent(row);
        const primaryAmount = row.debtAmount > 0 ? row.debtAmount : row.creditBalanceAmount;

        return (
          <article
            key={row.id}
            className={`panel customer-credit-card ${row.hasOverCredit ? "is-over-credit" : ""}`}
          >
            <div className="customer-credit-card-header">
              <div>
                <strong>{row.customerDisplayName}</strong>
                <span>{row.customerCode}</span>
              </div>

              {linkedOnly && row.customerId ? (
                <Link className="ghost-button small" to={`/clientes/${row.customerId}`}>
                  Abrir
                </Link>
              ) : null}
            </div>

            <div className="customer-credit-card-badges">
              <span className={`tag credit-badge ${customerCreditHeadlineClassName(row)}`}>
                {customerCreditHeadlineLabel(row)}
              </span>
              <span className={`tag credit-badge ${customerCreditRiskClassName(row.riskLevel)}`}>
                {customerCreditRiskLabel(row.riskLevel)}
              </span>
            </div>

            <div className="customer-credit-card-metrics">
              <div>
                <span>{customerCreditPrimaryLabel(row)}</span>
                <strong>{primaryAmount > 0 ? formatCurrency(primaryAmount) : "R$ 0,00"}</strong>
              </div>
              <div>
                <span>Credito liberado</span>
                <strong>{formatCurrency(row.creditLimit)}</strong>
              </div>
              <div>
                <span>Disponivel</span>
                <strong>{formatCurrency(row.availableCreditAmount)}</strong>
              </div>
            </div>

            {row.creditLimit > 0 ? (
              <div className="customer-credit-card-progress-block">
                <div className="customer-credit-card-progress-copy">
                  <span>Uso do limite</span>
                  <strong>{progress.toFixed(0)}%</strong>
                </div>
                <div className="customer-credit-card-progress-track">
                  <span
                    className={`customer-credit-card-progress-fill ${row.hasOverCredit ? "danger" : row.debtAmount > 0 ? "warning" : "success"}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="customer-credit-card-note">
                {row.debtAmount > 0 ? "Cliente com saldo em aberto e sem limite liberado." : "Sem limite liberado nesse snapshot."}
              </div>
            )}

            <div className="customer-credit-card-timeline">
              <span>Ult. pedido: {formatDate(row.lastOrderDate)}</span>
              <span>Ult. pagto: {formatDate(row.lastPaymentDate)}</span>
              <span>Dias sem pagar: {formatDaysSince(row.daysSinceLastPayment)}{row.paymentTerm ? ` (Limite: ${row.paymentTerm}d)` : ""}</span>
              
              {row.paymentTerm && row.daysSinceLastPayment !== null && (
                <div className="customer-credit-card-progress-track" style={{ height: "4px", margin: "8px 0 0 0" }}>
                  <span
                    className={`customer-credit-card-progress-fill ${
                      row.daysSinceLastPayment > row.paymentTerm
                        ? "danger"
                        : row.daysSinceLastPayment > row.paymentTerm * 0.8
                          ? "warning"
                          : "success"
                    }`}
                    style={{ width: `${Math.min((row.daysSinceLastPayment / row.paymentTerm) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="customer-credit-card-observation">
              <span>Observacao</span>
              <p>{row.observation || "Sem observacao relevante."}</p>
            </div>

            <div className="tag-row compact">
              {flags.length ? (
                flags.slice(0, 4).map((flag) => (
                  <span key={`${row.id}-${flag}`} className="tag customer-credit-flag">
                    {flag}
                  </span>
                ))
              ) : (
                <span className="muted-copy">Sem flags adicionais.</span>
              )}
              {flags.length > 4 ? <span className="muted-copy">+{flags.length - 4} alertas</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

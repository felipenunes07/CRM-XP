import type { CustomerCreditOrderEntry, CustomerCreditPaymentEntry } from "@olist-crm/shared";
import { useMemo } from "react";
import { computeOrderSettlements, type OrderSettlement } from "../lib/customerCredit";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import "./customerCreditBank.css";
import "./customerCreditDossie.css";

export function paymentTypeLabel(value: string) {
  if (value === "TRF") return "TRF";
  if (value === "DINHEIRO") return "Dinheiro";
  if (value === "TROCAS") return "Trocas";
  if (value === "CANCEL") return "Cancel.";
  if (value === "CUPOM SITE") return "Cupom";
  if (value === "LOGO") return "Logo";
  return value || "-";
}

export function CustomerCreditOrdersTable({
  orders,
  settlements,
}: {
  orders: CustomerCreditOrderEntry[];
  settlements?: Map<string, OrderSettlement>;
}) {
  if (!orders.length) {
    return <div className="bankfin-ledger-empty">Nenhum pedido detalhado nesse snapshot.</div>;
  }

  return (
    <table className="bankfin-ledger-table">
      <thead>
        <tr>
          <th>Pedido</th>
          <th className="is-right">Valor</th>
          <th className="is-right">Und.</th>
          <th>Data</th>
          <th>Situação</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const settlement = settlements?.get(order.id);
          return (
            <tr key={order.id} className={settlement ? `is-${settlement.kind}` : ""}>
              <td className="is-doc">
                <strong>{order.orderNumber || "-"}</strong>
                {order.seller ? <span>{order.seller}</span> : null}
              </td>
              <td className="is-right is-money">{formatCurrency(order.totalAmount)}</td>
              <td className="is-right is-units">{formatNumber(order.units)}</td>
              <td className="is-date">{formatDate(order.orderDate)}</td>
              <td className="is-status">
                {settlement ? (
                  <span className={`bankfin-status-cell ${settlement.kind}`}>{settlement.label}</span>
                ) : (
                  <span className="bankfin-status-cell none">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CustomerCreditPaymentsTable({ payments }: { payments: CustomerCreditPaymentEntry[] }) {
  if (!payments.length) {
    return <div className="bankfin-ledger-empty">Nenhum pagamento detalhado nesse snapshot.</div>;
  }

  return (
    <table className="bankfin-ledger-table">
      <thead>
        <tr>
          <th>Data</th>
          <th className="is-right">Pagamento</th>
          <th>Tipo</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((payment) => (
          // A observacao vira tooltip: quase sempre vazia, nao merece uma coluna.
          <tr key={payment.id} title={payment.observation || undefined}>
            <td className="is-date">{formatDate(payment.paymentDate)}</td>
            <td className="is-right is-money in">{formatCurrency(payment.amount)}</td>
            <td>
              <span className="bankfin-tag">{paymentTypeLabel(payment.paymentType)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CustomerCreditLedgerSections({
  orders,
  payments,
  totalOrders = orders.length,
  totalPayments = payments.length,
  debtAmount,
  paymentTerm,
}: {
  orders: CustomerCreditOrderEntry[];
  payments: CustomerCreditPaymentEntry[];
  totalOrders?: number;
  totalPayments?: number;
  /** Saldo devedor atual: sem ele não dá para saber quais pedidos estão em aberto. */
  debtAmount?: number;
  paymentTerm?: number | null;
}) {
  const ordersTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const settlements = useMemo(
    () =>
      debtAmount === undefined
        ? undefined
        : computeOrderSettlements(orders, debtAmount, paymentTerm ?? null),
    [orders, debtAmount, paymentTerm],
  );

  const counts = useMemo(() => {
    if (!settlements) return null;
    let overdue = 0;
    let due = 0;
    let overdueAmount = 0;
    for (const settlement of settlements.values()) {
      if (settlement.kind === "overdue") {
        overdue += 1;
        overdueAmount += settlement.missingAmount;
      }
      if (settlement.kind === "partial") {
        overdue += 1;
        overdueAmount += settlement.missingAmount;
      }
      if (settlement.kind === "due") due += 1;
    }
    return { overdue, due, overdueAmount };
  }, [settlements]);

  return (
    <div className="bankfin-ledger-grid">
      <section className="bankfin-ledger is-orders" aria-label="Pedidos do cliente">
        <div className="bankfin-ledger-head">
          <h4>Pedidos</h4>
          <div className="bankfin-ledger-total">
            <strong>{formatCurrency(ordersTotal)}</strong>
            <span>
              {formatNumber(orders.length)} de {formatNumber(totalOrders)}
            </span>
          </div>
        </div>
        {counts && (counts.overdue > 0 || counts.due > 0) ? (
          <div className="bankfin-ledger-flags">
            {counts.overdue > 0 ? (
              <span className="bankfin-status-cell overdue">
                {formatNumber(counts.overdue)} vencidos · {formatCurrency(counts.overdueAmount)}
              </span>
            ) : null}
            {counts.due > 0 ? (
              <span className="bankfin-status-cell due">{formatNumber(counts.due)} a vencer</span>
            ) : null}
          </div>
        ) : null}
        <div className="bankfin-ledger-scroll">
          <CustomerCreditOrdersTable orders={orders} settlements={settlements} />
        </div>
      </section>

      <section className="bankfin-ledger is-payments" aria-label="Pagamentos do cliente">
        <div className="bankfin-ledger-head">
          <h4>Pagamentos</h4>
          <div className="bankfin-ledger-total">
            <strong>{formatCurrency(paymentsTotal)}</strong>
            <span>
              {formatNumber(payments.length)} de {formatNumber(totalPayments)}
            </span>
          </div>
        </div>
        <div className="bankfin-ledger-scroll">
          <CustomerCreditPaymentsTable payments={payments} />
        </div>
      </section>
    </div>
  );
}

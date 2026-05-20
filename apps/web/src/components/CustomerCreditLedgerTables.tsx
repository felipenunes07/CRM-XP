import type { CustomerCreditOrderEntry, CustomerCreditPaymentEntry } from "@olist-crm/shared";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";

export function paymentTypeLabel(value: string) {
  if (value === "TRF") return "TRF";
  if (value === "DINHEIRO") return "Dinheiro";
  if (value === "TROCAS") return "Trocas";
  if (value === "CANCEL") return "Cancel.";
  if (value === "CUPOM SITE") return "Cupom";
  if (value === "LOGO") return "Logo";
  return value || "-";
}

export function CustomerCreditOrdersTable({ orders }: { orders: CustomerCreditOrderEntry[] }) {
  if (!orders.length) {
    return <div className="customer-credit-ledger-empty">Nenhum pedido detalhado nesse snapshot.</div>;
  }

  return (
    <div className="customer-credit-ledger-table-shell">
      <table className="customer-credit-ledger-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Pedido</th>
            <th>Valor</th>
            <th>Und.</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{formatDate(order.orderDate)}</td>
              <td>
                <strong>{order.orderNumber || "-"}</strong>
                {order.seller ? <span>{order.seller}</span> : null}
              </td>
              <td>{formatCurrency(order.totalAmount)}</td>
              <td>{formatNumber(order.units)}</td>
              <td>{order.status || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerCreditPaymentsTable({ payments }: { payments: CustomerCreditPaymentEntry[] }) {
  if (!payments.length) {
    return <div className="customer-credit-ledger-empty">Nenhum pagamento detalhado nesse snapshot.</div>;
  }

  return (
    <div className="customer-credit-ledger-table-shell">
      <table className="customer-credit-ledger-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Pagamento</th>
            <th>Valor</th>
            <th>Tipo</th>
            <th>Obs.</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{formatDate(payment.paymentDate)}</td>
              <td>
                <strong>{payment.paymentNumber || "-"}</strong>
              </td>
              <td>{formatCurrency(payment.amount)}</td>
              <td>{paymentTypeLabel(payment.paymentType)}</td>
              <td>{payment.observation || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerCreditLedgerSections({
  orders,
  payments,
}: {
  orders: CustomerCreditOrderEntry[];
  payments: CustomerCreditPaymentEntry[];
}) {
  const ordersTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="customer-credit-ledger-grid">
      <section className="customer-credit-ledger-section">
        <div className="customer-credit-ledger-header">
          <div>
            <span className="label-block-title">Pedidos</span>
            <small>
              {formatNumber(orders.length)} pedidos | {formatCurrency(ordersTotal)}
            </small>
          </div>
        </div>
        <CustomerCreditOrdersTable orders={orders} />
      </section>

      <section className="customer-credit-ledger-section">
        <div className="customer-credit-ledger-header">
          <div>
            <span className="label-block-title">Pagamentos</span>
            <small>
              {formatNumber(payments.length)} pagamentos | {formatCurrency(paymentsTotal)}
            </small>
          </div>
        </div>
        <CustomerCreditPaymentsTable payments={payments} />
      </section>
    </div>
  );
}

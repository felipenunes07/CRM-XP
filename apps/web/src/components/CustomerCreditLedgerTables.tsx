import type { CustomerCreditOrderEntry, CustomerCreditPaymentEntry } from "@olist-crm/shared";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
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

export function CustomerCreditOrdersTable({ orders }: { orders: CustomerCreditOrderEntry[] }) {
  if (!orders.length) {
    return <div className="bankfin-ledger-empty">Nenhum pedido detalhado nesse snapshot.</div>;
  }

  return (
    <table className="bankfin-ledger-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Pedido</th>
          <th className="is-right">Valor</th>
          <th className="is-right">Und.</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td className="is-date">{formatDate(order.orderDate)}</td>
            <td className="is-doc">
              <strong>{order.orderNumber || "-"}</strong>
              {order.seller ? <span>{order.seller}</span> : null}
            </td>
            <td className="is-right is-money">{formatCurrency(order.totalAmount)}</td>
            <td className="is-right">{formatNumber(order.units)}</td>
            <td>{order.status ? <span className="bankfin-tag">{order.status}</span> : "—"}</td>
          </tr>
        ))}
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
          <th>Pagamento</th>
          <th className="is-right">Valor</th>
          <th>Tipo</th>
          <th>Obs.</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((payment) => (
          <tr key={payment.id}>
            <td className="is-date">{formatDate(payment.paymentDate)}</td>
            <td className="is-doc">
              <strong>{payment.paymentNumber || "-"}</strong>
            </td>
            <td className="is-right is-money in">{formatCurrency(payment.amount)}</td>
            <td>
              <span className="bankfin-tag">{paymentTypeLabel(payment.paymentType)}</span>
            </td>
            <td className="is-note" title={payment.observation || undefined}>
              {payment.observation || "—"}
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
}: {
  orders: CustomerCreditOrderEntry[];
  payments: CustomerCreditPaymentEntry[];
  totalOrders?: number;
  totalPayments?: number;
}) {
  const ordersTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="bankfin-ledger-grid">
      <section className="bankfin-ledger" aria-label="Pedidos do cliente">
        <div className="bankfin-ledger-head">
          <h4>
            <ArrowUpRight size={17} />
            Pedidos
          </h4>
          <div className="bankfin-ledger-total">
            <strong>{formatCurrency(ordersTotal)}</strong>
            <span>
              {formatNumber(orders.length)} de {formatNumber(totalOrders)}
            </span>
          </div>
        </div>
        <div className="bankfin-ledger-scroll">
          <CustomerCreditOrdersTable orders={orders} />
        </div>
      </section>

      <section className="bankfin-ledger" aria-label="Pagamentos do cliente">
        <div className="bankfin-ledger-head">
          <h4>
            <ArrowDownLeft size={17} />
            Pagamentos
          </h4>
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

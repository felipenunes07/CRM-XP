import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
export function paymentTypeLabel(value) {
    if (value === "TRF")
        return "TRF";
    if (value === "DINHEIRO")
        return "Dinheiro";
    if (value === "TROCAS")
        return "Trocas";
    if (value === "CANCEL")
        return "Cancel.";
    if (value === "CUPOM SITE")
        return "Cupom";
    if (value === "LOGO")
        return "Logo";
    return value || "-";
}
export function CustomerCreditOrdersTable({ orders }) {
    if (!orders.length) {
        return _jsx("div", { className: "customer-credit-ledger-empty", children: "Nenhum pedido detalhado nesse snapshot." });
    }
    return (_jsx("div", { className: "customer-credit-ledger-table-shell", children: _jsxs("table", { className: "customer-credit-ledger-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Pedido" }), _jsx("th", { children: "Valor" }), _jsx("th", { children: "Und." }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: orders.map((order) => (_jsxs("tr", { children: [_jsx("td", { children: formatDate(order.orderDate) }), _jsxs("td", { children: [_jsx("strong", { children: order.orderNumber || "-" }), order.seller ? _jsx("span", { children: order.seller }) : null] }), _jsx("td", { children: formatCurrency(order.totalAmount) }), _jsx("td", { children: formatNumber(order.units) }), _jsx("td", { children: order.status || "-" })] }, order.id))) })] }) }));
}
export function CustomerCreditPaymentsTable({ payments }) {
    if (!payments.length) {
        return _jsx("div", { className: "customer-credit-ledger-empty", children: "Nenhum pagamento detalhado nesse snapshot." });
    }
    return (_jsx("div", { className: "customer-credit-ledger-table-shell", children: _jsxs("table", { className: "customer-credit-ledger-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Data" }), _jsx("th", { children: "Pagamento" }), _jsx("th", { children: "Valor" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Obs." })] }) }), _jsx("tbody", { children: payments.map((payment) => (_jsxs("tr", { children: [_jsx("td", { children: formatDate(payment.paymentDate) }), _jsx("td", { children: _jsx("strong", { children: payment.paymentNumber || "-" }) }), _jsx("td", { children: formatCurrency(payment.amount) }), _jsx("td", { children: paymentTypeLabel(payment.paymentType) }), _jsx("td", { children: payment.observation || "-" })] }, payment.id))) })] }) }));
}
export function CustomerCreditLedgerSections({ orders, payments, }) {
    const ordersTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const paymentsTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    return (_jsxs("div", { className: "customer-credit-ledger-grid", children: [_jsxs("section", { className: "customer-credit-ledger-section", children: [_jsx("div", { className: "customer-credit-ledger-header", children: _jsxs("div", { children: [_jsx("span", { className: "label-block-title", children: "Pedidos" }), _jsxs("small", { children: [formatNumber(orders.length), " pedidos | ", formatCurrency(ordersTotal)] })] }) }), _jsx(CustomerCreditOrdersTable, { orders: orders })] }), _jsxs("section", { className: "customer-credit-ledger-section", children: [_jsx("div", { className: "customer-credit-ledger-header", children: _jsxs("div", { children: [_jsx("span", { className: "label-block-title", children: "Pagamentos" }), _jsxs("small", { children: [formatNumber(payments.length), " pagamentos | ", formatCurrency(paymentsTotal)] })] }) }), _jsx(CustomerCreditPaymentsTable, { payments: payments })] })] }));
}

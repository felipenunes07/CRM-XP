import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";
export function CustomerDocInsightsTable({ ranking }) {
    if (!ranking.length) {
        return (_jsx("div", { className: "panel table-panel empty-panel", children: _jsx("div", { className: "empty-state", children: "Ainda nao encontramos compras de DOC para montar o ranking." }) }));
    }
    return (_jsx("div", { className: "panel table-panel", children: _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table customer-doc-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Pecas DOC" }), _jsx("th", { children: "Pedidos DOC" }), _jsx("th", { children: "Faturamento DOC" }), _jsx("th", { children: "Ultima compra DOC" })] }) }), _jsx("tbody", { children: ranking.map((customer) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs(Link, { className: "table-link", to: `/clientes/${customer.id}`, children: [_jsx("strong", { children: customer.displayName }), _jsx("span", { children: customer.customerCode })] }) }), _jsx("td", { children: _jsx("span", { className: `status-badge status-${customer.status.toLowerCase()}`, children: statusLabel(customer.status) }) }), _jsx("td", { children: formatNumber(customer.docQuantity) }), _jsx("td", { children: formatNumber(customer.docOrderCount) }), _jsx("td", { children: formatCurrency(customer.docRevenue) }), _jsx("td", { children: formatDate(customer.lastDocPurchaseAt) })] }, customer.id))) })] }) }) }));
}

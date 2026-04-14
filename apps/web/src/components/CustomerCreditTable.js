import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, formatDaysSince } from "../lib/format";
import { customerCreditHeadlineClassName, customerCreditHeadlineLabel, customerCreditPrimaryLabel, customerCreditRiskClassName, customerCreditRiskLabel, customerCreditVisibleFlags, } from "../lib/customerCredit";
export function CustomerCreditTable({ rows, emptyMessage, linkedOnly = true, }) {
    if (!rows.length) {
        return (_jsx("div", { className: "panel table-panel empty-panel", children: _jsx("div", { className: "empty-state", children: emptyMessage }) }));
    }
    return (_jsx("div", { className: "panel table-panel", children: _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table customer-credit-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Leitura" }), _jsx("th", { children: "Em aberto / saldo" }), _jsx("th", { children: "Limite" }), _jsx("th", { children: "Disponivel" }), _jsx("th", { children: "Ult. pagamento" }), _jsx("th", { children: "Alertas" }), linkedOnly ? _jsx("th", {}) : null] }) }), _jsx("tbody", { children: rows.map((row) => {
                            const visibleFlags = customerCreditVisibleFlags(row);
                            return (_jsxs("tr", { children: [_jsx("td", { children: row.customerId ? (_jsxs(Link, { className: "table-link", to: `/clientes/${row.customerId}`, children: [_jsx("strong", { children: row.customerDisplayName }), _jsx("span", { children: row.customerCode }), _jsx("small", { children: row.observation || "Sem observacao relevante." })] })) : (_jsxs("div", { className: "table-link", children: [_jsx("strong", { children: row.sourceDisplayName ?? row.customerDisplayName }), _jsx("span", { children: row.customerCode }), _jsx("small", { children: row.observation || "Sem observacao relevante." })] })) }), _jsx("td", { children: _jsxs("div", { className: "customer-credit-table-status", children: [_jsx("span", { className: `tag credit-badge ${customerCreditHeadlineClassName(row)}`, children: customerCreditHeadlineLabel(row) }), _jsx("span", { className: `tag credit-badge ${customerCreditRiskClassName(row.riskLevel)}`, children: customerCreditRiskLabel(row.riskLevel) })] }) }), _jsxs("td", { children: [_jsx("strong", { className: row.debtAmount > 0
                                                    ? "credit-amount-danger"
                                                    : row.creditBalanceAmount > 0
                                                        ? "credit-amount-success"
                                                        : "", children: formatCurrency(row.debtAmount > 0 ? row.debtAmount : row.creditBalanceAmount) }), _jsx("span", { className: "table-inline-muted", children: customerCreditPrimaryLabel(row) })] }), _jsx("td", { children: _jsx("strong", { children: formatCurrency(row.creditLimit) }) }), _jsxs("td", { children: [_jsx("strong", { children: formatCurrency(row.availableCreditAmount) }), _jsx("span", { className: "table-inline-muted", children: row.hasOverCredit
                                                    ? "Acima do limite"
                                                    : row.withinCreditLimit
                                                        ? "Dentro do limite"
                                                        : row.creditLimit > 0
                                                            ? "Livre"
                                                            : "Sem limite" })] }), _jsxs("td", { children: [_jsx("strong", { children: formatDate(row.lastPaymentDate) }), _jsx("span", { className: "table-inline-muted", children: formatDaysSince(row.daysSinceLastPayment) })] }), _jsx("td", { className: "customer-credit-alert-cell", children: _jsx("div", { className: "tag-row compact", children: visibleFlags.length ? (visibleFlags.map((flag) => (_jsx("span", { className: "tag customer-credit-flag", children: flag }, `${row.id}-${flag}`)))) : (_jsx("span", { className: "muted-copy", children: "Sem flags" })) }) }), linkedOnly ? (_jsx("td", { className: "customer-credit-open-cell", children: row.customerId ? (_jsx(Link, { className: "ghost-button small", to: `/clientes/${row.customerId}`, children: "Abrir" })) : null })) : null] }, row.id));
                        }) })] }) }) }));
}

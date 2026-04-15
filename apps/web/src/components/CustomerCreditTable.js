import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, calculateDaysSince } from "../lib/format";
import { customerCreditRiskClassName, customerCreditRiskLabel, customerCreditVisibleFlags, } from "../lib/customerCredit";
function creditUsagePercent(row) {
    if (row.creditLimit <= 0) {
        return row.debtAmount > 0 ? 100 : 0;
    }
    return Math.min((row.debtAmount / row.creditLimit) * 100, 120);
}
function usageBarColor(row) {
    if (row.hasOverCredit)
        return "danger";
    if (row.creditLimit <= 0 && row.debtAmount > 0)
        return "danger";
    const pct = creditUsagePercent(row);
    if (pct > 80)
        return "warning";
    if (pct > 0)
        return "info";
    return "success";
}
function prazoLabel(days, term) {
    if (days === null || days === undefined)
        return "—";
    const daysStr = days === 0 ? "Hoje" : `${days}d`;
    if (term)
        return `${daysStr} / ${term}d`;
    return daysStr;
}
function prazoTone(days, term) {
    if (days === null || days === undefined)
        return "";
    if (term && days > term)
        return "credit-prazo-danger";
    if (days > 90)
        return "credit-prazo-danger";
    if (days > 30)
        return "credit-prazo-warning";
    return "";
}
function suggestAction(row) {
    if (row.hasOverCredit) {
        return { label: "Cobrar", tone: "danger", hint: "Ultrapassou o limite — prioridade de cobranca" };
    }
    if (row.debtAmount > 0 && (row.hasOverduePayment || row.hasSeverelyOverduePayment)) {
        return { label: "Cobrar", tone: "danger", hint: "Pagamento vencido — acionar cobranca" };
    }
    if (row.debtAmount > 0 && row.hasNoPayment) {
        return { label: "Cobrar", tone: "danger", hint: "Nunca pagou — verificar situacao" };
    }
    if (row.operationalState === "UNUSED_CREDIT") {
        return { label: "Vender", tone: "success", hint: "Credito disponivel — oportunidade de venda" };
    }
    if (row.debtAmount > 0 && row.withinCreditLimit) {
        return { label: "Acompanhar", tone: "info", hint: "Dentro do limite — monitorar prazo" };
    }
    if (row.debtAmount > 0 && row.creditLimit <= 0) {
        return { label: "Verificar", tone: "warning", hint: "Devendo sem limite — avaliar credito" };
    }
    if (row.creditBalanceAmount > 0) {
        return { label: "Vender", tone: "success", hint: "Saldo a favor — oportunidade de recompra" };
    }
    return { label: "—", tone: "muted", hint: "Sem acao necessaria" };
}
function rowClassName(row) {
    if (row.hasOverCredit)
        return "credit-row-danger";
    if (row.debtAmount > 0 && (row.hasOverduePayment || row.hasSeverelyOverduePayment))
        return "credit-row-warn";
    if (row.operationalState === "UNUSED_CREDIT")
        return "credit-row-opportunity";
    return "";
}
export function CustomerCreditTable({ rows, emptyMessage, linkedOnly = true, }) {
    if (!rows.length) {
        return (_jsx("div", { className: "panel table-panel empty-panel", children: _jsx("div", { className: "empty-state", children: emptyMessage }) }));
    }
    return (_jsx("div", { className: "panel table-panel", children: _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table credit-table-v2", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Divida / Saldo" }), _jsx("th", { children: "Cr\u00E9dito" }), _jsx("th", { children: "Disponivel" }), _jsx("th", { children: "Prazo" }), _jsx("th", { children: "Risco" }), _jsx("th", { children: "Uso do credito" }), _jsx("th", { children: "Acao sugerida" }), linkedOnly ? _jsx("th", {}) : null] }) }), _jsx("tbody", { children: rows.map((row) => {
                            const flags = customerCreditVisibleFlags(row);
                            const pct = creditUsagePercent(row);
                            const barColor = usageBarColor(row);
                            const hasBalance = row.creditBalanceAmount > 0;
                            const action = suggestAction(row);
                            const actualDays = calculateDaysSince(row.lastPaymentDate);
                            return (_jsxs("tr", { className: rowClassName(row), children: [_jsx("td", { children: _jsxs("div", { className: "credit-cell-client", children: [row.customerId ? (_jsxs(Link, { className: "credit-cell-client-link", to: `/clientes/${row.customerId}`, children: [_jsx("strong", { children: row.customerDisplayName }), _jsx("span", { children: row.customerCode })] })) : (_jsxs("div", { className: "credit-cell-client-link", children: [_jsx("strong", { children: row.sourceDisplayName ?? row.customerDisplayName }), _jsx("span", { children: row.customerCode })] })), flags.length > 0 ? (_jsxs("div", { className: "credit-cell-flags", children: [flags.slice(0, 2).map((flag) => (_jsx("span", { className: "credit-flag-dot", title: flag, children: flag }, `${row.id}-${flag}`))), flags.length > 2 ? (_jsxs("span", { className: "credit-flag-more", title: flags.slice(2).join(", "), children: ["+", flags.length - 2] })) : null] })) : null] }) }), _jsx("td", { children: _jsx("div", { className: "credit-cell-amount", children: row.debtAmount > 0 ? (_jsxs(_Fragment, { children: [_jsx("strong", { className: "credit-amount-debt", children: formatCurrency(row.debtAmount) }), _jsx("span", { children: "Em aberto" })] })) : hasBalance ? (_jsxs(_Fragment, { children: [_jsx("strong", { className: "credit-amount-positive", children: formatCurrency(row.creditBalanceAmount) }), _jsx("span", { children: "Saldo a favor" })] })) : (_jsxs(_Fragment, { children: [_jsx("strong", { children: "R$ 0,00" }), _jsx("span", { children: "Sem saldo" })] })) }) }), _jsx("td", { children: _jsx("strong", { children: row.creditLimit > 0 ? formatCurrency(row.creditLimit) : "—" }) }), _jsx("td", { children: _jsx("strong", { className: row.availableCreditAmount > 0 ? "credit-amount-positive" : "", children: row.creditLimit > 0 ? formatCurrency(row.availableCreditAmount) : "—" }) }), _jsx("td", { children: _jsxs("div", { className: "credit-cell-prazo", children: [_jsx("strong", { className: prazoTone(actualDays, row.paymentTerm), children: prazoLabel(actualDays, row.paymentTerm) }), row.paymentTerm && actualDays !== null && (_jsx("div", { className: "credit-usage-track", style: { height: "4px", margin: "4px 0" }, children: _jsx("div", { className: `credit-usage-fill ${actualDays > row.paymentTerm
                                                            ? "danger"
                                                            : actualDays > row.paymentTerm * 0.8
                                                                ? "warning"
                                                                : "success"}`, style: { width: `${Math.min((actualDays / row.paymentTerm) * 100, 100)}%` } }) })), row.lastPaymentDate ? (_jsx("span", { children: formatDate(row.lastPaymentDate) })) : (_jsx("span", { children: "Sem pagamento" }))] }) }), _jsx("td", { children: _jsx("span", { className: `credit-risk-pill ${customerCreditRiskClassName(row.riskLevel)}`, children: customerCreditRiskLabel(row.riskLevel) }) }), _jsx("td", { children: row.creditLimit > 0 ? (_jsxs("div", { className: "credit-usage-cell", children: [_jsx("div", { className: "credit-usage-track", children: _jsx("div", { className: `credit-usage-fill ${barColor}`, style: { width: `${Math.min(pct, 100)}%` } }) }), _jsxs("span", { className: "credit-usage-label", children: [Math.round(pct), "%"] })] })) : (_jsx("span", { className: "credit-usage-nolimit", children: row.debtAmount > 0 ? "Sem limite" : "—" })) }), _jsx("td", { children: _jsx("span", { className: `credit-action-pill tone-${action.tone}`, title: action.hint, children: action.label }) }), linkedOnly ? (_jsx("td", { className: "credit-cell-action", children: row.customerId ? (_jsx(Link, { className: "ghost-button small", to: `/clientes/${row.customerId}`, children: "Abrir" })) : null })) : null] }, row.id));
                        }) })] }) }) }));
}

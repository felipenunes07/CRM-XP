import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerCreditLedgerSections } from "../components/CustomerCreditLedgerTables";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDateTime, formatDaysSince, formatNumber, } from "../lib/format";
import { customerCreditHeadlineClassName, customerCreditHeadlineLabel, customerCreditPrimaryLabel, customerCreditRiskClassName, customerCreditRiskLabel, customerCreditVisibleFlags, } from "../lib/customerCredit";
function filterCreditRows(rows, search) {
    const needle = search.trim().toLowerCase();
    if (!needle)
        return rows;
    return rows.filter((row) => {
        const haystack = [
            row.customerDisplayName,
            row.sourceDisplayName,
            row.customerCode,
            row.observation,
            row.flags.join(" "),
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return haystack.includes(needle);
    });
}
function usagePercent(row) {
    if (row.creditLimit <= 0)
        return null;
    return Math.min((row.debtAmount / row.creditLimit) * 100, 100);
}
function customerAmountLabel(row) {
    if (row.debtAmount > 0)
        return `Devendo ${formatCurrency(row.debtAmount)}`;
    if (row.creditBalanceAmount > 0)
        return `Saldo ${formatCurrency(row.creditBalanceAmount)}`;
    if (row.availableCreditAmount > 0)
        return `Livre ${formatCurrency(row.availableCreditAmount)}`;
    return "Sem saldo aberto";
}
function customerFinancialPrimaryLabel(row) {
    if (row.debtAmount > 0)
        return "Saldo devedor";
    if (row.creditBalanceAmount > 0)
        return "Saldo a favor";
    return customerCreditPrimaryLabel(row);
}
function CustomerSelector({ rows, selectedCustomerId, onSelectCustomer, }) {
    if (!rows.length) {
        return _jsx("div", { className: "customer-financial-empty", children: "Nenhum cliente encontrado nesse filtro." });
    }
    return (_jsx("div", { className: "customer-financial-list", children: rows.map((row) => {
            const isSelected = Boolean(row.customerId && row.customerId === selectedCustomerId);
            return (_jsxs("button", { type: "button", className: `customer-financial-list-item ${isSelected ? "active" : ""}`, onClick: () => {
                    if (row.customerId) {
                        onSelectCustomer(row.customerId);
                    }
                }, disabled: !row.customerId, children: [_jsxs("span", { children: [_jsx("strong", { children: row.customerDisplayName }), _jsx("small", { children: row.customerCode || "Sem codigo" })] }), _jsx("span", { className: row.debtAmount > 0 ? "amount-danger" : "amount-neutral", children: customerAmountLabel(row) })] }, row.id));
        }) }));
}
function FinancialMetric({ label, value, helper, tone = "neutral", }) {
    return (_jsxs("div", { className: `customer-financial-metric tone-${tone}`, children: [_jsx("span", { children: label }), _jsx("strong", { children: value }), helper ? _jsx("small", { children: helper }) : null] }));
}
export function CustomerFinancialPageView({ overview, detail, selectedCustomerId, search, isOverviewLoading, isOverviewError, isDetailLoading, isDetailError, canRefreshCredit, isRefreshing, refreshError, onSearchChange, onSelectCustomer, onRefresh, }) {
    const linkedRows = overview?.linkedRows ?? [];
    const filteredRows = useMemo(() => filterCreditRows(linkedRows, search), [linkedRows, search]);
    const selectedRow = linkedRows.find((row) => row.customerId === selectedCustomerId) ?? null;
    const creditRow = detail?.row ?? selectedRow;
    const orders = detail?.orders ?? [];
    const payments = detail?.payments ?? [];
    const snapshot = detail?.snapshot ?? overview?.snapshot ?? null;
    const orderTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const usage = creditRow ? usagePercent(creditRow) : null;
    return (_jsxs("div", { className: "page-stack customer-financial-page", children: [_jsxs("section", { className: "panel customer-financial-command-panel", children: [_jsxs("div", { className: "panel-header customer-financial-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Clientes / Financeiro" }), _jsx("h2", { className: "premium-header-title", children: "Financeiro por cliente" }), _jsx("p", { className: "panel-subcopy", children: "Selecione um cliente vinculado ao saldo diario para ver resumo, pedidos e pagamentos do snapshot." })] }), _jsxs("div", { className: "customer-financial-snapshot", children: [_jsx("strong", { children: snapshot?.sourceFileName ?? "Sem snapshot financeiro" }), _jsx("span", { children: snapshot
                                            ? `Arquivo ${formatDateTime(snapshot.sourceFileUpdatedAt)} | Importado ${formatDateTime(snapshot.importedAt)}`
                                            : "Atualize o financeiro para carregar os saldos." }), canRefreshCredit ? (_jsxs("button", { type: "button", className: "ghost-button small", onClick: onRefresh, disabled: isRefreshing, children: [_jsx(RefreshCw, { size: 14 }), isRefreshing ? "Atualizando..." : "Atualizar agora"] })) : null] })] }), refreshError ? _jsx("div", { className: "inline-error", children: "Nao foi possivel atualizar o arquivo agora." }) : null] }), _jsxs("div", { className: "customer-financial-workspace", children: [_jsxs("aside", { className: "panel customer-financial-selector-panel", children: [_jsx("div", { className: "panel-header compact", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Selecao" }), _jsx("h3", { children: "Clientes com financeiro" })] }) }), _jsxs("label", { className: "customer-financial-search", children: [_jsx("span", { children: "Buscar cliente" }), _jsxs("div", { className: "search-input-wrapper", children: [_jsx(Search, { size: 17 }), _jsx("input", { value: search, onChange: (event) => onSearchChange(event.target.value), placeholder: "Nome, codigo ou observacao" })] })] }), isOverviewLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes..." }) : null, isOverviewError ? _jsx("div", { className: "page-error", children: "Falha ao carregar o snapshot financeiro." }) : null, !isOverviewLoading && !isOverviewError ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "customer-financial-list-meta", children: [formatNumber(filteredRows.length), " de ", formatNumber(linkedRows.length), " clientes"] }), _jsx(CustomerSelector, { rows: filteredRows, selectedCustomerId: selectedCustomerId, onSelectCustomer: onSelectCustomer })] })) : null] }), _jsx("section", { className: "customer-financial-detail-stack", children: !selectedCustomerId || !creditRow ? (_jsxs("div", { className: "panel customer-financial-empty-detail", children: [_jsx("h3", { children: "Selecione um cliente" }), _jsx("p", { className: "panel-subcopy", children: "O resumo financeiro aparece aqui com saldo, limite, pedidos e pagamentos." })] })) : (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel customer-financial-summary-panel", children: [_jsxs("div", { className: "panel-header customer-financial-selected-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: creditRow.customerCode }), _jsx("h3", { children: creditRow.customerDisplayName }), _jsx("p", { className: "panel-subcopy", children: creditRow.observation || "Sem observacao relevante nesse snapshot." })] }), _jsxs("div", { className: "customer-financial-selected-actions", children: [_jsx("span", { className: `tag credit-badge ${customerCreditHeadlineClassName(creditRow)}`, children: customerCreditHeadlineLabel(creditRow) }), _jsx("span", { className: `tag credit-badge ${customerCreditRiskClassName(creditRow.riskLevel)}`, children: customerCreditRiskLabel(creditRow.riskLevel) }), _jsxs(Link, { className: "ghost-button small", to: `/clientes/${creditRow.customerId}`, children: [_jsx(ExternalLink, { size: 14 }), "Abrir ficha"] })] })] }), _jsxs("div", { className: "customer-financial-metric-grid", children: [_jsx(FinancialMetric, { label: customerFinancialPrimaryLabel(creditRow), value: formatCurrency(creditRow.debtAmount > 0 ? creditRow.debtAmount : creditRow.creditBalanceAmount), tone: creditRow.debtAmount > 0 ? "danger" : creditRow.creditBalanceAmount > 0 ? "success" : "neutral" }), _jsx(FinancialMetric, { label: "Credito liberado", value: formatCurrency(creditRow.creditLimit) }), _jsx(FinancialMetric, { label: "Disponivel", value: formatCurrency(creditRow.availableCreditAmount), tone: creditRow.availableCreditAmount < 0 ? "danger" : "success" }), _jsx(FinancialMetric, { label: "Uso do limite", value: usage === null ? "Sem limite" : `${usage.toFixed(0)}%`, helper: creditRow.paymentTerm ? `Prazo ${creditRow.paymentTerm} dias` : undefined }), _jsx(FinancialMetric, { label: "Ultimo pedido", value: formatDate(creditRow.lastOrderDate), helper: formatDaysSince(creditRow.daysSinceLastOrder) }), _jsx(FinancialMetric, { label: "Ultimo pagamento", value: formatDate(creditRow.lastPaymentDate), helper: formatDaysSince(creditRow.daysSinceLastPayment) }), _jsx(FinancialMetric, { label: "Pedidos no snapshot", value: formatNumber(orders.length), helper: formatCurrency(orderTotal) }), _jsx(FinancialMetric, { label: "Pagamentos no snapshot", value: formatNumber(payments.length), helper: formatCurrency(paymentTotal) })] }), _jsxs("div", { className: "customer-financial-flags", children: [_jsx("span", { className: "label-block-title", children: "Flags de atencao" }), _jsx("div", { className: "tag-row", children: customerCreditVisibleFlags(creditRow).length ? (customerCreditVisibleFlags(creditRow).map((flag) => (_jsx("span", { className: "tag customer-credit-flag", children: flag }, flag)))) : (_jsx("span", { className: "muted-copy", children: "Sem flags adicionais." })) })] })] }), isDetailLoading ? _jsx("div", { className: "page-loading", children: "Carregando historico financeiro..." }) : null, isDetailError ? _jsx("div", { className: "page-error", children: "Falha ao carregar o historico desse cliente." }) : null, !isDetailLoading && !isDetailError ? (_jsx(CustomerCreditLedgerSections, { orders: orders, payments: payments })) : null] })) })] })] }));
}
export function CustomerFinancialPage() {
    const { token, user } = useAuth();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const canRefreshCredit = user?.role === "ADMIN" || user?.role === "MANAGER";
    const overviewQuery = useQuery({
        queryKey: ["customer-credit-overview"],
        queryFn: () => api.customerCreditOverview(token),
        enabled: Boolean(token),
    });
    const linkedRows = overviewQuery.data?.linkedRows ?? [];
    useEffect(() => {
        if (!linkedRows.length) {
            setSelectedCustomerId(null);
            return;
        }
        if (!selectedCustomerId || !linkedRows.some((row) => row.customerId === selectedCustomerId)) {
            setSelectedCustomerId(linkedRows.find((row) => row.customerId)?.customerId ?? null);
        }
    }, [linkedRows, selectedCustomerId]);
    const detailQuery = useQuery({
        queryKey: ["customer-credit-detail", selectedCustomerId],
        queryFn: () => api.customerCreditDetail(token, selectedCustomerId),
        enabled: Boolean(token && selectedCustomerId),
    });
    const refreshCreditMutation = useMutation({
        mutationFn: () => api.refreshCustomerCreditOverview(token),
        onSuccess: (payload) => {
            queryClient.setQueryData(["customer-credit-overview"], payload);
            void queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
        },
    });
    return (_jsx(CustomerFinancialPageView, { overview: overviewQuery.data ?? null, detail: detailQuery.data ?? null, selectedCustomerId: selectedCustomerId, search: search, isOverviewLoading: overviewQuery.isLoading, isOverviewError: overviewQuery.isError, isDetailLoading: detailQuery.isLoading, isDetailError: detailQuery.isError, canRefreshCredit: canRefreshCredit, isRefreshing: refreshCreditMutation.isPending, refreshError: refreshCreditMutation.isError, onSearchChange: setSearch, onSelectCustomer: setSelectedCustomerId, onRefresh: () => refreshCreditMutation.mutate() }));
}

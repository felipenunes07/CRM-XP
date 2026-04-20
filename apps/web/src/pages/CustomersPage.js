import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeDollarSign, ShieldAlert, TrendingUp } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "../lib/format";
import { isOverdueCreditRow } from "../lib/customerCredit";
import { CustomerDocInsightsTable } from "../components/CustomerDocInsightsTable";
import { CustomerCreditTable } from "../components/CustomerCreditTable";
import { CustomerTable } from "../components/CustomerTable";
import { StatCard } from "../components/StatCard";
import { buildCustomersQueryParams, createInitialCustomersPageState, customersPageReducer, } from "./customersPage.helpers";
const viewTabs = [
    {
        value: "portfolio",
        label: "Carteira",
        helper: "Busca, filtros e priorizacao da carteira comercial.",
        title: "Procure, filtre e priorize sua carteira",
    },
    {
        value: "docInsights",
        label: "Insights DOC",
        helper: "Ranking global de quem mais compra DOC de Carga.",
        title: "Insights de compra de DOC de Carga",
    },
    {
        value: "creditPayment",
        label: "Credito & Pagamento",
        helper: "Leitura diaria de saldo, credito liberado e risco financeiro da carteira.",
        title: "Credito e pagamento da carteira",
    },
];
function applyCreditFilters(rows, filters) {
    const search = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
        if (search) {
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
            if (!haystack.includes(search)) {
                return false;
            }
        }
        if (filters.riskLevel && row.riskLevel !== filters.riskLevel) {
            return false;
        }
        if (filters.operationalState && row.operationalState !== filters.operationalState) {
            return false;
        }
        if (filters.onlyWithCredit === "true" && row.creditLimit <= 0) {
            return false;
        }
        if (filters.onlyUnusedCredit === "true" && row.operationalState !== "UNUSED_CREDIT") {
            return false;
        }
        if (filters.onlyOverdue === "true" && !isOverdueCreditRow(row)) {
            return false;
        }
        return true;
    });
}
function applyCreditKpiFilter(rows, kpiFilter) {
    if (!kpiFilter)
        return rows;
    return rows.filter((row) => {
        switch (kpiFilter) {
            case "owing":
                return row.debtAmount > 0;
            case "credit_balance":
                return row.creditBalanceAmount > 0;
            case "unused_credit":
                return row.operationalState === "UNUSED_CREDIT";
            case "over_credit":
                return row.hasOverCredit;
            default:
                return true;
        }
    });
}
export function CustomersPage() {
    const { token, user } = useAuth();
    const queryClient = useQueryClient();
    const [state, dispatch] = useReducer(customersPageReducer, undefined, createInitialCustomersPageState);
    const customerQueryParams = buildCustomersQueryParams(state.portfolioFilters);
    const activeTab = viewTabs.find((tab) => tab.value === state.activeView) ?? viewTabs[0];
    const canRefreshCredit = user?.role === "ADMIN" || user?.role === "MANAGER";
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const customersQuery = useQuery({
        queryKey: ["customers", customerQueryParams],
        queryFn: () => api.customers(token, customerQueryParams),
        enabled: Boolean(token && state.activeView === "portfolio"),
    });
    const docInsightsQuery = useQuery({
        queryKey: ["customer-doc-insights"],
        queryFn: () => api.customerDocInsights(token),
        enabled: Boolean(token && state.activeView === "docInsights"),
    });
    const creditOverviewQuery = useQuery({
        queryKey: ["customer-credit-overview"],
        queryFn: () => api.customerCreditOverview(token),
        enabled: Boolean(token && state.activeView === "creditPayment"),
    });
    const refreshCreditMutation = useMutation({
        mutationFn: () => api.refreshCustomerCreditOverview(token),
        onSuccess: (payload) => {
            queryClient.setQueryData(["customer-credit-overview"], payload);
            void queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
        },
    });
    const filteredLinkedCreditRows = useMemo(() => applyCreditFilters(creditOverviewQuery.data?.linkedRows ?? [], state.creditFilters), [creditOverviewQuery.data?.linkedRows, state.creditFilters]);
    const filteredUnmatchedCreditRows = useMemo(() => applyCreditFilters(creditOverviewQuery.data?.unmatchedRows ?? [], state.creditFilters), [creditOverviewQuery.data?.unmatchedRows, state.creditFilters]);
    const kpiFilteredRows = useMemo(() => applyCreditKpiFilter(filteredLinkedCreditRows, state.creditKpiFilter), [filteredLinkedCreditRows, state.creditKpiFilter]);
    const filteredDebtAmount = useMemo(() => filteredLinkedCreditRows.reduce((sum, row) => sum + row.debtAmount, 0), [filteredLinkedCreditRows]);
    const filteredDebtCount = useMemo(() => filteredLinkedCreditRows.filter((row) => row.debtAmount > 0).length, [filteredLinkedCreditRows]);
    const filteredCreditBalanceAmount = useMemo(() => filteredLinkedCreditRows.reduce((sum, row) => sum + row.creditBalanceAmount, 0), [filteredLinkedCreditRows]);
    const filteredCreditBalanceCount = useMemo(() => filteredLinkedCreditRows.filter((row) => row.creditBalanceAmount > 0).length, [filteredLinkedCreditRows]);
    const filteredAvailableCreditAmount = useMemo(() => filteredLinkedCreditRows
        .filter((row) => row.operationalState === "UNUSED_CREDIT")
        .reduce((sum, row) => sum + Math.max(0, row.availableCreditAmount ?? 0), 0), [filteredLinkedCreditRows]);
    const filteredUnusedCreditCount = useMemo(() => filteredLinkedCreditRows.filter((row) => row.operationalState === "UNUSED_CREDIT").length, [filteredLinkedCreditRows]);
    const filteredTotalExcessAmount = useMemo(() => filteredLinkedCreditRows.reduce((sum, row) => sum + Math.max(0, -(row.availableCreditAmount ?? 0)), 0), [filteredLinkedCreditRows]);
    const filteredOverCreditCount = useMemo(() => filteredLinkedCreditRows.filter((row) => row.operationalState === "OVER_CREDIT" || row.hasOverCredit).length, [filteredLinkedCreditRows]);
    const filteredOverdueCount = useMemo(() => filteredLinkedCreditRows.filter((row) => isOverdueCreditRow(row)).length, [filteredLinkedCreditRows]);
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Clientes" }), _jsx("h2", { className: "premium-header-title", children: activeTab.title })] }), _jsx("div", { className: "chart-switcher customers-view-switcher", role: "tablist", "aria-label": "Alternar visao da pagina de clientes", children: viewTabs.map((tab) => (_jsx("button", { type: "button", role: "tab", title: tab.helper, "aria-selected": state.activeView === tab.value, "aria-pressed": state.activeView === tab.value, className: `chart-switch-button ${state.activeView === tab.value ? "active" : ""}`, onClick: () => dispatch({ type: "setView", view: tab.value }), children: _jsx("strong", { children: tab.label }) }, tab.value))) })] }), state.activeView === "portfolio" ? (_jsxs("div", { className: "filters-grid filters-grid-six", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: state.portfolioFilters.search, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "search", value: event.target.value }), placeholder: "Nome ou codigo" })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: state.portfolioFilters.status, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "status", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { children: ["Ordenar por", _jsxs("select", { value: state.portfolioFilters.sortBy, onChange: (event) => dispatch({
                                            type: "updatePortfolioFilter",
                                            key: "sortBy",
                                            value: event.target.value,
                                        }), children: [_jsx("option", { value: "priority", children: "Prioridade" }), _jsx("option", { value: "faturamento", children: "Faturamento" }), _jsx("option", { value: "recencia", children: "Recencia" })] })] }), _jsxs("label", { children: ["Com rotulo", _jsxs("select", { value: state.portfolioFilters.label, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "label", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Excluir rotulo", _jsxs("select", { value: state.portfolioFilters.excludeLabel, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "excludeLabel", value: event.target.value }), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Embaixadores", _jsxs("select", { value: state.portfolioFilters.ambassadorOnly, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "ambassadorOnly", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So embaixadores" })] })] })] })) : state.activeView === "docInsights" ? (_jsxs("p", { className: "panel-subcopy customers-doc-subcopy", children: ["Ranking global no historico total da base, considerando como DOC os itens cuja descricao contenha", " ", _jsx("code", { children: "DOC DE CARGA" }), "."] })) : (_jsxs("div", { className: "filters-grid filters-grid-six", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: state.creditFilters.search, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "search", value: event.target.value }), placeholder: "Nome, codigo, observacao ou flag" })] }), _jsxs("label", { children: ["Grau de risco", _jsxs("select", { value: state.creditFilters.riskLevel, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "riskLevel", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "CRITICO", children: "Critico" }), _jsx("option", { value: "ATENCAO", children: "Atencao" }), _jsx("option", { value: "MONITORAR", children: "Monitorar" }), _jsx("option", { value: "OK", children: "OK" })] })] }), _jsxs("label", { children: ["Situacao", _jsxs("select", { value: state.creditFilters.operationalState, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "operationalState", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todas" }), _jsx("option", { value: "OWES", children: "Devendo" }), _jsx("option", { value: "OVER_CREDIT", children: "Ultrapassou credito" }), _jsx("option", { value: "UNUSED_CREDIT", children: "Credito sem uso" }), _jsx("option", { value: "HAS_CREDIT_BALANCE", children: "Saldo a favor" }), _jsx("option", { value: "SETTLED", children: "Quitado" })] })] }), _jsxs("label", { children: ["Com credito", _jsxs("select", { value: state.creditFilters.onlyWithCredit, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "onlyWithCredit", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So com credito" })] })] }), _jsxs("label", { children: ["Credito sem uso", _jsxs("select", { value: state.creditFilters.onlyUnusedCredit, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "onlyUnusedCredit", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So oportunidades" })] })] }), _jsxs("label", { children: ["Somente vencidos", _jsxs("select", { value: state.creditFilters.onlyOverdue, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "onlyOverdue", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So vencidos" })] })] })] }))] }), state.activeView === "portfolio" ? (_jsxs(_Fragment, { children: [customersQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes..." }) : null, customersQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar a carteira." }) : null, customersQuery.data ? _jsx(CustomerTable, { customers: customersQuery.data }) : null] })) : state.activeView === "docInsights" ? (_jsxs(_Fragment, { children: [docInsightsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando insights de DOC..." }) : null, docInsightsQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar os insights de DOC." }) : null, docInsightsQuery.data ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "stats-grid customers-doc-stats", children: [_jsx(StatCard, { title: "Clientes com DOC", value: formatNumber(docInsightsQuery.data.summary.customersWithDoc), helper: "Clientes que ja compraram DOC ao menos uma vez", tone: "success" }), _jsx(StatCard, { title: "Pedidos com DOC", value: formatNumber(docInsightsQuery.data.summary.docOrders), helper: "Pedidos distintos contendo DOC no historico" }), _jsx(StatCard, { title: "Pecas de DOC", value: formatNumber(docInsightsQuery.data.summary.docQuantity), helper: "Quantidade total de unidades vendidas", tone: "warning" }), _jsx(StatCard, { title: "Faturamento DOC", value: formatCurrency(docInsightsQuery.data.summary.docRevenue), helper: "Receita acumulada dessa familia" })] }), _jsxs("section", { className: "panel customers-doc-intro", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Ranking DOC" }), _jsx("h3", { children: "Quem mais compra DOC de Carga" })] }) }), _jsx("p", { className: "panel-subcopy", children: "Ordenacao fixa por pecas de DOC, depois quantidade de pedidos com DOC, faturamento e nome do cliente." })] }), _jsx(CustomerDocInsightsTable, { ranking: docInsightsQuery.data.ranking })] })) : null] })) : (_jsxs(_Fragment, { children: [creditOverviewQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando credito e pagamento..." }) : null, creditOverviewQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar o snapshot financeiro." }) : null, creditOverviewQuery.data ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "credit-kpi-strip", children: [_jsxs("button", { type: "button", className: `credit-kpi-card tone-warning ${state.creditKpiFilter === "owing" ? "active" : ""}`, onClick: () => dispatch({ type: "setCreditKpiFilter", value: "owing" }), children: [_jsxs("div", { className: "credit-kpi-header", children: [_jsx("span", { className: "credit-kpi-label", children: "Em aberto" }), _jsx("div", { className: "credit-kpi-icon tone-warning", children: _jsx(BadgeDollarSign, { size: 18 }) })] }), _jsx("strong", { className: "credit-kpi-value", children: formatCurrency(filteredDebtAmount) }), _jsxs("span", { className: "credit-kpi-helper", children: [formatNumber(filteredDebtCount), " clientes com divida"] })] }), _jsxs("button", { type: "button", className: `credit-kpi-card tone-success ${state.creditKpiFilter === "credit_balance" ? "active" : ""}`, onClick: () => dispatch({ type: "setCreditKpiFilter", value: "credit_balance" }), children: [_jsxs("div", { className: "credit-kpi-header", children: [_jsx("span", { className: "credit-kpi-label", children: "Saldo a favor" }), _jsx("div", { className: "credit-kpi-icon tone-success", children: _jsx(TrendingUp, { size: 18 }) })] }), _jsx("strong", { className: "credit-kpi-value", children: formatCurrency(filteredCreditBalanceAmount) }), _jsxs("span", { className: "credit-kpi-helper", children: [formatNumber(filteredCreditBalanceCount), " clientes com saldo positivo"] })] }), _jsxs("button", { type: "button", className: `credit-kpi-card tone-info ${state.creditKpiFilter === "unused_credit" ? "active" : ""}`, onClick: () => dispatch({ type: "setCreditKpiFilter", value: "unused_credit" }), children: [_jsxs("div", { className: "credit-kpi-header", children: [_jsx("span", { className: "credit-kpi-label", children: "Credito livre" }), _jsx("div", { className: "credit-kpi-icon tone-info", children: _jsx(TrendingUp, { size: 18 }) })] }), _jsx("strong", { className: "credit-kpi-value", children: formatCurrency(filteredAvailableCreditAmount) }), _jsxs("span", { className: "credit-kpi-helper", children: [formatNumber(filteredUnusedCreditCount), " clientes para empurrar venda"] })] }), _jsxs("button", { type: "button", className: `credit-kpi-card tone-danger ${state.creditKpiFilter === "over_credit" ? "active" : ""}`, onClick: () => dispatch({ type: "setCreditKpiFilter", value: "over_credit" }), children: [_jsxs("div", { className: "credit-kpi-header", children: [_jsx("span", { className: "credit-kpi-label", children: "Acima do limite" }), _jsx("div", { className: "credit-kpi-icon tone-danger", children: _jsx(ShieldAlert, { size: 18 }) })] }), _jsx("strong", { className: "credit-kpi-value", children: formatCurrency(filteredTotalExcessAmount) }), _jsxs("span", { className: "credit-kpi-helper", children: [formatNumber(filteredOverCreditCount), " acima e ", formatNumber(filteredOverdueCount), " com atraso"] })] })] }), _jsxs("div", { className: "credit-insights-strip", children: [_jsxs("button", { type: "button", className: "credit-insight-card danger", onClick: () => dispatch({ type: "setCreditKpiFilter", value: "over_credit" }), children: [_jsx("div", { className: "credit-insight-icon", children: _jsx(AlertTriangle, { size: 20 }) }), _jsxs("div", { className: "credit-insight-body", children: [_jsx("strong", { children: "Cobranca urgente" }), _jsxs("span", { children: [formatNumber(filteredOverCreditCount), " clientes ultrapassaram o limite de credito \u2014 priorize contato"] })] })] }), _jsxs("button", { type: "button", className: "credit-insight-card success", onClick: () => dispatch({ type: "setCreditKpiFilter", value: "unused_credit" }), children: [_jsx("div", { className: "credit-insight-icon", children: _jsx(TrendingUp, { size: 20 }) }), _jsxs("div", { className: "credit-insight-body", children: [_jsx("strong", { children: "Oportunidade de venda" }), _jsxs("span", { children: [formatCurrency(filteredAvailableCreditAmount), " disponiveis em ", formatNumber(filteredUnusedCreditCount), " clientes com credito livre"] })] })] }), _jsxs("button", { type: "button", className: "credit-insight-card warning", onClick: () => dispatch({ type: "updateCreditFilter", key: "onlyOverdue", value: state.creditFilters.onlyOverdue === "true" ? "" : "true" }), children: [_jsx("div", { className: "credit-insight-icon", children: _jsx(AlertTriangle, { size: 20 }) }), _jsxs("div", { className: "credit-insight-body", children: [_jsx("strong", { children: "Clientes com atraso" }), _jsxs("span", { children: [formatNumber(filteredOverdueCount), " com pagamento vencido ou sem pagamento registrado"] })] })] })] }), _jsxs("div", { className: "credit-snapshot-bar", children: [_jsxs("div", { className: "credit-snapshot-info", children: [_jsx("strong", { children: creditOverviewQuery.data.snapshot?.sourceFileName ?? "Sem snapshot" }), _jsx("span", { children: creditOverviewQuery.data.snapshot
                                                    ? `${formatNumber(creditOverviewQuery.data.snapshot.matchedRows)} vinculados · ${formatNumber(creditOverviewQuery.data.snapshot.unmatchedRows)} nao vinculados`
                                                    : "Sem dados carregados" }), creditOverviewQuery.data.snapshot ? (_jsxs("small", { children: ["Arquivo ", formatDateTime(creditOverviewQuery.data.snapshot.sourceFileUpdatedAt), " \u00B7 Importado", " ", formatDateTime(creditOverviewQuery.data.snapshot.importedAt)] })) : null] }), _jsxs("div", { className: "credit-snapshot-actions", children: [state.creditKpiFilter ? (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => dispatch({ type: "setCreditKpiFilter", value: "" }), children: "Limpar filtro" })) : null, canRefreshCredit ? (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => refreshCreditMutation.mutate(), disabled: refreshCreditMutation.isPending, children: refreshCreditMutation.isPending ? "Atualizando..." : "Atualizar agora" })) : null] })] }), refreshCreditMutation.isError ? (_jsx("span", { className: "inline-error", children: "Nao foi possivel atualizar o arquivo agora." })) : null, _jsx("div", { className: "credit-results-meta", children: _jsxs("p", { children: ["Exibindo ", formatNumber(kpiFilteredRows.length), " de", " ", formatNumber(creditOverviewQuery.data.summary.totalLinkedCustomers), " clientes vinculados.", state.creditKpiFilter ? (_jsx("button", { type: "button", className: "credit-clear-filter-inline", onClick: () => dispatch({ type: "setCreditKpiFilter", value: "" }), children: "Mostrar todos" })) : null] }) }), _jsx(CustomerCreditTable, { rows: kpiFilteredRows, emptyMessage: "Nenhum cliente vinculado ao CRM bate com esse filtro." }), _jsxs("details", { className: "panel customer-credit-unmatched-panel", children: [_jsxs("summary", { children: ["Nao vinculados ao CRM (", formatNumber(filteredUnmatchedCreditRows.length), "/", formatNumber(creditOverviewQuery.data.summary.totalUnmatchedRows), ")"] }), _jsxs("p", { className: "panel-subcopy", children: ["Esses codigos existem no Excel diario, mas ainda nao encontraram correspondencia pelo", " ", _jsx("code", { children: "customer_code" }), " do CRM. Eles ficam visiveis para revisao sem poluir a operacao principal."] }), _jsx(CustomerCreditTable, { rows: filteredUnmatchedCreditRows, linkedOnly: false, emptyMessage: "Nenhum codigo nao vinculado bate com esse filtro." })] })] })) : null] }))] }));
}

import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "../lib/format";
import { isOverdueCreditRow } from "../lib/customerCredit";
import { CustomerCreditCardList } from "../components/CustomerCreditCardList";
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
function buildCreditSections(rows) {
    return [
        {
            key: "charge-now",
            title: "Cobranca imediata",
            helper: "Acima do limite, sem credito ou com atraso relevante.",
            rows: rows.filter((row) => row.hasOverCredit || row.hasDebtWithoutCredit || isOverdueCreditRow(row)),
        },
        {
            key: "within-limit",
            title: "Devendo dentro do limite",
            helper: "Clientes que estao usando credito, mas ainda cabem no limite liberado.",
            rows: rows.filter((row) => row.debtAmount > 0 && row.withinCreditLimit && !row.hasOverCredit && !row.hasDebtWithoutCredit),
        },
        {
            key: "upsell",
            title: "Credito livre para vender",
            helper: "Carteira com limite liberado e sem saldo em aberto agora.",
            rows: rows.filter((row) => row.operationalState === "UNUSED_CREDIT"),
        },
        {
            key: "positive-balance",
            title: "Saldo a favor",
            helper: "Clientes com saldo positivo registrado no resumo financeiro.",
            rows: rows.filter((row) => row.operationalState === "HAS_CREDIT_BALANCE"),
        },
        {
            key: "settled",
            title: "Sem pendencia",
            helper: "Clientes zerados no snapshot atual.",
            rows: rows.filter((row) => row.operationalState === "SETTLED"),
        },
    ];
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
    const creditSections = useMemo(() => buildCreditSections(filteredLinkedCreditRows), [filteredLinkedCreditRows]);
    const filteredCreditBalanceCustomers = useMemo(() => filteredLinkedCreditRows.filter((row) => row.creditBalanceAmount > 0).length, [filteredLinkedCreditRows]);
    const filteredAvailableCreditAmount = useMemo(() => filteredLinkedCreditRows.reduce((sum, row) => sum + row.availableCreditAmount, 0), [filteredLinkedCreditRows]);
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Clientes" }), _jsx("h2", { children: activeTab.title })] }), _jsx("div", { className: "chart-switcher customers-view-switcher", role: "tablist", "aria-label": "Alternar visao da pagina de clientes", children: viewTabs.map((tab) => (_jsx("button", { type: "button", role: "tab", title: tab.helper, "aria-selected": state.activeView === tab.value, "aria-pressed": state.activeView === tab.value, className: `chart-switch-button ${state.activeView === tab.value ? "active" : ""}`, onClick: () => dispatch({ type: "setView", view: tab.value }), children: _jsx("strong", { children: tab.label }) }, tab.value))) })] }), state.activeView === "portfolio" ? (_jsxs("div", { className: "filters-grid filters-grid-six", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: state.portfolioFilters.search, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "search", value: event.target.value }), placeholder: "Nome ou codigo" })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: state.portfolioFilters.status, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "status", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { children: ["Ordenar por", _jsxs("select", { value: state.portfolioFilters.sortBy, onChange: (event) => dispatch({
                                            type: "updatePortfolioFilter",
                                            key: "sortBy",
                                            value: event.target.value,
                                        }), children: [_jsx("option", { value: "priority", children: "Prioridade" }), _jsx("option", { value: "faturamento", children: "Faturamento" }), _jsx("option", { value: "recencia", children: "Recencia" })] })] }), _jsxs("label", { children: ["Com rotulo", _jsxs("select", { value: state.portfolioFilters.label, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "label", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Excluir rotulo", _jsxs("select", { value: state.portfolioFilters.excludeLabel, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "excludeLabel", value: event.target.value }), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Embaixadores", _jsxs("select", { value: state.portfolioFilters.ambassadorOnly, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "ambassadorOnly", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So embaixadores" })] })] })] })) : state.activeView === "docInsights" ? (_jsxs("p", { className: "panel-subcopy customers-doc-subcopy", children: ["Ranking global no historico total da base, considerando como DOC os itens cuja descricao contenha", " ", _jsx("code", { children: "DOC DE CARGA" }), "."] })) : (_jsxs("div", { className: "filters-grid filters-grid-six", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: state.creditFilters.search, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "search", value: event.target.value }), placeholder: "Nome, codigo, observacao ou flag" })] }), _jsxs("label", { children: ["Grau de risco", _jsxs("select", { value: state.creditFilters.riskLevel, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "riskLevel", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "CRITICO", children: "Critico" }), _jsx("option", { value: "ATENCAO", children: "Atencao" }), _jsx("option", { value: "MONITORAR", children: "Monitorar" }), _jsx("option", { value: "OK", children: "OK" })] })] }), _jsxs("label", { children: ["Situacao", _jsxs("select", { value: state.creditFilters.operationalState, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "operationalState", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todas" }), _jsx("option", { value: "OWES", children: "Devendo" }), _jsx("option", { value: "OVER_CREDIT", children: "Ultrapassou credito" }), _jsx("option", { value: "UNUSED_CREDIT", children: "Credito sem uso" }), _jsx("option", { value: "HAS_CREDIT_BALANCE", children: "Saldo a favor" }), _jsx("option", { value: "SETTLED", children: "Quitado" })] })] }), _jsxs("label", { children: ["Com credito", _jsxs("select", { value: state.creditFilters.onlyWithCredit, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "onlyWithCredit", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So com credito" })] })] }), _jsxs("label", { children: ["Credito sem uso", _jsxs("select", { value: state.creditFilters.onlyUnusedCredit, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "onlyUnusedCredit", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So oportunidades" })] })] }), _jsxs("label", { children: ["Somente vencidos", _jsxs("select", { value: state.creditFilters.onlyOverdue, onChange: (event) => dispatch({ type: "updateCreditFilter", key: "onlyOverdue", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So vencidos" })] })] })] }))] }), state.activeView === "portfolio" ? (_jsxs(_Fragment, { children: [customersQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes..." }) : null, customersQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar a carteira." }) : null, customersQuery.data ? _jsx(CustomerTable, { customers: customersQuery.data }) : null] })) : state.activeView === "docInsights" ? (_jsxs(_Fragment, { children: [docInsightsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando insights de DOC..." }) : null, docInsightsQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar os insights de DOC." }) : null, docInsightsQuery.data ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "stats-grid customers-doc-stats", children: [_jsx(StatCard, { title: "Clientes com DOC", value: formatNumber(docInsightsQuery.data.summary.customersWithDoc), helper: "Clientes que ja compraram DOC ao menos uma vez", tone: "success" }), _jsx(StatCard, { title: "Pedidos com DOC", value: formatNumber(docInsightsQuery.data.summary.docOrders), helper: "Pedidos distintos contendo DOC no historico" }), _jsx(StatCard, { title: "Pecas de DOC", value: formatNumber(docInsightsQuery.data.summary.docQuantity), helper: "Quantidade total de unidades vendidas", tone: "warning" }), _jsx(StatCard, { title: "Faturamento DOC", value: formatCurrency(docInsightsQuery.data.summary.docRevenue), helper: "Receita acumulada dessa familia" })] }), _jsxs("section", { className: "panel customers-doc-intro", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Ranking DOC" }), _jsx("h3", { children: "Quem mais compra DOC de Carga" })] }) }), _jsx("p", { className: "panel-subcopy", children: "Ordenacao fixa por pecas de DOC, depois quantidade de pedidos com DOC, faturamento e nome do cliente." })] }), _jsx(CustomerDocInsightsTable, { ranking: docInsightsQuery.data.ranking })] })) : null] })) : (_jsxs(_Fragment, { children: [creditOverviewQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando credito e pagamento..." }) : null, creditOverviewQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar o snapshot financeiro." }) : null, creditOverviewQuery.data ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel customer-credit-workspace", children: [_jsxs("div", { className: "customer-credit-topbar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Operacao financeira" }), _jsx("h3", { children: "Credito, cobranca e oportunidade de venda" }), _jsx("p", { className: "panel-subcopy", children: "Agora o saldo em aberto respeita o limite liberado. Se a divida estiver dentro do credito, o cliente aparece como dentro do limite, nao como ultrapassado." })] }), _jsxs("div", { className: "customer-credit-topbar-actions", children: [_jsxs("div", { className: "customer-credit-meta-chip", children: [_jsx("strong", { children: creditOverviewQuery.data.snapshot?.sourceFileName ?? "Sem snapshot" }), _jsx("span", { children: creditOverviewQuery.data.snapshot
                                                                    ? `${formatNumber(creditOverviewQuery.data.snapshot.matchedRows)} vinculados | ${formatNumber(creditOverviewQuery.data.snapshot.unmatchedRows)} nao vinculados`
                                                                    : "Sem dados carregados" }), creditOverviewQuery.data.snapshot ? (_jsxs("small", { children: ["Arquivo ", formatDateTime(creditOverviewQuery.data.snapshot.sourceFileUpdatedAt), " | Importado", " ", formatDateTime(creditOverviewQuery.data.snapshot.importedAt)] })) : null] }), _jsxs("div", { className: "chart-switcher customers-credit-layout-switcher", role: "tablist", "aria-label": "Alternar leitura da aba de credito", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": state.creditPresentation === "cards", className: `chart-switch-button ${state.creditPresentation === "cards" ? "active" : ""}`, onClick: () => dispatch({ type: "setCreditPresentation", value: "cards" }), children: _jsx("strong", { children: "Cards" }) }), _jsx("button", { type: "button", role: "tab", "aria-selected": state.creditPresentation === "table", className: `chart-switch-button ${state.creditPresentation === "table" ? "active" : ""}`, onClick: () => dispatch({ type: "setCreditPresentation", value: "table" }), children: _jsx("strong", { children: "Tabela" }) })] }), canRefreshCredit ? (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => refreshCreditMutation.mutate(), disabled: refreshCreditMutation.isPending, children: refreshCreditMutation.isPending ? "Atualizando..." : "Atualizar agora" })) : null] })] }), refreshCreditMutation.isError ? (_jsx("span", { className: "inline-error", children: "Nao foi possivel atualizar o arquivo agora." })) : null, _jsxs("div", { className: "customer-credit-kpi-strip", children: [_jsxs("article", { className: "customer-credit-kpi tone-warning", children: [_jsx("span", { children: "Em aberto" }), _jsx("strong", { children: formatCurrency(creditOverviewQuery.data.summary.totalDebtAmount) }), _jsxs("small", { children: [formatNumber(creditOverviewQuery.data.summary.customersOwing), " clientes com divida"] })] }), _jsxs("article", { className: "customer-credit-kpi tone-success", children: [_jsx("span", { children: "Saldo a favor" }), _jsx("strong", { children: formatCurrency(creditOverviewQuery.data.summary.totalCreditBalanceAmount) }), _jsxs("small", { children: [formatNumber(filteredCreditBalanceCustomers), " clientes com saldo positivo"] })] }), _jsxs("article", { className: "customer-credit-kpi tone-info", children: [_jsx("span", { children: "Credito livre" }), _jsx("strong", { children: formatCurrency(filteredAvailableCreditAmount) }), _jsxs("small", { children: [formatNumber(creditOverviewQuery.data.summary.customersWithUnusedCredit), " clientes para empurrar venda"] })] }), _jsxs("article", { className: "customer-credit-kpi tone-danger", children: [_jsx("span", { children: "Acima do limite" }), _jsx("strong", { children: formatNumber(creditOverviewQuery.data.summary.customersOverCredit) }), _jsxs("small", { children: [formatNumber(creditOverviewQuery.data.summary.customersOverdue), " com atraso ou sem pagamento"] })] })] }), _jsxs("div", { className: "customer-credit-result-meta", children: [_jsxs("p", { children: ["Exibindo ", formatNumber(filteredLinkedCreditRows.length), " de", " ", formatNumber(creditOverviewQuery.data.summary.totalLinkedCustomers), " clientes vinculados."] }), _jsx("p", { children: "Os codigos nao vinculados continuam abaixo para revisao, sem poluir a operacao principal." })] })] }), state.creditPresentation === "cards" ? (filteredLinkedCreditRows.length ? (_jsx("div", { className: "customer-credit-sections", children: creditSections
                                    .filter((section) => section.rows.length > 0)
                                    .map((section) => (_jsxs("section", { className: "panel customer-credit-section", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsxs("h3", { children: [section.title, " ", _jsx("span", { className: "customer-credit-section-count", children: formatNumber(section.rows.length) })] }), _jsx("p", { className: "panel-subcopy", children: section.helper })] }) }), _jsx(CustomerCreditCardList, { rows: section.rows, emptyMessage: "Nenhum cliente nessa faixa." })] }, section.key))) })) : (_jsx("div", { className: "panel empty-panel", children: _jsx("div", { className: "empty-state", children: "Nenhum cliente vinculado ao CRM bate com esse filtro." }) }))) : (_jsx(CustomerCreditTable, { rows: filteredLinkedCreditRows, emptyMessage: "Nenhum cliente vinculado ao CRM bate com esse filtro." })), _jsxs("details", { className: "panel customer-credit-unmatched-panel", children: [_jsxs("summary", { children: ["Nao vinculados ao CRM (", formatNumber(filteredUnmatchedCreditRows.length), "/", formatNumber(creditOverviewQuery.data.summary.totalUnmatchedRows), ")"] }), _jsxs("p", { className: "panel-subcopy", children: ["Esses codigos existem no Excel diario, mas ainda nao encontraram correspondencia pelo", " ", _jsx("code", { children: "customer_code" }), " do CRM. Eles ficam visiveis para revisao sem poluir a operacao principal."] }), _jsx(CustomerCreditTable, { rows: filteredUnmatchedCreditRows, linkedOnly: false, emptyMessage: "Nenhum codigo nao vinculado bate com esse filtro." })] })] })) : null] }))] }));
}

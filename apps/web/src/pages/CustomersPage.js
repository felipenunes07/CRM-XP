import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { CustomerDocInsightsTable } from "../components/CustomerDocInsightsTable";
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
];
export function CustomersPage() {
    const { token } = useAuth();
    const [state, dispatch] = useReducer(customersPageReducer, undefined, createInitialCustomersPageState);
    const customerQueryParams = buildCustomersQueryParams(state.portfolioFilters);
    const activeTab = viewTabs.find((tab) => tab.value === state.activeView) ?? viewTabs[0];
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
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Clientes" }), _jsx("h2", { children: activeTab.title })] }) }), _jsx("div", { className: "chart-switcher customers-view-switcher", role: "tablist", "aria-label": "Alternar visao da pagina de clientes", children: viewTabs.map((tab) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": state.activeView === tab.value, "aria-pressed": state.activeView === tab.value, className: `chart-switch-button ${state.activeView === tab.value ? "active" : ""}`, onClick: () => dispatch({ type: "setView", view: tab.value }), children: [_jsx("strong", { children: tab.label }), _jsx("span", { children: tab.helper })] }, tab.value))) }), state.activeView === "portfolio" ? (_jsxs("div", { className: "filters-grid filters-grid-six", children: [_jsxs("label", { children: ["Buscar", _jsx("input", { value: state.portfolioFilters.search, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "search", value: event.target.value }), placeholder: "Nome ou codigo" })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: state.portfolioFilters.status, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "status", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { children: ["Ordenar por", _jsxs("select", { value: state.portfolioFilters.sortBy, onChange: (event) => dispatch({
                                            type: "updatePortfolioFilter",
                                            key: "sortBy",
                                            value: event.target.value,
                                        }), children: [_jsx("option", { value: "priority", children: "Prioridade" }), _jsx("option", { value: "faturamento", children: "Faturamento" }), _jsx("option", { value: "recencia", children: "Recencia" })] })] }), _jsxs("label", { children: ["Com rotulo", _jsxs("select", { value: state.portfolioFilters.label, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "label", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Excluir rotulo", _jsxs("select", { value: state.portfolioFilters.excludeLabel, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "excludeLabel", value: event.target.value }), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Embaixadores", _jsxs("select", { value: state.portfolioFilters.ambassadorOnly, onChange: (event) => dispatch({ type: "updatePortfolioFilter", key: "ambassadorOnly", value: event.target.value }), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "true", children: "So embaixadores" })] })] })] })) : (_jsxs("p", { className: "panel-subcopy customers-doc-subcopy", children: ["Ranking global no historico total da base, considerando como DOC os itens cuja descricao contenha", " ", _jsx("code", { children: "DOC DE CARGA" }), "."] }))] }), state.activeView === "portfolio" ? (_jsxs(_Fragment, { children: [customersQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando clientes..." }) : null, customersQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar a carteira." }) : null, customersQuery.data ? _jsx(CustomerTable, { customers: customersQuery.data }) : null] })) : (_jsxs(_Fragment, { children: [docInsightsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando insights de DOC..." }) : null, docInsightsQuery.isError ? _jsx("div", { className: "page-error", children: "Falha ao carregar os insights de DOC." }) : null, docInsightsQuery.data ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "stats-grid customers-doc-stats", children: [_jsx(StatCard, { title: "Clientes com DOC", value: formatNumber(docInsightsQuery.data.summary.customersWithDoc), helper: "Clientes que ja compraram DOC ao menos uma vez", tone: "success" }), _jsx(StatCard, { title: "Pedidos com DOC", value: formatNumber(docInsightsQuery.data.summary.docOrders), helper: "Pedidos distintos contendo DOC no historico" }), _jsx(StatCard, { title: "Pecas de DOC", value: formatNumber(docInsightsQuery.data.summary.docQuantity), helper: "Quantidade total de unidades vendidas", tone: "warning" }), _jsx(StatCard, { title: "Faturamento DOC", value: formatCurrency(docInsightsQuery.data.summary.docRevenue), helper: "Receita acumulada dessa familia" })] }), _jsxs("section", { className: "panel customers-doc-intro", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Ranking DOC" }), _jsx("h3", { children: "Quem mais compra DOC de Carga" })] }) }), _jsx("p", { className: "panel-subcopy", children: "Ordenacao fixa por pecas de DOC, depois quantidade de pedidos com DOC, faturamento e nome do cliente." })] }), _jsx(CustomerDocInsightsTable, { ranking: docInsightsQuery.data.ranking })] })) : null] }))] }));
}

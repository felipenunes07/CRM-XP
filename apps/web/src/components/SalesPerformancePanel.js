import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatNumber } from "../lib/format";
function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
export function SalesPerformancePanel({ salesPerformance, isLoading }) {
    if (isLoading) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Performance do m\u00EAs" }), _jsx("h3", { children: "Vendas por atendente" })] }) }), _jsx("div", { className: "page-loading", children: "Carregando performance..." })] }));
    }
    if (!salesPerformance.length) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Performance do m\u00EAs" }), _jsx("h3", { children: "Vendas por atendente" })] }) }), _jsx("div", { className: "empty-state", children: "Nenhuma venda registrada neste m\u00EAs." })] }));
    }
    return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Performance do m\u00EAs" }), _jsxs("h3", { children: ["Top ", salesPerformance.length, " vendedoras"] }), _jsx("p", { className: "panel-subcopy", children: "Vendas, clientes atendidos e faturamento do m\u00EAs atual." })] }) }), _jsx("div", { className: "sales-performance-list", children: salesPerformance.map((entry, index) => (_jsxs("div", { className: "sales-performance-entry", children: [_jsxs("div", { className: "sales-performance-rank", children: ["#", index + 1] }), _jsxs("div", { className: "sales-performance-info", children: [_jsx("strong", { children: entry.attendant }), _jsxs("div", { className: "sales-performance-metrics", children: [_jsxs("div", { className: "sales-metric", children: [_jsx("span", { className: "sales-metric-value", children: formatNumber(entry.totalOrders) }), _jsx("span", { className: "sales-metric-label", children: "vendas" })] }), _jsx("span", { className: "separator", children: "\u2022" }), _jsxs("div", { className: "sales-metric", children: [_jsx("span", { className: "sales-metric-value", children: formatNumber(entry.uniqueCustomers) }), _jsx("span", { className: "sales-metric-label", children: "clientes" })] }), _jsx("span", { className: "separator", children: "\u2022" }), _jsxs("div", { className: "sales-metric", children: [_jsx("span", { className: "sales-metric-value", children: formatCurrency(entry.totalRevenue) }), _jsx("span", { className: "sales-metric-label", children: "faturamento" })] })] })] })] }, entry.attendant))) })] }));
}

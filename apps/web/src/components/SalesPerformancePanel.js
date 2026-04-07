import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatNumber } from "../lib/format";
export function SalesPerformancePanel({ salesPerformance, isLoading }) {
    if (isLoading) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Performance do m\u00EAs" }), _jsx("h3", { children: "Ranking Mensal" })] }) }), _jsx("div", { className: "page-loading", children: "Carregando performance..." })] }));
    }
    if (!salesPerformance.length) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Performance do m\u00EAs" }), _jsx("h3", { children: "Ranking Mensal" })] }) }), _jsx("div", { className: "empty-state", children: "Nenhuma venda registrada neste m\u00EAs." })] }));
    }
    const maxOrders = Math.max(...salesPerformance.map((e) => e.totalOrders));
    return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Performance do m\u00EAs" }), _jsx("h3", { children: "Ranking Mensal" }), _jsx("p", { className: "panel-subcopy", children: "Desempenho corporativo com base nas vendas do per\u00EDodo." })] }) }), _jsx("div", { className: "ranking-balanced-list", children: salesPerformance.map((entry, index) => {
                    const isTop3 = index < 3;
                    const posClass = isTop3 ? `pos-${index + 1}` : "";
                    const pct = maxOrders > 0 ? (entry.totalOrders / maxOrders) * 100 : 0;
                    return (_jsxs("div", { className: `ranking-card ${posClass}`, children: [_jsx("div", { className: "ranking-badge", children: index + 1 }), _jsxs("div", { className: "ranking-content", children: [_jsxs("div", { className: "ranking-header", children: [_jsx("span", { className: "ranking-name", children: entry.attendant }), index === 0 && _jsx("span", { className: "ranking-tag", children: "Top Performer" })] }), _jsxs("div", { className: "ranking-metrics", children: [_jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: formatNumber(entry.totalOrders) }), _jsx("span", { children: "vendas" })] }), _jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: formatNumber(entry.totalItems) }), _jsx("span", { children: "pe\u00E7as" })] }), _jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: formatNumber(entry.uniqueCustomers) }), _jsx("span", { children: "clientes" })] })] }), _jsx("div", { className: "ranking-bar-bg", children: _jsx("div", { className: "ranking-bar-fill", style: { width: `${pct}%` } }) })] })] }, entry.attendant));
                }) })] }));
}

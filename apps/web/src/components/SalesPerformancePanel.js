import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatNumber } from "../lib/format";
import { useUiLanguage } from "../i18n";
export function SalesPerformancePanel({ salesPerformance, isLoading }) {
    const { tx } = useUiLanguage();
    if (isLoading) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Performance do mes", "本月表现") }), _jsx("h3", { children: tx("Ranking Mensal", "月度排名") })] }) }), _jsx("div", { className: "page-loading", children: tx("Carregando performance...", "正在加载表现数据...") })] }));
    }
    const filteredSalesPerformance = salesPerformance.filter((entry) => {
        const name = entry.attendant.toLowerCase();
        return name !== "iza" && name !== "sem atendente";
    });
    if (!filteredSalesPerformance.length) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Performance do mes", "本月表现") }), _jsx("h3", { children: tx("Ranking Mensal", "月度排名") })] }) }), _jsx("div", { className: "empty-state", children: tx("Nenhuma venda registrada neste mes.", "本月暂无销售记录。") })] }));
    }
    const maxOrders = Math.max(...filteredSalesPerformance.map((entry) => entry.totalOrders));
    return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Performance do mes", "本月表现") }), _jsx("h3", { children: tx("Ranking Mensal", "月度排名") }), _jsx("p", { className: "panel-subcopy", children: tx("Desempenho corporativo com base nas vendas do periodo.", "基于当前周期销售数据的团队表现。") })] }) }), _jsx("div", { className: "ranking-balanced-list", children: filteredSalesPerformance.map((entry, index) => {
                    const isTop3 = index < 3;
                    const posClass = isTop3 ? `pos-${index + 1}` : "";
                    const pct = maxOrders > 0 ? (entry.totalOrders / maxOrders) * 100 : 0;
                    return (_jsxs("div", { className: `ranking-card ${posClass}`, children: [_jsx("div", { className: "ranking-badge", children: index + 1 }), _jsxs("div", { className: "ranking-content", children: [_jsxs("div", { className: "ranking-header", children: [_jsx("span", { className: "ranking-name", children: entry.attendant }), index === 0 && _jsx("span", { className: "ranking-tag", children: tx("Top Performer", "最佳表现") })] }), _jsxs("div", { className: "ranking-metrics", children: [_jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: formatNumber(entry.totalOrders) }), _jsx("span", { children: tx("vendas", "销售") })] }), _jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: formatNumber(entry.totalItems) }), _jsx("span", { children: tx("pecas", "件数") })] }), _jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: formatNumber(entry.uniqueCustomers) }), _jsx("span", { children: tx("clientes", "客户") })] })] }), _jsx("div", { className: "ranking-bar-bg", children: _jsx("div", { className: "ranking-bar-fill", style: { width: `${pct}%` } }) })] })] }, entry.attendant));
                }) })] }));
}

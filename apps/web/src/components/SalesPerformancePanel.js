import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useUiLanguage } from "../i18n";
import { formatCurrency, formatNumber } from "../lib/format";
const HIDDEN_ATTENDANTS = new Set(["iza", "sem atendente"]);
export function SalesPerformancePanel({ salesPerformance, reactivationLeaderboard, newCustomerLeaderboard, prospectingLeaderboard, isLoading, }) {
    const { tx } = useUiLanguage();
    const [activeTab, setActiveTab] = useState("sales");
    const rankingViews = {
        sales: {
            label: tx("Vendas", "Sales"),
            description: tx("Desempenho corporativo com base nas vendas do periodo.", "Team performance based on sales in the selected period."),
            emptyMessage: tx("Nenhuma venda registrada neste mes.", "No sales registered this month."),
            entries: salesPerformance.map((entry) => ({
                attendant: entry.attendant,
                metrics: [
                    { value: entry.totalOrders, label: tx("vendas", "sales") },
                    { value: entry.totalItems, label: tx("pecas", "items") },
                    { value: entry.uniqueCustomers, label: tx("clientes", "customers") },
                ],
            })),
        },
        reactivation: {
            label: tx("Recuperacao", "Reactivation"),
            description: tx("Veja quem mais recuperou clientes inativos no mes atual.", "See who recovered the most inactive customers this month."),
            emptyMessage: tx("Nenhuma recuperacao registrada neste mes.", "No reactivations registered this month."),
            entries: reactivationLeaderboard.map((entry) => ({
                attendant: entry.attendant,
                metrics: [
                    { value: entry.recoveredCustomers, label: tx("clientes recuperados", "recovered customers") },
                    { value: entry.recoveredItems, label: tx("pecas recuperadas", "recovered items") },
                    { value: entry.recoveredRevenue, label: tx("faturamento", "revenue"), formatter: formatCurrency },
                ],
            })),
        },
        newCustomers: {
            label: tx("Clientes novos", "New customers"),
            description: tx("Mostra as vendedoras que mais trouxeram clientes novos no mes.", "Shows which sellers brought the most new customers this month."),
            emptyMessage: tx("Nenhum cliente novo registrado neste mes.", "No new customers registered this month."),
            entries: newCustomerLeaderboard.map((entry) => ({
                attendant: entry.attendant,
                metrics: [
                    { value: entry.newCustomers, label: tx("clientes novos", "new customers") },
                    { value: entry.totalItems, label: tx("pecas iniciais", "first items") },
                    { value: entry.totalRevenue, label: tx("faturamento", "revenue"), formatter: formatCurrency },
                ],
            })),
        },
        prospecting: {
            label: tx("Prospeccao", "Prospecting"),
            description: tx("Acompanhe quem mais abordou leads e fez prospeccao no mes.", "Track who contacted the most leads this month."),
            emptyMessage: tx("Nenhuma prospeccao registrada neste mes.", "No prospecting activity registered this month."),
            entries: prospectingLeaderboard.map((entry) => ({
                attendant: entry.attendant,
                metrics: [
                    { value: entry.contactedLeads, label: tx("leads contatados", "contacted leads") },
                    { value: entry.firstContacts, label: tx("primeiros contatos", "first contacts") },
                    { value: entry.contactAttempts, label: tx("tentativas", "attempts") },
                ],
            })),
        },
    };
    const currentView = rankingViews[activeTab];
    const filteredEntries = currentView.entries.filter((entry) => !HIDDEN_ATTENDANTS.has(entry.attendant.toLowerCase()));
    if (isLoading) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Performance do mes", "Month performance") }), _jsx("h3", { children: tx("Ranking Mensal", "Monthly ranking") })] }) }), _jsx("div", { className: "page-loading", children: tx("Carregando performance...", "Loading performance...") })] }));
    }
    return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Performance do mes", "Month performance") }), _jsx("h3", { children: tx("Ranking Mensal", "Monthly ranking") }), _jsx("div", { className: "ranking-tabs", role: "tablist", "aria-label": tx("Abas do ranking mensal", "Monthly ranking tabs"), children: Object.entries(rankingViews).map(([key, view]) => (_jsx("button", { type: "button", role: "tab", "aria-selected": activeTab === key, className: `ranking-tab ${activeTab === key ? "active" : ""}`, onClick: () => setActiveTab(key), children: view.label }, key))) }), _jsx("p", { className: "panel-subcopy", children: currentView.description })] }) }), !filteredEntries.length ? (_jsx("div", { className: "empty-state", children: currentView.emptyMessage })) : (_jsx(RankingList, { entries: filteredEntries, topPerformerLabel: tx("Top Performer", "Top performer") }))] }));
}
function RankingList({ entries, topPerformerLabel, }) {
    const maxMetricValue = Math.max(...entries.map((entry) => entry.metrics[0].value));
    return (_jsx("div", { className: "ranking-balanced-list", children: entries.map((entry, index) => {
            const isTop3 = index < 3;
            const posClass = isTop3 ? `pos-${index + 1}` : "";
            const pct = maxMetricValue > 0 ? (entry.metrics[0].value / maxMetricValue) * 100 : 0;
            return (_jsxs("div", { className: `ranking-card ${posClass}`, children: [_jsx("div", { className: "ranking-badge", children: index + 1 }), _jsxs("div", { className: "ranking-content", children: [_jsxs("div", { className: "ranking-header", children: [_jsx("span", { className: "ranking-name", children: entry.attendant }), index === 0 ? _jsx("span", { className: "ranking-tag", children: topPerformerLabel }) : null] }), _jsx("div", { className: "ranking-metrics", children: entry.metrics.map((metric) => (_jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: metric.formatter ? metric.formatter(metric.value) : formatNumber(metric.value) }), _jsx("span", { children: metric.label })] }, `${entry.attendant}-${metric.label}`))) }), _jsx("div", { className: "ranking-bar-bg", children: _jsx("div", { className: "ranking-bar-fill", style: { width: `${pct}%` } }) })] })] }, entry.attendant));
        }) }));
}

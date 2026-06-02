import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useUiLanguage } from "../i18n";
import { formatCurrency, formatNumber, formatDate } from "../lib/format";
const ALWAYS_HIDDEN_ATTENDANTS = new Set(["iza"]);
const MONTHLY_HIDDEN_ATTENDANTS = new Set(["sem atendente"]);
function sortSalesPerformanceEntries(entries, rankingPeriod) {
    return [...entries].sort((left, right) => {
        if (rankingPeriod === "today") {
            return (right.totalItems - left.totalItems ||
                right.totalOrders - left.totalOrders ||
                right.totalRevenue - left.totalRevenue ||
                left.attendant.localeCompare(right.attendant, "pt-BR"));
        }
        return (right.totalOrders - left.totalOrders ||
            right.totalRevenue - left.totalRevenue ||
            right.totalItems - left.totalItems ||
            left.attendant.localeCompare(right.attendant, "pt-BR"));
    });
}
export function SalesPerformancePanel({ salesPerformance, reactivationLeaderboard, newCustomerLeaderboard, prospectingLeaderboard, isLoading, rankingPeriod = "month", onResetRanking, }) {
    const { tx } = useUiLanguage();
    const [activeTab, setActiveTab] = useState("sales");
    const isToday = rankingPeriod === "today";
    const orderedSalesPerformance = sortSalesPerformanceEntries(salesPerformance, rankingPeriod);
    const hiddenAttendants = isToday
        ? ALWAYS_HIDDEN_ATTENDANTS
        : new Set([...ALWAYS_HIDDEN_ATTENDANTS, ...MONTHLY_HIDDEN_ATTENDANTS]);
    const rankingViews = {
        sales: {
            label: tx("Vendas", "Sales"),
            description: isToday
                ? tx("Peças vendidas hoje por vendedora, com conferência direta do total diário.", "Items sold today by each seller, aligned with the daily total.")
                : tx("Desempenho corporativo com base nas vendas do periodo.", "Team performance based on sales in the selected period."),
            emptyMessage: isToday
                ? tx("Nenhuma peça registrada hoje.", "No items registered today.")
                : tx("Nenhuma venda registrada neste mes.", "No sales registered this month."),
            entries: orderedSalesPerformance.map((entry) => ({
                attendant: entry.attendant,
                metrics: isToday
                    ? [
                        { value: entry.totalItems, label: tx("pecas", "items") },
                        { value: entry.totalOrders, label: tx("vendas", "sales") },
                        { value: entry.uniqueCustomers, label: tx("clientes", "customers") },
                    ]
                    : [
                        { value: entry.totalOrders, label: tx("vendas", "sales") },
                        { value: entry.totalItems, label: tx("pecas", "items") },
                        { value: entry.uniqueCustomers, label: tx("clientes", "customers") },
                    ],
            })),
        },
        reactivation: {
            label: tx("Reativacao", "Reactivation"),
            description: tx("Veja quem mais recuperou clientes inativos no mes atual.", "See who recovered the most inactive customers this month."),
            emptyMessage: tx("Nenhuma reativacao registrada neste mes.", "No reactivations registered this month."),
            entries: [...reactivationLeaderboard]
                .sort((a, b) => b.recoveredRevenue - a.recoveredRevenue)
                .map((entry) => ({
                attendant: entry.attendant,
                metrics: [
                    { value: entry.recoveredRevenue, label: tx("faturamento", "revenue"), formatter: formatCurrency },
                    { value: entry.recoveredCustomers, label: tx("clientes reativados", "reactivated customers") },
                    { value: entry.recoveredItems, label: tx("pecas", "items") },
                ],
                recoveredClients: entry.recoveredClients
                    ? [...entry.recoveredClients].sort((a, b) => {
                        const strA = a.reactivationOrderDate || "";
                        const strB = b.reactivationOrderDate || "";
                        return strB.localeCompare(strA);
                    })
                    : undefined,
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
                newCustomerDetails: entry.customers
                    ? [...entry.customers].sort((a, b) => {
                        const dA = a.firstOrderDate || "";
                        const dB = b.firstOrderDate || "";
                        return dB.localeCompare(dA);
                    })
                    : undefined,
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
    const filteredEntries = currentView.entries.filter((entry) => !hiddenAttendants.has(entry.attendant.toLowerCase()));
    if (isLoading) {
        return (_jsxs("article", { className: "panel insight-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: isToday ? tx("Peças de hoje", "Today's items") : tx("Performance do mes", "Month performance") }), _jsx("h3", { children: isToday ? tx("Ranking de Peças de Hoje", "Today's items ranking") : tx("Ranking Mensal", "Monthly ranking") })] }) }), _jsx("div", { className: "page-loading", children: tx("Carregando performance...", "Loading performance...") })] }));
    }
    return (_jsxs("article", { className: "panel insight-panel", children: [_jsxs("div", { className: "panel-header", style: { alignItems: 'center' }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.8rem' }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: isToday ? tx("Peças de hoje", "Today's items") : tx("Performance do mes", "Month performance") }), _jsx("h3", { children: isToday ? tx("Ranking de Peças de Hoje", "Today's items ranking") : tx("Ranking Mensal", "Monthly ranking") })] }), isToday && onResetRanking && (_jsx("button", { onClick: onResetRanking, className: "reset-filter-pill", title: tx("Voltar para ranking mensal", "Back to monthly ranking"), children: tx("Voltar para Mensal", "Back to Monthly") }))] }), _jsx("p", { className: "panel-subcopy", style: { marginTop: '0.4rem' }, children: currentView.description })] }), _jsx("div", { className: "ranking-tabs-container", children: _jsx("div", { className: "ranking-tabs", role: "tablist", "aria-label": tx("Abas do ranking mensal", "Monthly ranking tabs"), children: Object.entries(rankingViews).map(([key, view]) => (_jsx("button", { type: "button", role: "tab", "aria-selected": activeTab === key, className: `ranking-tab ${activeTab === key ? "active" : ""}`, onClick: () => setActiveTab(key), children: view.label }, key))) }) })] }), !filteredEntries.length ? (_jsx("div", { className: "empty-state", children: currentView.emptyMessage })) : (_jsx(RankingList, { entries: filteredEntries, topPerformerLabel: tx("Top Performer", "Top performer") }))] }));
}
function RankingList({ entries, topPerformerLabel, }) {
    const { tx } = useUiLanguage();
    const [expandedAttendant, setExpandedAttendant] = useState(null);
    const maxMetricValue = Math.max(...entries.map((entry) => entry.metrics[0].value));
    return (_jsx("div", { className: "ranking-balanced-list", children: entries.map((entry, index) => {
            const isTop3 = index < 3;
            const posClass = isTop3 ? `pos-${index + 1}` : "";
            const pct = maxMetricValue > 0 ? (entry.metrics[0].value / maxMetricValue) * 100 : 0;
            const hasClients = (entry.recoveredClients && entry.recoveredClients.length > 0) || (entry.newCustomerDetails && entry.newCustomerDetails.length > 0);
            const isExpanded = expandedAttendant === entry.attendant;
            return (_jsxs("div", { className: `ranking-card ${posClass}`, onClick: hasClients ? () => setExpandedAttendant(isExpanded ? null : entry.attendant) : undefined, style: {
                    cursor: hasClients ? "pointer" : "default",
                    flexWrap: "wrap",
                }, children: [_jsx("div", { className: "ranking-badge", children: index + 1 }), _jsxs("div", { className: "ranking-content", children: [_jsxs("div", { className: "ranking-header", children: [_jsx("span", { className: "ranking-name", children: entry.attendant }), index === 0 ? _jsx("span", { className: "ranking-tag", children: topPerformerLabel }) : null] }), _jsx("div", { className: "ranking-metrics", children: entry.metrics.map((metric) => (_jsxs("div", { className: "ranking-metric", children: [_jsx("strong", { children: metric.formatter ? metric.formatter(metric.value) : formatNumber(metric.value) }), _jsx("span", { children: metric.label })] }, `${entry.attendant}-${metric.label}`))) }), _jsx("div", { className: "ranking-bar-bg", children: _jsx("div", { className: "ranking-bar-fill", style: { width: `${pct}%` } }) })] }), isExpanded && entry.recoveredClients && (_jsx("div", { style: {
                            marginTop: "0.75rem",
                            paddingTop: "1rem",
                            borderTop: "1px solid var(--line)",
                            flexBasis: "100%",
                            overflowX: "auto",
                            width: "100%",
                        }, onClick: (e) => e.stopPropagation(), children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: "1px solid var(--line)", textAlign: "left", background: "rgba(41, 86, 215, 0.02)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: [_jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600 }, children: tx("Cliente", "Customer") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "center" }, children: tx("Tempo Inativo", "Inactivity") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "center" }, children: tx("Data Compra", "Purchase Date") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }, children: tx("Valor", "Value") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, width: "50px" } })] }) }), _jsx("tbody", { children: entry.recoveredClients.map((client) => (_jsxs("tr", { style: { borderBottom: "1px solid var(--line)" }, children: [_jsx("td", { style: { padding: "0.75rem 0.75rem" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("strong", { style: { color: "var(--text)" }, children: client.displayName }), _jsx("span", { style: { fontSize: "0.7rem", color: "var(--muted)", fontFamily: "monospace", marginTop: "0.1rem" }, children: client.customerCode })] }) }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "center" }, children: _jsxs("span", { style: {
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        padding: "0.2rem 0.5rem",
                                                        background: client.daysInactiveBeforeReturn > 90 ? "rgba(217, 83, 79, 0.08)" : "rgba(41, 86, 215, 0.06)",
                                                        color: client.daysInactiveBeforeReturn > 90 ? "var(--danger)" : "var(--accent)",
                                                        borderRadius: "10px",
                                                        fontSize: "0.7rem",
                                                        fontWeight: 600
                                                    }, children: [client.daysInactiveBeforeReturn, " ", tx("dias", "days")] }) }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "center", color: "var(--text)", fontWeight: 500 }, children: client.reactivationOrderDate ? formatDate(client.reactivationOrderDate) : "--" }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "right", color: "var(--success)", fontWeight: 600 }, children: formatCurrency(client.reactivatedOrderAmount) }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "right" }, children: _jsxs(Link, { to: `/clientes/${client.customerId}`, style: {
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: "0.25rem",
                                                        fontSize: "0.7rem",
                                                        color: "var(--accent)",
                                                        textDecoration: "none",
                                                        fontWeight: 600,
                                                        padding: "0.3rem 0.5rem",
                                                        background: "rgba(41,86,215,0.06)",
                                                        borderRadius: "4px",
                                                        transition: "all 0.2s ease"
                                                    }, onMouseOver: (e) => {
                                                        e.currentTarget.style.background = "var(--accent)";
                                                        e.currentTarget.style.color = "#fff";
                                                    }, onMouseOut: (e) => {
                                                        e.currentTarget.style.background = "rgba(41,86,215,0.06)";
                                                        e.currentTarget.style.color = "var(--accent)";
                                                    }, children: [tx("Abrir", "Open"), " ", _jsx(ExternalLink, { size: 12 })] }) })] }, client.customerId))) })] }) })), isExpanded && entry.newCustomerDetails && (_jsx("div", { style: {
                            marginTop: "0.75rem",
                            paddingTop: "1rem",
                            borderTop: "1px solid var(--line)",
                            flexBasis: "100%",
                            overflowX: "auto",
                            width: "100%",
                        }, onClick: (e) => e.stopPropagation(), children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: "1px solid var(--line)", textAlign: "left", background: "rgba(41, 86, 215, 0.02)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: [_jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600 }, children: tx("Cliente", "Customer") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "center" }, children: tx("Data 1ª Compra", "First Purchase") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "center" }, children: tx("Peças", "Items") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }, children: tx("Valor", "Value") }), _jsx("th", { style: { padding: "0.6rem 0.75rem", fontWeight: 600, width: "50px" } })] }) }), _jsx("tbody", { children: entry.newCustomerDetails.map((client) => (_jsxs("tr", { style: { borderBottom: "1px solid var(--line)" }, children: [_jsx("td", { style: { padding: "0.75rem 0.75rem" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("strong", { style: { color: "var(--text)" }, children: client.displayName }), _jsx("span", { style: { fontSize: "0.7rem", color: "var(--muted)", fontFamily: "monospace", marginTop: "0.1rem" }, children: client.customerCode })] }) }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "center", color: "var(--text)", fontWeight: 500 }, children: client.firstOrderDate ? formatDate(client.firstOrderDate) : "--" }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "center", color: "var(--text)" }, children: client.firstItemCount }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "right", color: "var(--success)", fontWeight: 600 }, children: formatCurrency(client.firstOrderAmount) }), _jsx("td", { style: { padding: "0.75rem 0.75rem", textAlign: "right" }, children: _jsxs(Link, { to: `/clientes/${client.customerId}`, style: {
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: "0.25rem",
                                                        fontSize: "0.7rem",
                                                        color: "var(--accent)",
                                                        textDecoration: "none",
                                                        fontWeight: 600,
                                                        padding: "0.3rem 0.5rem",
                                                        background: "rgba(41,86,215,0.06)",
                                                        borderRadius: "4px",
                                                        transition: "all 0.2s ease"
                                                    }, onMouseOver: (e) => {
                                                        e.currentTarget.style.background = "var(--accent)";
                                                        e.currentTarget.style.color = "#fff";
                                                    }, onMouseOut: (e) => {
                                                        e.currentTarget.style.background = "rgba(41,86,215,0.06)";
                                                        e.currentTarget.style.color = "var(--accent)";
                                                    }, children: [tx("Abrir", "Open"), " ", _jsx(ExternalLink, { size: 12 })] }) })] }, client.customerId))) })] }) }))] }, entry.attendant));
        }) }));
}

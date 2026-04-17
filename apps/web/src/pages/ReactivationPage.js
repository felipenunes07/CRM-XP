import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, LineChart, Line } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { Calendar, UserCheck, TrendingUp, Users, ExternalLink, Award, Medal, Camera, ShoppingBag, History } from "lucide-react";
import { useState, Fragment } from "react";
export function ReactivationPage() {
    const { token } = useAuth();
    const [isCompactMode, setIsCompactMode] = useState(false);
    const [activeTab, setActiveTab] = useState("current");
    const [expandedHistory, setExpandedHistory] = useState({});
    const dashboardQuery = useQuery({
        queryKey: ["reactivation-dashboard"],
        queryFn: () => api.dashboard(token),
        enabled: Boolean(token),
    });
    if (dashboardQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando ranking de reativacao..." });
    }
    if (dashboardQuery.isError || !dashboardQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar o ranking de reativacao." });
    }
    const leaderboard = [...dashboardQuery.data.reactivationLeaderboard].sort((a, b) => b.recoveredRevenue - a.recoveredRevenue);
    const totalRecoveredCustomers = leaderboard.reduce((sum, entry) => sum + entry.recoveredCustomers, 0);
    const totalRecoveredRevenue = leaderboard.reduce((sum, entry) => sum + entry.recoveredRevenue, 0);
    const totalRecoveredItems = leaderboard.reduce((sum, entry) => sum + Math.max(0, entry.recoveredItems || 0), 0);
    const monthLabel = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
    }).format(new Date());
    const historyByMonth = dashboardQuery.data.reactivationHistory?.reduce((acc, entry) => {
        if (!acc[entry.month])
            acc[entry.month] = [];
        acc[entry.month].push(entry);
        return acc;
    }, {}) || {};
    const formatMonthKey = (dateStr) => {
        try {
            const monthStr = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(dateStr));
            return monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
        }
        catch {
            return dateStr;
        }
    };
    const chartData = Object.entries(historyByMonth)
        .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
        .map(([month, entries]) => {
        const totalRevenue = entries.reduce((sum, e) => sum + e.recoveredRevenue, 0);
        const totalCustomers = entries.reduce((sum, e) => sum + e.recoveredCustomers, 0);
        const totalItems = entries.reduce((sum, e) => sum + e.recoveredItems, 0);
        return {
            monthKey: formatMonthKey(month),
            Faturamento: totalRevenue,
            Clientes: totalCustomers,
            Peças: totalItems,
        };
    });
    const specificAttendants = ["Amanda", "Suelen", "Thais", "Tamires"].map(name => name.toLowerCase());
    const uniqueAttendants = Array.from(new Set(Object.values(historyByMonth).flat().map(e => e.attendant)))
        .filter(att => specificAttendants.some(target => att.toLowerCase().includes(target)));
    const attendantLineChartData = Object.entries(historyByMonth)
        .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
        .map(([month, entries]) => {
        const dataPoint = {
            monthKey: formatMonthKey(month)
        };
        uniqueAttendants.forEach(att => {
            dataPoint[att] = 0;
        });
        entries.forEach(e => {
            dataPoint[e.attendant] += e.recoveredCustomers;
        });
        return dataPoint;
    });
    const chartColors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#6366f1", "#f43f5e", "#d946ef", "#0ea5e9", "#84cc16"];
    const getRankColor = (index) => {
        if (index === 0)
            return "var(--warning)"; // Ouro
        if (index === 1)
            return "var(--muted)"; // Prata
        if (index === 2)
            return "#cd7f32"; // Bronze
        return "transparent";
    };
    const getRankBg = (index) => {
        if (index === 0)
            return "var(--warning)";
        if (index === 1)
            return "var(--muted)";
        if (index === 2)
            return "#cd7f32";
        return "var(--bg-soft)";
    };
    const getRankText = (index) => {
        if (index <= 2)
            return "#ffffff";
        return "var(--text)";
    };
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "0.5rem" }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: "0.2rem" }, children: "Ranking de Reativa\u00E7\u00E3o" }), _jsx("h2", { style: { margin: 0, fontSize: "1.5rem" }, children: "Recuperadoras de Ouro" })] }), _jsxs("button", { onClick: () => setIsCompactMode(!isCompactMode), style: {
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            background: isCompactMode ? "var(--accent)" : "rgba(41,86,215,0.06)",
                            color: isCompactMode ? "#fff" : "var(--accent)",
                            border: "1px solid " + (isCompactMode ? "var(--accent)" : "rgba(41,86,215,0.15)"),
                            padding: "0.5rem 1rem",
                            borderRadius: "8px",
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            cursor: "pointer",
                            transition: "all 0.2s"
                        }, children: [_jsx(Camera, { size: 16 }), isCompactMode ? "Expandir Detalhes" : "Versão Print (Compactar)"] })] }), _jsxs("div", { style: { display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--line)" }, children: [_jsxs("button", { onClick: () => setActiveTab("current"), style: {
                            padding: "0.75rem 1.5rem",
                            background: "transparent",
                            color: activeTab === "current" ? "var(--accent)" : "var(--muted)",
                            border: "none",
                            borderBottom: activeTab === "current" ? "2px solid var(--accent)" : "2px solid transparent",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }, children: [_jsx(Award, { size: 18 }), "Desempenho M\u00EAs Atual"] }), _jsxs("button", { onClick: () => setActiveTab("history"), style: {
                            padding: "0.75rem 1.5rem",
                            background: "transparent",
                            color: activeTab === "history" ? "var(--accent)" : "var(--muted)",
                            border: "none",
                            borderBottom: activeTab === "history" ? "2px solid var(--accent)" : "2px solid transparent",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }, children: [_jsx(History, { size: 18 }), "Hist\u00F3rico (M\u00EAs a M\u00EAs)"] }), _jsxs("button", { onClick: () => setActiveTab("charts"), style: {
                            padding: "0.75rem 1.5rem",
                            background: "transparent",
                            color: activeTab === "charts" ? "var(--accent)" : "var(--muted)",
                            border: "none",
                            borderBottom: activeTab === "charts" ? "2px solid var(--accent)" : "2px solid transparent",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }, children: [_jsx(TrendingUp, { size: 18 }), "Gr\u00E1ficos"] })] }), activeTab === "current" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stats-grid", style: { display: isCompactMode ? "none" : "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", paddingBottom: "1rem" }, children: [_jsxs("div", { className: "stat-card", style: { background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "M\u00EAs analisado" }), _jsx("div", { style: { background: "rgba(110, 127, 159, 0.1)", padding: "0.35rem", borderRadius: "8px" }, children: _jsx(Calendar, { size: 16, color: "var(--muted)" }) })] }), _jsxs("div", { style: { marginTop: "0.25rem" }, children: [_jsx("strong", { style: { display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }, children: monthLabel }), _jsx("p", { style: { margin: 0, fontSize: "0.7rem", color: "var(--muted)" }, children: "Per\u00EDodo do placar consolidado" })] })] }), _jsxs("div", { className: "stat-card", style: { background: "rgba(47, 157, 103, 0.04)", border: "1px solid rgba(47, 157, 103, 0.2)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem", position: "relative", overflow: "hidden" }, children: [_jsx("div", { style: { position: "absolute", top: 0, left: 0, width: "100%", height: "3px", background: "var(--success)" } }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Recuperados" }), _jsx("div", { style: { background: "rgba(47, 157, 103, 0.15)", padding: "0.35rem", borderRadius: "8px" }, children: _jsx(UserCheck, { size: 16, color: "var(--success)" }) })] }), _jsxs("div", { style: { marginTop: "0.25rem" }, children: [_jsx("strong", { style: { display: "block", fontSize: "1.5rem", color: "var(--success)", lineHeight: "1.1", marginBottom: "0.2rem" }, children: formatNumber(totalRecoveredCustomers) }), _jsx("p", { style: { margin: 0, fontSize: "0.7rem", color: "var(--success)", fontWeight: 500, opacity: 0.85, lineHeight: "1.2" }, children: "Inativos +90 dias" })] })] }), _jsxs("div", { className: "stat-card", style: { background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Faturamento" }), _jsx("div", { style: { background: "rgba(41, 86, 215, 0.08)", padding: "0.35rem", borderRadius: "8px" }, children: _jsx(TrendingUp, { size: 16, color: "var(--accent)" }) })] }), _jsxs("div", { style: { marginTop: "0.25rem" }, children: [_jsx("strong", { style: { display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }, children: formatCurrency(totalRecoveredRevenue) }), _jsx("p", { style: { margin: 0, fontSize: "0.7rem", color: "var(--muted)" }, children: "Retornado ao caixa" })] })] }), _jsxs("div", { className: "stat-card", style: { background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Pe\u00E7as Vendidas" }), _jsx("div", { style: { background: "rgba(110, 127, 159, 0.1)", padding: "0.35rem", borderRadius: "8px" }, children: _jsx(ShoppingBag, { size: 16, color: "var(--muted)" }) })] }), _jsxs("div", { style: { marginTop: "0.25rem" }, children: [_jsx("strong", { style: { display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }, children: formatNumber(totalRecoveredItems) }), _jsx("p", { style: { margin: 0, fontSize: "0.7rem", color: "var(--muted)" }, children: "Total em produtos" })] })] }), _jsxs("div", { className: "stat-card", style: { background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Equipe Ativa" }), _jsx("div", { style: { background: "rgba(110, 127, 159, 0.1)", padding: "0.35rem", borderRadius: "8px" }, children: _jsx(Users, { size: 16, color: "var(--muted)" }) })] }), _jsxs("div", { style: { marginTop: "0.25rem" }, children: [_jsx("strong", { style: { display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }, children: formatNumber(leaderboard.length) }), _jsx("p", { style: { margin: 0, fontSize: "0.7rem", color: "var(--muted)" }, children: "Com reativa\u00E7\u00E3o no m\u00EAs" })] })] })] }), _jsxs("section", { className: "panel", style: { padding: "0", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [_jsx("div", { className: "panel-header", style: { padding: "1.5rem 1.5rem 1.25rem", borderBottom: "1px solid var(--line)", background: "transparent" }, children: _jsxs("div", { children: [_jsx("h3", { style: { fontSize: "1.2rem", margin: 0 }, children: "Placar Consolidado" }), _jsx("p", { className: "panel-subcopy", style: { marginTop: "0.3rem" }, children: "Detalhamento da convers\u00E3o por consultor e seus respectivos clientes reativados." })] }) }), leaderboard.length ? (_jsx("div", { className: "leaderboard-list", style: { padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", background: "var(--bg-soft)" }, children: leaderboard.map((entry, index) => (_jsxs("article", { className: "leaderboard-card", style: { background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: index === 0 ? "0 4px 20px rgba(208, 154, 41, 0.15)" : "0 4px 15px rgba(0,0,0,0.03)", border: index === 0 ? "2px solid rgba(208, 154, 41, 0.4)" : "1px solid var(--line)" }, children: [_jsxs("div", { style: {
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                padding: isCompactMode ? "0.75rem 1.5rem" : "1.25rem 1.5rem",
                                                background: index === 0 ? "linear-gradient(to right, rgba(208, 154, 41, 0.08), transparent)" : index === 1 ? "linear-gradient(to right, rgba(110, 127, 159, 0.06), transparent)" : index === 2 ? "linear-gradient(to right, rgba(205, 127, 50, 0.06), transparent)" : "transparent",
                                                borderBottom: isCompactMode ? "none" : "1px solid var(--line)"
                                            }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1.25rem" }, children: [_jsx("div", { style: {
                                                                background: getRankBg(index),
                                                                color: getRankText(index),
                                                                width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontWeight: "bold", fontSize: "1rem",
                                                                boxShadow: index <= 2 ? "0 4px 10px rgba(0,0,0,0.1)" : "none"
                                                            }, children: index === 0 ? _jsx(Award, { size: 20 }) : index === 1 ? _jsx(Medal, { size: 20 }) : index === 2 ? _jsx(Medal, { size: 20 }) : `${index + 1}º` }), _jsxs("div", { children: [_jsx("strong", { style: { color: index === 0 ? "var(--warning)" : "var(--text)", fontSize: "1.1rem" }, children: entry.attendant }), _jsxs("span", { style: { display: "block", fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }, children: [_jsx("strong", { style: { color: "var(--text)" }, children: formatNumber(entry.recoveredCustomers) }), " clientes recuperados"] })] })] }), _jsxs("div", { style: { textAlign: "right" }, children: [_jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }, children: "Faturamento Gerado" }), _jsx("strong", { style: { display: "block", color: "var(--success)", fontSize: "1.25rem", marginTop: "0.2rem" }, children: formatCurrency(entry.recoveredRevenue) })] })] }), !isCompactMode && (_jsx("div", { style: { padding: "0" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", tableLayout: "fixed" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: "rgba(0,0,0,0.015)", borderBottom: "1px solid var(--line)" }, children: [_jsx("th", { style: { width: "45%", textAlign: "left", padding: "0.85rem 1.5rem", fontWeight: 600, color: "var(--muted)" }, children: "Cliente Reativado" }), _jsx("th", { style: { width: "20%", textAlign: "center", padding: "0.85rem 1.5rem", fontWeight: 600, color: "var(--muted)" }, children: "Per\u00EDodo Inativo" }), _jsx("th", { style: { width: "25%", textAlign: "right", padding: "0.85rem 1.5rem", fontWeight: 600, color: "var(--muted)" }, children: "Pedido de Retorno" }), _jsx("th", { style: { width: "10%", minWidth: "90px", padding: "0.85rem 1.5rem", textAlign: "right" } })] }) }), _jsx("tbody", { children: entry.recoveredClients.map((client, cIdx) => (_jsxs("tr", { style: { borderBottom: cIdx === entry.recoveredClients.length - 1 ? "none" : "1px solid var(--line)" }, children: [_jsx("td", { style: { padding: "1rem 1.5rem", overflow: "hidden", textOverflow: "ellipsis" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [_jsx("strong", { style: { color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: client.displayName }), _jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted)", fontFamily: "monospace", marginTop: "0.2rem" }, children: client.customerCode || "Sem código" })] }) }), _jsx("td", { style: { textAlign: "center", padding: "1rem 1.5rem" }, children: _jsxs("span", { style: { display: "inline-flex", alignItems: "center", padding: "0.25rem 0.75rem", background: client.daysInactiveBeforeReturn > 90 ? "rgba(217, 83, 79, 0.08)" : "rgba(41, 86, 215, 0.06)", color: client.daysInactiveBeforeReturn > 90 ? "var(--danger)" : "var(--accent)", borderRadius: "14px", fontSize: "0.75rem", fontWeight: 600 }, children: [formatNumber(client.daysInactiveBeforeReturn), " dias"] }) }), _jsx("td", { style: { textAlign: "right", padding: "1rem 1.5rem", fontWeight: 600, color: "var(--success)", whiteSpace: "nowrap", fontSize: "0.9rem" }, children: formatCurrency(client.reactivatedOrderAmount) }), _jsx("td", { style: { textAlign: "right", padding: "1rem 1.5rem" }, children: _jsxs(Link, { to: `/clientes/${client.customerId}`, style: {
                                                                            display: "inline-flex",
                                                                            alignItems: "center",
                                                                            gap: "0.35rem",
                                                                            fontSize: "0.75rem",
                                                                            color: "var(--accent)",
                                                                            textDecoration: "none",
                                                                            fontWeight: 500,
                                                                            padding: "0.4rem 0.75rem",
                                                                            background: "rgba(41,86,215,0.06)",
                                                                            borderRadius: "6px",
                                                                            transition: "all 0.2s ease"
                                                                        }, onMouseOver: (e) => {
                                                                            e.currentTarget.style.background = "var(--accent)";
                                                                            e.currentTarget.style.color = "#fff";
                                                                        }, onMouseOut: (e) => {
                                                                            e.currentTarget.style.background = "rgba(41,86,215,0.06)";
                                                                            e.currentTarget.style.color = "var(--accent)";
                                                                        }, children: ["Abrir ", _jsx(ExternalLink, { size: 14 })] }) })] }, `${entry.attendant}-${client.customerId}`))) })] }) }))] }, `${entry.attendant}-${index}`))) })) : (_jsx("div", { className: "empty-state", style: { padding: "3rem" }, children: "Ainda n\u00E3o houve reativa\u00E7\u00E3o registrada neste m\u00EAs." }))] })] })), activeTab === "history" && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "2rem" }, children: Object.entries(historyByMonth).length === 0 ? (_jsx("div", { className: "empty-state", style: { padding: "3rem" }, children: "Ainda n\u00E3o h\u00E1 dados hist\u00F3ricos de reativa\u00E7\u00E3o dispon\u00EDveis." })) : (Object.entries(historyByMonth).map(([month, entries]) => (_jsxs("section", { className: "panel", style: { padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }, children: [_jsx("div", { className: "panel-header", style: { padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }, children: _jsxs("h3", { style: { fontSize: "1.2rem", margin: 0, textTransform: "capitalize", color: "var(--accent)" }, children: [_jsx(Calendar, { size: 18, style: { display: "inline", marginBottom: "-3px", marginRight: "6px" } }), formatMonthKey(month)] }) }), _jsx("div", { children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: "1px solid var(--line)", textAlign: "left", background: "var(--bg-soft)", color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }, children: [_jsx("th", { style: { padding: "1rem 1.5rem", fontWeight: 600, width: "100px" }, children: "Posi\u00E7\u00E3o" }), _jsx("th", { style: { padding: "1rem 1.5rem", fontWeight: 600 }, children: "Consultora" }), _jsx("th", { style: { padding: "1rem 1.5rem", fontWeight: 600, textAlign: "center" }, children: "Recuperados" }), _jsx("th", { style: { padding: "1rem 1.5rem", fontWeight: 600, textAlign: "center" }, children: "Pe\u00E7as" }), _jsx("th", { style: { padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }, children: "Faturamento" })] }) }), _jsx("tbody", { children: entries.map((entry, idx) => {
                                            const rowKey = `${month}-${entry.attendant}`;
                                            const isExpanded = !!expandedHistory[rowKey];
                                            return (_jsxs(Fragment, { children: [_jsxs("tr", { onClick: () => setExpandedHistory(prev => ({ ...prev, [rowKey]: !isExpanded })), style: { borderBottom: isExpanded ? "none" : "1px solid var(--line)", cursor: "pointer", background: isExpanded ? "rgba(41,86,215,0.02)" : "transparent", transition: "all 0.2s" }, children: [_jsx("td", { style: { padding: "1rem 1.5rem" }, children: _jsx("div", { style: {
                                                                        background: getRankBg(idx),
                                                                        color: getRankText(idx),
                                                                        width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontWeight: "bold", fontSize: "0.85rem",
                                                                        boxShadow: idx <= 2 ? "0 4px 10px rgba(0,0,0,0.1)" : "none"
                                                                    }, children: idx === 0 ? _jsx(Award, { size: 16 }) : idx <= 2 ? _jsx(Medal, { size: 16 }) : `${idx + 1}º` }) }), _jsx("td", { style: { padding: "1rem 1.5rem", fontWeight: 600, color: idx === 0 ? "var(--warning)" : "var(--text)", fontSize: "1.05rem" }, children: entry.attendant }), _jsx("td", { style: { padding: "1rem 1.5rem", textAlign: "center", color: "var(--success)", fontWeight: 600 }, children: formatNumber(entry.recoveredCustomers) }), _jsx("td", { style: { padding: "1rem 1.5rem", textAlign: "center", color: "var(--text)" }, children: formatNumber(entry.recoveredItems) }), _jsx("td", { style: { padding: "1rem 1.5rem", textAlign: "right", color: "var(--success)", fontWeight: 700, fontSize: "1.1rem" }, children: formatCurrency(entry.recoveredRevenue) })] }), isExpanded && entry.recoveredClients && (_jsx("tr", { style: { borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }, children: _jsx("td", { colSpan: 5, style: { padding: "0 1.5rem 1.5rem 1.5rem" }, children: _jsx("div", { style: { background: "#fff", borderRadius: "8px", border: "1px solid var(--line)", overflow: "hidden" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: "rgba(41,86,215,0.04)", fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }, children: [_jsx("th", { style: { padding: "0.75rem 1.25rem", textAlign: "left", fontWeight: 600 }, children: "Cliente" }), _jsx("th", { style: { padding: "0.75rem 1.25rem", textAlign: "center", fontWeight: 600 }, children: "Tempo Inativo" }), _jsx("th", { style: { padding: "0.75rem 1.25rem", textAlign: "center", fontWeight: 600 }, children: "Pe\u00E7as" }), _jsx("th", { style: { padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 600 }, children: "Faturado" }), _jsx("th", { style: { padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 600 } })] }) }), _jsx("tbody", { children: entry.recoveredClients.map((client) => (_jsxs("tr", { style: { borderBottom: "1px solid var(--line)" }, children: [_jsxs("td", { style: { padding: "0.75rem 1.25rem" }, children: [_jsx("strong", { style: { display: "block", color: "var(--text)", fontSize: "0.9rem" }, children: client.displayName }), _jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted)" }, children: client.customerCode })] }), _jsxs("td", { style: { textAlign: "center", padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: "var(--muted)" }, children: [client.daysInactiveBeforeReturn, " dias"] }), _jsx("td", { style: { textAlign: "center", padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: "var(--text)" }, children: client.reactivatedItems || 0 }), _jsx("td", { style: { textAlign: "right", padding: "0.75rem 1.25rem", color: "var(--success)", fontWeight: 600, fontSize: "0.9rem" }, children: formatCurrency(client.reactivatedOrderAmount) }), _jsx("td", { style: { textAlign: "right", padding: "0.75rem 1.25rem" }, children: _jsxs(Link, { to: `/clientes/${client.customerId}`, onClick: (e) => e.stopPropagation(), style: {
                                                                                                display: "inline-flex",
                                                                                                alignItems: "center",
                                                                                                gap: "0.35rem",
                                                                                                fontSize: "0.7rem",
                                                                                                color: "var(--accent)",
                                                                                                textDecoration: "none",
                                                                                                fontWeight: 500,
                                                                                                padding: "0.3rem 0.6rem",
                                                                                                background: "rgba(41,86,215,0.06)",
                                                                                                borderRadius: "6px",
                                                                                                transition: "all 0.2s ease"
                                                                                            }, children: ["Abrir ", _jsx(ExternalLink, { size: 12 })] }) })] }, client.customerId))) })] }) }) }) }))] }, entry.attendant));
                                        }) })] }) })] }, month)))) })), activeTab === "charts" && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "2rem" }, children: [_jsxs("section", { className: "panel", style: { padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }, children: [_jsx("div", { className: "panel-header", style: { padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }, children: _jsx("h3", { style: { fontSize: "1.2rem", margin: 0, color: "var(--text)" }, children: "Evolu\u00E7\u00E3o do Faturamento de Reativa\u00E7\u00E3o" }) }), _jsx("div", { style: { height: 350, width: "100%", padding: "1.5rem" }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(AreaChart, { data: chartData, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "colorFaturamento", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "var(--success)", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "var(--success)", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "var(--line)" }), _jsx(XAxis, { dataKey: "monthKey", axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" } }), _jsx(YAxis, { axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" }, tickFormatter: (value) => `R$ ${(value / 1000)}k` }), _jsx(Tooltip, { formatter: (value) => formatCurrency(value), labelStyle: { color: "var(--text)", fontWeight: 600, marginBottom: "0.5rem" }, contentStyle: { borderRadius: '8px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '1rem' } }), _jsx(Legend, { iconType: "circle", wrapperStyle: { paddingTop: "20px" } }), _jsx(Area, { type: "monotone", name: "Faturamento (R$)", dataKey: "Faturamento", stroke: "var(--success)", strokeWidth: 3, fillOpacity: 1, fill: "url(#colorFaturamento)" })] }) }) })] }), _jsxs("section", { className: "panel", style: { padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }, children: [_jsx("div", { className: "panel-header", style: { padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }, children: _jsx("h3", { style: { fontSize: "1.2rem", margin: 0, color: "var(--text)" }, children: "Volume de Convers\u00E3o: Clientes vs Pe\u00E7as" }) }), _jsx("div", { style: { height: 350, width: "100%", padding: "1.5rem" }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: chartData, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "var(--line)" }), _jsx(XAxis, { dataKey: "monthKey", axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" } }), _jsx(YAxis, { yAxisId: "left", axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" } }), _jsx(YAxis, { yAxisId: "right", orientation: "right", axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" } }), _jsx(Tooltip, { labelStyle: { color: "var(--text)", fontWeight: 600, marginBottom: "0.5rem" }, contentStyle: { borderRadius: '8px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '1rem' } }), _jsx(Legend, { iconType: "circle", wrapperStyle: { paddingTop: "20px" } }), _jsx(Bar, { yAxisId: "left", dataKey: "Clientes", name: "Clientes Recuperados", fill: "var(--accent)", radius: [4, 4, 0, 0], maxBarSize: 50 }), _jsx(Bar, { yAxisId: "right", dataKey: "Pe\u00E7as", name: "Pe\u00E7as Vendidas", fill: "#d09a29", radius: [4, 4, 0, 0], maxBarSize: 50 })] }) }) })] }), _jsxs("section", { className: "panel", style: { padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }, children: [_jsx("div", { className: "panel-header", style: { padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }, children: _jsx("h3", { style: { fontSize: "1.2rem", margin: 0, color: "var(--text)" }, children: "Evolu\u00E7\u00E3o de Clientes Recuperados por Consultora" }) }), _jsx("div", { style: { height: 350, width: "100%", padding: "1.5rem" }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(LineChart, { data: attendantLineChartData, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "var(--line)" }), _jsx(XAxis, { dataKey: "monthKey", axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" } }), _jsx(YAxis, { axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--muted)" } }), _jsx(Tooltip, { labelStyle: { color: "var(--text)", fontWeight: 600, marginBottom: "0.5rem" }, contentStyle: { borderRadius: '8px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '1rem' } }), _jsx(Legend, { iconType: "circle", wrapperStyle: { paddingTop: "20px" } }), uniqueAttendants.map((attendant, index) => (_jsx(Line, { type: "monotone", dataKey: attendant, name: attendant, stroke: chartColors[index % chartColors.length], strokeWidth: 3, activeDot: { r: 6 }, dot: { r: 3, strokeWidth: 2 } }, attendant)))] }) }) })] })] }))] }));
}

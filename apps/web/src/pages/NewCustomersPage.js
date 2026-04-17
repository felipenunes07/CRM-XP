import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, Fragment } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, formatShortDate } from "../lib/format";
const styles = `
  .premium-header-title {
    margin: 0;
    font-size: 2.25rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, #0f172a 0%, #3b82f6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .premium-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
  }
  .premium-card {
    background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid rgba(226, 232, 240, 0.8);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
    border-radius: 20px;
    padding: 1.25rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    min-height: 140px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .premium-card::after {
    content: '';
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(0,0,0,0) 50%);
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 20px;
    pointer-events: none;
  }
  .premium-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 25px -5px rgba(41, 86, 215, 0.12), 0 8px 10px -6px rgba(41, 86, 215, 0.04);
    border-color: rgba(41, 86, 215, 0.3);
  }
  .premium-card:hover::after {
    opacity: 1;
  }
  .metric-value {
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: #0f172a;
    margin: 0.4rem 0;
    white-space: nowrap;
  }
  .metric-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .metric-helper {
    font-size: 0.825rem;
    color: #94a3b8;
    margin: 0;
    margin-top: 0.35rem;
  }
  .trend-up {
    color: #10b981;
    background: #ecfdf5;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  .trend-down {
    color: #ef4444;
    background: #fef2f2;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }
  .premium-panel {
    background: #ffffff;
    border-radius: 24px;
    border: 1px solid rgba(226, 232, 240, 0.8);
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 10px 15px -3px rgba(0, 0, 0, 0.01);
    padding: 1.75rem;
    transition: box-shadow 0.3s ease;
  }
  .premium-panel:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 20px 25px -5px rgba(0, 0, 0, 0.04);
  }
  .customer-row {
    transition: all 0.2s ease;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: rgba(249, 251, 255, 0.5);
  }
  .customer-row:hover {
    background: #ffffff;
    transform: translateX(4px);
    border-color: rgba(41, 86, 215, 0.3);
    box-shadow: 0 4px 12px -2px rgba(41, 86, 215, 0.08);
  }
  .premium-btn {
    font-size: 0.8rem;
    color: var(--accent);
    text-decoration: none;
    font-weight: 700;
    padding: 0.5rem 1rem;
    border: 1px solid rgba(41,86,215,0.2);
    border-radius: 999px;
    white-space: nowrap;
    transition: all 0.2s;
    background: rgba(41,86,215,0.02);
  }
  .premium-btn:hover {
    background: var(--accent);
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(41,86,215,0.3);
  }
`;
function formatMonthLabel(value) {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    const year = match?.[1];
    const month = match?.[2];
    if (!year || !month) {
        return value;
    }
    return `${month}/${year.slice(2)}`;
}
function buildMonthlyTicks(months) {
    if (months.length <= 8) {
        return months.map((entry) => entry.month);
    }
    const step = Math.ceil(months.length / 8);
    const ticks = months.filter((_, index) => index % step === 0).map((entry) => entry.month);
    const lastMonth = months.at(-1)?.month;
    if (lastMonth && ticks.at(-1) !== lastMonth) {
        ticks.push(lastMonth);
    }
    return ticks;
}
function formatCac(value) {
    return value === null ? "Sem base" : formatCurrency(value);
}
function DailyTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip", style: { backdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(41, 86, 215, 0.2)", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }, children: [_jsx("strong", { style: { color: "#0f172a" }, children: formatDate(label) }), _jsxs("div", { className: "chart-tooltip-count", style: { marginTop: "0.5rem" }, children: [_jsx("strong", { style: { color: "#2956d7", fontSize: "1.2rem" }, children: formatNumber(payload[0]?.value ?? 0) }), _jsx("span", { style: { color: "#64748b" }, children: "clientes na primeira compra" })] })] }));
}
function MonthlyTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    const newCustomers = payload.find((entry) => entry.dataKey === "newCustomers")?.value ?? 0;
    const spend = payload.find((entry) => entry.dataKey === "spend")?.value ?? 0;
    return (_jsxs("div", { className: "chart-tooltip", style: { backdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(41, 86, 215, 0.2)", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }, children: [_jsx("strong", { style: { color: "#0f172a" }, children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", style: { marginTop: "0.5rem" }, children: [_jsx("strong", { style: { color: "#2f9d67", fontSize: "1.1rem" }, children: formatNumber(newCustomers) }), _jsx("span", { style: { color: "#64748b" }, children: "clientes novos no mes" })] }), _jsxs("div", { className: "chart-tooltip-count", style: { marginTop: "0.35rem" }, children: [_jsx("strong", { style: { color: "#2956d7", fontSize: "1.1rem" }, children: formatCurrency(spend) }), _jsx("span", { style: { color: "#64748b" }, children: "gasto em anuncios" })] })] }));
}
function HistoryTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    // Sort payload by value DESC
    const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
    const total = sortedPayload.reduce((acc, p) => acc + (p.value || 0), 0);
    return (_jsxs("div", { className: "chart-tooltip", style: {
            minWidth: "180px",
            backdropFilter: "blur(12px)",
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "16px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            padding: "1rem"
        }, children: [_jsx("div", { style: { paddingBottom: "0.75rem", marginBottom: "0.75rem", borderBottom: "1px solid #f1f5f9" }, children: _jsx("strong", { style: { color: "#0f172a", fontSize: "0.95rem" }, children: formatMonthLabel(label) }) }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: sortedPayload.map((entry) => (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem" }, children: [_jsx("div", { style: { width: "8px", height: "8px", borderRadius: "50%", background: entry.color } }), _jsx("span", { style: { color: "#475569", fontSize: "0.85rem", fontWeight: 600 }, children: entry.name })] }), _jsx("strong", { style: { color: "#1e293b", fontSize: "0.85rem" }, children: entry.value })] }, entry.name))) }), _jsxs("div", { style: { marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "2px solid #f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsx("span", { style: { color: "#64748b", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.025em" }, children: "Total" }), _jsx("strong", { style: { color: "#0f172a", fontSize: "1rem" }, children: total })] })] }));
}
function CacTooltip({ active, payload, label, }) {
    if (!active || !payload?.length || !label) {
        return null;
    }
    return (_jsxs("div", { className: "chart-tooltip", style: { backdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(217, 119, 6, 0.2)", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }, children: [_jsx("strong", { style: { color: "#0f172a" }, children: formatMonthLabel(label) }), _jsxs("div", { className: "chart-tooltip-count", style: { marginTop: "0.5rem" }, children: [_jsx("strong", { style: { color: "#d97706", fontSize: "1.2rem" }, children: formatCac(payload[0]?.value ?? null) }), _jsx("span", { style: { color: "#64748b" }, children: "custo por cliente adquirido" })] })] }));
}
function renderTrend(current, previous) {
    if (previous <= 0)
        return null;
    const diff = current - previous;
    if (diff === 0)
        return null;
    const isUp = diff > 0;
    const percent = Math.abs((diff / previous) * 100).toFixed(1);
    return (_jsxs("span", { className: isUp ? "trend-up" : "trend-down", children: [isUp ? _jsx(ArrowUpRight, { size: 14 }) : _jsx(ArrowDownRight, { size: 14 }), percent, "%"] }));
}
function renderCurrencyTrend(current, previous) {
    if (previous <= 0)
        return null;
    const diff = current - previous;
    if (diff === 0)
        return null;
    const isUp = diff > 0;
    const percent = Math.abs((diff / previous) * 100).toFixed(1);
    return (_jsxs("span", { className: isUp ? "trend-up" : "trend-down", children: [isUp ? _jsx(ArrowUpRight, { size: 14 }) : _jsx(ArrowDownRight, { size: 14 }), percent, "%"] }));
}
const ATTENDANT_COLORS = [
    "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444",
    "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1"
];
const ATTENDANT_COLOR_MAP = {
    "Suelen": "#ec4899", // Rosa
    "Amanda": "#ef4444", // Vermelho
    "Thais": "#8b5cf6", // Roxo
    "Tamires": "#10b981", // Verde
    "Valessa": "#3b82f6", // Azul
};
const TARGET_ATTENDANTS = ["Amanda", "Suelen", "Thais", "Tamires", "Valessa"];
export function NewCustomersPage() {
    const { token } = useAuth();
    const acquisitionQuery = useQuery({
        queryKey: ["acquisition-dashboard"],
        queryFn: () => api.acquisition(token),
        enabled: Boolean(token),
    });
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [expandedMonth, setExpandedMonth] = useState(null);
    const activeMonth = selectedMonth ?? currentMonthKey;
    const derivedSummary = useMemo(() => {
        if (!acquisitionQuery.data)
            return null;
        const data = acquisitionQuery.data;
        const findMonth = (m) => data.monthlySeries.find(s => s.month === m);
        const getDetailedMetrics = (m) => {
            const customers = data.recentCustomers.filter(c => c.firstOrderDate.startsWith(m));
            const totalAmount = customers.reduce((acc, c) => acc + Number(c.firstOrderAmount || 0), 0);
            const totalPieces = customers.reduce((acc, c) => acc + Number(c.firstItemCount || 0), 0);
            return {
                count: customers.length,
                amount: totalAmount,
                pieces: totalPieces,
                avgTicket: customers.length > 0 ? totalAmount / customers.length : 0,
                avgPieces: customers.length > 0 ? totalPieces / customers.length : 0
            };
        };
        const prevMonthKey = (() => {
            const parts = activeMonth.split('-').map(Number);
            const year = parts[0] || new Date().getFullYear();
            const month = parts[1] || (new Date().getMonth() + 1);
            const d = new Date(year, month - 2, 1);
            return d.toISOString().slice(0, 7);
        })();
        const currentMonthData = findMonth(activeMonth);
        const previousMonthData = findMonth(prevMonthKey);
        const currentDetailed = getDetailedMetrics(activeMonth);
        const previousDetailed = getDetailedMetrics(prevMonthKey);
        return {
            count: currentDetailed.count,
            prevCount: previousDetailed.count,
            amount: currentDetailed.amount,
            prevAmount: previousDetailed.amount,
            pieces: currentDetailed.pieces,
            prevPieces: previousDetailed.pieces,
            avgPieces: currentDetailed.avgPieces,
            prevAvgPieces: previousDetailed.avgPieces,
            avgTicket: currentDetailed.avgTicket,
            prevAvgTicket: previousDetailed.avgTicket,
            spend: currentMonthData?.spend ?? 0,
            prevSpend: previousMonthData?.spend ?? 0,
            cac: currentMonthData?.cac ?? null,
            prevCac: previousMonthData?.cac ?? null,
            isRealTime: activeMonth === currentMonthKey
        };
    }, [acquisitionQuery.data, activeMonth, currentMonthKey]);
    const derivedDailySeries = useMemo(() => {
        if (!acquisitionQuery.data)
            return [];
        const data = acquisitionQuery.data;
        const parts = activeMonth.split('-').map(Number);
        const year = parts[0] || new Date().getFullYear();
        const month = parts[1] || (new Date().getMonth() + 1);
        const daysInMonth = new Date(year, month, 0).getDate();
        return Array.from({ length: daysInMonth }).map((_, i) => {
            const day = String(i + 1).padStart(2, '0');
            const dateStr = `${activeMonth}-${day}`;
            const count = data.recentCustomers.filter(c => c.firstOrderDate === dateStr).length;
            return {
                date: dateStr,
                newCustomers: count
            };
        });
    }, [acquisitionQuery.data, activeMonth]);
    const filteredCustomers = useMemo(() => {
        if (!acquisitionQuery.data)
            return [];
        return acquisitionQuery.data.recentCustomers.filter((c) => {
            if (!c.firstOrderDate.startsWith(activeMonth))
                return false;
            const attendant = (c.firstAttendant || "").toLowerCase();
            return TARGET_ATTENDANTS.some(target => attendant.includes(target.toLowerCase()));
        });
    }, [acquisitionQuery.data, activeMonth]);
    const attendantBreakdown = useMemo(() => {
        const counts = {};
        for (const c of filteredCustomers) {
            const name = c.firstAttendant || "Sem Atendente";
            counts[name] = (counts[name] || 0) + 1;
        }
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [filteredCustomers]);
    const attendantsHistory = useMemo(() => {
        if (!acquisitionQuery.data)
            return { series: [], names: [] };
        const data = acquisitionQuery.data;
        const seriesMap = new Map();
        const allAttendants = new Set();
        for (const customer of data.recentCustomers) {
            const month = customer.firstOrderDate.slice(0, 7);
            const originalName = customer.firstAttendant || "Sem Atendente";
            const attendantLower = originalName.toLowerCase();
            const targetMatch = TARGET_ATTENDANTS.find(target => attendantLower.includes(target.toLowerCase()));
            if (!targetMatch)
                continue;
            if (!seriesMap.has(month)) {
                seriesMap.set(month, { month });
            }
            const point = seriesMap.get(month);
            point[targetMatch] = (point[targetMatch] || 0) + 1;
            allAttendants.add(targetMatch);
        }
        const series = Array.from(seriesMap.values()).sort((a, b) => a.month.localeCompare(b.month));
        return { series, names: Array.from(allAttendants).sort() };
    }, [acquisitionQuery.data]);
    if (acquisitionQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando clientes novos..." });
    }
    if (acquisitionQuery.isError || !acquisitionQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os dados de clientes novos." });
    }
    const data = acquisitionQuery.data;
    const metrics = derivedSummary;
    const monthlyTicks = buildMonthlyTicks(data.monthlySeries);
    function handleBarClick(barData) {
        if (barData?.month) {
            setSelectedMonth(barData.month);
        }
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsx("style", { children: styles }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0, marginBottom: "0.3rem", color: "var(--accent)", fontWeight: 700, letterSpacing: "0.1em" }, children: "M\u00C9TRICAS DE AQUISI\u00C7\u00C3O" }), _jsx("h2", { className: "premium-header-title", children: "Clientes Novos" })] }), _jsxs("div", { style: { display: "flex", gap: "1rem", alignItems: "center" }, children: [_jsx("label", { style: { fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }, children: "M\u00EAs de Visualiza\u00E7\u00E3o:" }), _jsx("select", { value: activeMonth, onChange: (e) => setSelectedMonth(e.target.value), style: {
                                    padding: "0.6rem 1rem",
                                    borderRadius: "12px",
                                    border: "1px solid #e2e8f0",
                                    background: "#ffffff",
                                    fontSize: "0.9rem",
                                    fontWeight: 600,
                                    color: "#1e293b",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                    cursor: "pointer",
                                    outline: "none"
                                }, children: data.monthlySeries.slice().reverse().map(m => (_jsx("option", { value: m.month, children: formatMonthLabel(m.month) }, m.month))) })] })] }), _jsxs("div", { className: "premium-grid", children: [_jsxs("div", { className: "premium-card", style: { borderTop: "4px solid var(--accent)" }, children: [_jsx("div", { className: "metric-label", children: "Novos no M\u00EAs" }), _jsx("div", { className: "metric-value", children: formatNumber(metrics.count) }), _jsxs("p", { className: "metric-helper", style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [renderTrend(metrics.count, metrics.prevCount), "vs ", formatNumber(metrics.prevCount), " m\u00EAs anterior"] })] }), _jsxs("div", { className: "premium-card", children: [_jsx("div", { className: "metric-label", children: "Faturamento Novos" }), _jsx("div", { className: "metric-value", style: { color: "var(--accent)" }, children: formatCurrency(metrics.amount) }), _jsxs("p", { className: "metric-helper", style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [renderCurrencyTrend(metrics.amount, metrics.prevAmount), "vs ", formatCurrency(metrics.prevAmount)] })] }), _jsxs("div", { className: "premium-card", children: [_jsx("div", { className: "metric-label", children: "Ticket M\u00E9dio" }), _jsx("div", { className: "metric-value", children: formatCurrency(metrics.avgTicket) }), _jsxs("p", { className: "metric-helper", style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [renderCurrencyTrend(metrics.avgTicket, metrics.prevAvgTicket), "vs ", formatCurrency(metrics.prevAvgTicket)] })] }), _jsxs("div", { className: "premium-card", children: [_jsx("div", { className: "metric-label", children: "Total de Pe\u00E7as" }), _jsxs("div", { className: "metric-value", children: [formatNumber(metrics.pieces), " ", _jsx("span", { style: { fontSize: "0.85rem", color: "#64748b", fontWeight: 500 }, children: "itens" })] }), _jsxs("p", { className: "metric-helper", style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [renderTrend(metrics.pieces, metrics.prevPieces), "vs ", formatNumber(metrics.prevPieces), " m\u00EAs anterior"] })] }), _jsxs("div", { className: "premium-card", children: [_jsx("div", { className: "metric-label", children: "M\u00E9dia de Pe\u00E7as" }), _jsxs("div", { className: "metric-value", children: [formatNumber(metrics.avgPieces), " ", _jsx("span", { style: { fontSize: "0.85rem", color: "#64748b", fontWeight: 500 }, children: "/ cliente" })] }), _jsxs("p", { className: "metric-helper", style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [renderTrend(metrics.avgPieces, metrics.prevAvgPieces), "vs ", formatNumber(metrics.prevAvgPieces)] })] }), _jsxs("div", { className: "premium-card", children: [_jsx("div", { className: "metric-label", children: "Gasto no M\u00EAs" }), _jsx("div", { className: "metric-value", style: { color: "#3b82f6" }, children: formatCurrency(metrics.spend) }), _jsxs("p", { className: "metric-helper", style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [renderCurrencyTrend(metrics.spend, metrics.prevSpend), "vs ", formatCurrency(metrics.prevSpend)] })] }), _jsxs("div", { className: "premium-card", children: [_jsx("div", { className: "metric-label", children: "CAC no M\u00EAs" }), _jsx("div", { className: "metric-value", style: { color: "#d97706" }, children: formatCac(metrics.cac) }), _jsxs("p", { className: "metric-helper", children: ["Mes anterior: ", formatCac(metrics.prevCac)] })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: "1.5rem" }, children: [_jsxs("section", { className: "premium-panel", children: [_jsxs("div", { style: { marginBottom: "1.5rem" }, children: [_jsx("h3", { style: { fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }, children: "Clientes novos por dia" }), _jsxs("p", { className: "metric-helper", style: { marginTop: "0.4rem" }, children: ["Distribui\u00E7\u00E3o di\u00E1ria de aquisi\u00E7\u00F5es em ", formatMonthLabel(activeMonth), "."] })] }), _jsx("div", { style: { width: "100%", height: "260px" }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { data: derivedDailySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "colorNew", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#3b82f6", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#3b82f6", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { stroke: "#f1f5f9", vertical: false, strokeDasharray: "4 4" }), _jsx(XAxis, { dataKey: "date", tickFormatter: formatShortDate, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, dy: 10 }), _jsx(YAxis, { allowDecimals: false, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, dx: -10 }), _jsx(Tooltip, { content: _jsx(DailyTooltip, {}), cursor: { stroke: "rgba(59, 130, 246, 0.1)", strokeWidth: 32 } }), _jsx(Line, { type: "monotone", dataKey: "newCustomers", stroke: "#3b82f6", strokeWidth: 4, dot: { r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#3b82f6" }, activeDot: { r: 7, strokeWidth: 3, fill: "#ffffff", stroke: "#2563eb" } })] }) }) }), attendantBreakdown.length > 0 && (_jsxs("div", { style: { marginTop: "2rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }, children: [_jsx("h4", { style: { fontSize: "0.9rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }, children: "Aquisi\u00E7\u00F5es por Vendedora" }), _jsxs("span", { style: { fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" }, children: [filteredCustomers.length, " total"] })] }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.75rem" }, children: attendantBreakdown.map((item, idx) => (_jsxs("div", { style: {
                                                background: idx === 0 ? "rgba(59, 130, 246, 0.06)" : "#ffffff",
                                                border: idx === 0 ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid #e2e8f0",
                                                borderRadius: "14px",
                                                padding: "0.5rem 0.85rem",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.65rem",
                                                boxShadow: idx === 0 ? "0 2px 4px rgba(59, 130, 246, 0.05)" : "none"
                                            }, children: [idx === 0 && (_jsx("span", { style: { fontSize: "1rem" }, children: "\uD83C\uDFC6" })), _jsx("span", { style: { fontWeight: 600, color: "#1e293b", fontSize: "0.85rem" }, children: item.name }), _jsx("span", { style: {
                                                        background: idx === 0 ? "#3b82f6" : "#f1f5f9",
                                                        padding: "0.1rem 0.5rem",
                                                        borderRadius: "6px",
                                                        fontSize: "0.8rem",
                                                        fontWeight: 700,
                                                        color: idx === 0 ? "#ffffff" : "#475569"
                                                    }, children: item.count })] }, item.name))) })] }))] }), _jsxs("section", { className: "premium-panel", children: [_jsxs("div", { style: { marginBottom: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("h3", { style: { fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }, children: ["Clientes novos \u2014 ", formatMonthLabel(activeMonth)] }), selectedMonth && (_jsx("button", { onClick: () => setSelectedMonth(null), style: {
                                                    background: "rgba(41,86,215,0.08)",
                                                    border: "1px solid rgba(41,86,215,0.2)",
                                                    borderRadius: "8px",
                                                    padding: "0.35rem 0.75rem",
                                                    fontSize: "0.8rem",
                                                    fontWeight: 600,
                                                    color: "var(--accent)",
                                                    cursor: "pointer",
                                                    transition: "all 0.2s",
                                                }, children: "\u2715 Voltar ao m\u00EAs atual" }))] }), _jsx("p", { className: "metric-helper", style: { marginTop: "0.4rem" }, children: selectedMonth
                                            ? `Mostrando ${filteredCustomers.length} clientes adquiridos em ${formatMonthLabel(selectedMonth)}. Clique em outra barra do gráfico para trocar.`
                                            : `${filteredCustomers.length} clientes neste mês. Clique em uma barra do histórico para ver outro mês.` })] }), filteredCustomers.length ? (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.85rem", maxHeight: "600px", overflowY: "auto" }, children: filteredCustomers.map((customer) => (_jsxs("article", { className: "customer-row", style: {
                                        display: "grid",
                                        gridTemplateColumns: "minmax(0, 1fr) auto",
                                        gap: "0.75rem",
                                        padding: "1rem 1.25rem",
                                    }, children: [_jsxs("div", { style: { minWidth: 0 }, children: [_jsx("strong", { style: { display: "block", marginBottom: "0.3rem", color: "#1e293b", fontSize: "0.95rem" }, children: customer.displayName }), _jsxs("span", { style: { display: "block", color: "#64748b", fontSize: "0.82rem" }, children: [customer.customerCode || "Sem codigo", " \u2022 1\u00AA compra em ", formatDate(customer.firstOrderDate)] }), _jsxs("span", { style: { display: "block", color: "#64748b", fontSize: "0.82rem", marginTop: "0.35rem", fontWeight: 500 }, children: [_jsx("span", { style: { color: "#3b82f6" }, children: customer.firstAttendant ? `Atend: ${customer.firstAttendant}` : "Sem atendente" }), " \u2022", " ", formatCurrency(customer.firstOrderAmount), _jsxs("span", { style: { marginLeft: "0.5rem", padding: "0.1rem 0.4rem", background: "#f1f5f9", borderRadius: "4px", fontSize: "0.75rem" }, children: [customer.firstItemCount, " pe\u00E7as"] })] })] }), _jsx("div", { style: { display: "flex", alignItems: "center" }, children: _jsx(Link, { to: `/clientes/${customer.customerId}`, className: "premium-btn", children: "Abrir cliente" }) })] }, customer.customerId))) })) : (_jsxs("div", { className: "empty-state", style: { padding: "3rem 1rem", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e1" }, children: ["Nenhum cliente novo em ", formatMonthLabel(activeMonth), "."] }))] })] }), _jsxs("section", { className: "premium-panel", style: { marginTop: "1.5rem" }, children: [_jsxs("div", { style: { marginBottom: "1.5rem" }, children: [_jsx("h3", { style: { fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }, children: "Hist\u00F3rico mensal" }), _jsx("p", { className: "metric-helper", style: { marginTop: "0.4rem" }, children: "Evolucao da aquisicao desde o primeiro mes com pedidos no CRM." })] }), _jsx("div", { style: { width: "100%", height: "280px", marginBottom: "2rem" }, children: _jsx(ResponsiveContainer, { children: _jsxs(ComposedChart, { syncId: "acquisition-history", syncMethod: "value", data: data.monthlySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "#f1f5f9", vertical: false, strokeDasharray: "4 4" }), _jsx(XAxis, { dataKey: "month", ticks: monthlyTicks, tickFormatter: formatMonthLabel, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, interval: 0, dy: 10 }), _jsx(YAxis, { yAxisId: "customers", allowDecimals: false, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, width: 48, dx: -10 }), _jsx(YAxis, { yAxisId: "spend", orientation: "right", tickFormatter: (value) => formatCurrency(value), tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, width: 90, dx: 10 }), _jsx(Tooltip, { content: _jsx(MonthlyTooltip, {}), cursor: { fill: "rgba(59, 130, 246, 0.05)" } }), _jsx(Bar, { yAxisId: "customers", dataKey: "newCustomers", fill: "#10b981", radius: [6, 6, 0, 0], maxBarSize: 50, cursor: "pointer", onClick: (_, index) => {
                                            const entry = data.monthlySeries[index];
                                            if (entry)
                                                handleBarClick(entry);
                                        } }), _jsx(Line, { yAxisId: "spend", type: "monotone", dataKey: "spend", stroke: "#3b82f6", strokeWidth: 4, dot: { r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#3b82f6" }, activeDot: { r: 7, strokeWidth: 3, fill: "#ffffff", stroke: "#2563eb" } })] }) }) }), _jsxs("div", { style: { marginBottom: "1.5rem", marginTop: "2.5rem", paddingTop: "2rem", borderTop: "1px solid #f1f5f9" }, children: [_jsx("h4", { style: { margin: 0, fontSize: "1.15rem", color: "#0f172a", fontWeight: 700 }, children: "Gr\u00E1fico de CAC" }), _jsx("p", { className: "metric-helper", style: { marginTop: "0.3rem" }, children: "Evolucao mensal do custo por cliente novo." })] }), _jsx("div", { style: { width: "100%", height: "240px", marginBottom: "2rem" }, children: _jsx(ResponsiveContainer, { children: _jsxs(LineChart, { syncId: "acquisition-history", syncMethod: "value", data: data.monthlySeries, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "#f1f5f9", vertical: false, strokeDasharray: "4 4" }), _jsx(XAxis, { dataKey: "month", ticks: monthlyTicks, tickFormatter: formatMonthLabel, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, interval: 0, dy: 10 }), _jsx(YAxis, { yAxisId: "spacer", tick: false, tickLine: false, axisLine: false, width: 48 }), _jsx(YAxis, { yAxisId: "cac", orientation: "right", tickFormatter: (value) => formatCurrency(value), tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, width: 90, dx: 10 }), _jsx(Tooltip, { content: _jsx(CacTooltip, {}), cursor: { stroke: "rgba(217, 119, 6, 0.1)", strokeWidth: 32 } }), _jsx(Line, { yAxisId: "cac", type: "monotone", dataKey: "cac", stroke: "#d97706", strokeWidth: 4, dot: { r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#d97706" }, activeDot: { r: 7, strokeWidth: 3, fill: "#ffffff", stroke: "#b45309" }, connectNulls: false })] }) }) }), _jsxs("div", { style: { marginBottom: "1.5rem", marginTop: "3.5rem", paddingTop: "2.5rem", borderTop: "1px solid #f1f5f9" }, children: [_jsx("h4", { style: { margin: 0, fontSize: "1.15rem", color: "#0f172a", fontWeight: 700 }, children: "Desempenho Hist\u00F3rico por Vendedora" }), _jsx("p", { className: "metric-helper", style: { marginTop: "0.3rem" }, children: "Novos clientes captados por cada vendedora ao longo do tempo." })] }), _jsxs("div", { style: { width: "100%", height: "300px", marginBottom: "3rem" }, children: [_jsx(ResponsiveContainer, { children: _jsxs(BarChart, { syncId: "acquisition-history", syncMethod: "value", data: attendantsHistory.series, margin: { top: 8, right: 12, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { stroke: "#f1f5f9", vertical: false, strokeDasharray: "4 4" }), _jsx(XAxis, { dataKey: "month", ticks: monthlyTicks, tickFormatter: formatMonthLabel, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, interval: 0, dy: 10 }), _jsx(YAxis, { allowDecimals: false, tick: { fill: "#64748b", fontSize: 12, fontWeight: 500 }, tickLine: false, axisLine: false, width: 48, dx: -10 }), _jsx(YAxis, { yAxisId: "spacer", orientation: "right", width: 90, tick: false, axisLine: false, tickLine: false }), _jsx(Tooltip, { content: _jsx(HistoryTooltip, {}), cursor: { fill: "rgba(148, 163, 184, 0.05)" } }), attendantsHistory.names.map((name, index) => (_jsx(Bar, { dataKey: name, stackId: "a", fill: ATTENDANT_COLOR_MAP[name] || ATTENDANT_COLORS[index % ATTENDANT_COLORS.length], radius: [0, 0, 0, 0], maxBarSize: 50 }, name)))] }) }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem", justifyContent: "center" }, children: attendantsHistory.names.map((name, index) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.35rem" }, children: [_jsx("div", { style: {
                                                width: "10px",
                                                height: "10px",
                                                borderRadius: "2px",
                                                background: ATTENDANT_COLOR_MAP[name] || ATTENDANT_COLORS[index % ATTENDANT_COLORS.length]
                                            } }), _jsx("span", { style: { fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }, children: name })] }, name))) })] }), _jsx("div", { style: { overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: "640px", background: "#ffffff" }, children: [_jsx("thead", { style: { background: "#f8fafc" }, children: _jsxs("tr", { style: { textAlign: "left", color: "#475569" }, children: [_jsx("th", { style: { padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }, children: "Mes" }), _jsx("th", { style: { padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }, children: "Clientes novos" }), _jsx("th", { style: { padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }, children: "Gasto" }), _jsx("th", { style: { padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }, children: "CAC" })] }) }), _jsx("tbody", { children: data.monthlySeries
                                        .slice()
                                        .reverse()
                                        .map((entry, index) => {
                                        const isActive = entry.month === activeMonth;
                                        const isExpanded = entry.month === expandedMonth;
                                        const monthCustomers = acquisitionQuery.data.recentCustomers
                                            .filter(c => c.firstOrderDate.startsWith(entry.month))
                                            .sort((a, b) => b.firstOrderDate.localeCompare(a.firstOrderDate));
                                        return (_jsxs(Fragment, { children: [_jsxs("tr", { onClick: () => {
                                                        setExpandedMonth(isExpanded ? null : entry.month);
                                                        setSelectedMonth(entry.month);
                                                    }, style: {
                                                        borderBottom: (index === data.monthlySeries.length - 1 && !isExpanded) ? "none" : "1px solid #f1f5f9",
                                                        background: isActive ? "rgba(41, 86, 215, 0.08)" : (index % 2 === 0 ? "#ffffff" : "rgba(248, 250, 252, 0.5)"),
                                                        cursor: "pointer",
                                                        transition: "all 0.2s"
                                                    }, className: "historical-row", children: [_jsx("td", { style: { padding: "1rem", fontWeight: 700, color: isActive ? "var(--accent)" : "#1e293b" }, children: _jsxs("span", { style: { display: "flex", alignItems: "center", gap: "0.5rem" }, children: [_jsx("span", { style: { fontSize: "0.8rem", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "#64748b" }, children: "\u25B6" }), formatMonthLabel(entry.month), isActive && _jsx("span", { style: { marginLeft: "0.5rem", fontSize: "0.7rem", color: "var(--accent)", background: "rgba(41,86,215,0.1)", padding: "0.2rem 0.5rem", borderRadius: "999px" }, children: "Ativo" })] }) }), _jsx("td", { style: { padding: "1rem", color: "#334155" }, children: formatNumber(entry.newCustomers) }), _jsx("td", { style: { padding: "1rem", color: "#334155" }, children: formatCurrency(entry.spend) }), _jsx("td", { style: { padding: "1rem", color: "#334155", fontWeight: 500 }, children: formatCac(entry.cac) })] }), isExpanded && (_jsx("tr", { style: { background: "#f8fafc" }, children: _jsx("td", { colSpan: 4, style: { padding: "0 0 1.5rem 0" }, children: _jsxs("div", { style: { padding: "1.25rem", borderLeft: "4px solid var(--accent)", marginLeft: "1rem", marginRight: "1rem", background: "#ffffff", borderRadius: "0 0 16px 16px", boxShadow: "inset 0 4px 6px -1px rgba(0,0,0,0.05)" }, children: [_jsxs("h5", { style: { fontSize: "0.85rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }, children: ["Clientes de ", formatMonthLabel(entry.month)] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: [monthCustomers.map(customer => (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "100px 1fr 120px 100px auto", gap: "1rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "10px", alignItems: "center", border: "1px solid #f1f5f9" }, children: [_jsx("span", { style: { fontSize: "0.8rem", fontWeight: 700, color: "#64748b" }, children: customer.customerCode }), _jsx("span", { style: { fontSize: "0.9rem", fontWeight: 600, color: "#1e293b" }, children: customer.displayName }), _jsx("span", { style: { fontSize: "0.8rem", color: "#475569" }, children: formatDate(customer.firstOrderDate) }), _jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }, children: formatCurrency(customer.firstOrderAmount) }), _jsx("div", { style: { textAlign: "right" }, children: _jsx(Link, { to: `/clientes/${customer.customerId}`, className: "premium-btn", style: { fontSize: "0.75rem" }, children: "Abrir" }) })] }, customer.customerId))), monthCustomers.length === 0 && _jsx("p", { style: { textAlign: "center", padding: "1rem", color: "#94a3b8" }, children: "Nenhum cliente registrado." })] })] }) }) }))] }, entry.month));
                                    }) })] }) })] })] }));
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, } from "recharts";
export function SentimentTrendChart({ data }) {
    const chartData = data.map((item) => ({
        ...item,
        formattedDate: new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "short",
        }).format(new Date(item.date)),
        sentimentScore: item.averageScore,
    }));
    return (_jsxs("div", { className: "wa-chart-container", children: [_jsxs("div", { className: "wa-chart-header", children: [_jsx("strong", { children: "Evolucao do Sentimento" }), _jsx("p", { children: "Media diaria depois de separar ruido operacional dos sinais reais." })] }), _jsx("div", { className: "wa-chart-body", style: { height: 300 }, children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(AreaChart, { data: chartData, margin: { top: 10, right: 10, left: -20, bottom: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "sentimentGradient", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#10b981", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "#10b981", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "#f1f5f9" }), _jsx(XAxis, { dataKey: "formattedDate", axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "#64748b" }, minTickGap: 30 }), _jsx(YAxis, { axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "#64748b" }, domain: [-1, 1], ticks: [-1, -0.5, 0, 0.5, 1] }), _jsx(Tooltip, { contentStyle: {
                                    borderRadius: "8px",
                                    border: "none",
                                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                                }, labelStyle: { fontWeight: "bold", marginBottom: "4px" } }), _jsx(Area, { type: "monotone", dataKey: "sentimentScore", name: "Sentimento", stroke: "#10b981", strokeWidth: 3, fillOpacity: 1, fill: "url(#sentimentGradient)" })] }) }) })] }));
}

import { DailySentiment } from "@olist-crm/shared";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";

interface SentimentTrendChartProps {
  data: DailySentiment[];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: "12px 16px",
      boxShadow: "0 10px 25px rgba(15, 23, 42, 0.12)",
      border: "1px solid #e2e8f0",
      minWidth: 160,
    }}>
      <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", margin: "0 0 8px" }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: "0.82rem", color: "#334155", padding: "2px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
            {p.name}
          </span>
          <strong>{p.value}</strong>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#64748b" }}>
        <span>Total</span>
        <strong>{total}</strong>
      </div>
    </div>
  );
}

export function SentimentTrendChart({ data }: SentimentTrendChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    formattedDate: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    }).format(new Date(item.date)),
    positive: item.positiveCount,
    neutral: item.neutralCount,
    negative: item.negativeCount,
  }));

  if (!chartData.length) {
    return (
      <div className="wa-chart-container">
        <div className="wa-chart-header">
          <strong>Sentimento das Conversas</strong>
          <p>Distribuição diária: positivas, neutras e negativas</p>
        </div>
        <div className="wa-chart-body" style={{ height: 280, display: "grid", placeItems: "center" }}>
          <span className="text-muted">Sem dados de sentimento para o período.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-chart-container">
      <div className="wa-chart-header">
        <strong>Sentimento das Conversas</strong>
        <p>Distribuição diária: positivas, neutras e negativas</p>
      </div>
      <div className="wa-chart-body" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradNeutral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="formattedDate"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#64748b" }}
              minTickGap={30}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#64748b" }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "0.78rem", paddingBottom: 8 }}
            />
            <Area
              type="monotone"
              dataKey="positive"
              name="Positivas"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradPositive)"
              stackId="sentiment"
            />
            <Area
              type="monotone"
              dataKey="neutral"
              name="Neutras"
              stroke="#94a3b8"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradNeutral)"
              stackId="sentiment"
            />
            <Area
              type="monotone"
              dataKey="negative"
              name="Negativas"
              stroke="#ef4444"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#gradNegative)"
              stackId="sentiment"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

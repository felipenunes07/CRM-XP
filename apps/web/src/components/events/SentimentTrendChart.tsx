import type { DailySentiment } from "@olist-crm/shared";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SentimentTrendChartProps {
  data: DailySentiment[];
}

export function SentimentTrendChart({ data }: SentimentTrendChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    formattedDate: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
    }).format(new Date(item.date)),
    sentimentScore: item.averageScore,
  }));

  return (
    <div className="wa-chart-container">
      <div className="wa-chart-header">
        <strong>Evolucao do Sentimento</strong>
        <p>Media diaria depois de separar ruido operacional dos sinais reais.</p>
      </div>
      <div className="wa-chart-body" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="formattedDate"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              minTickGap={30}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
              }}
              labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
            />
            <Area
              type="monotone"
              dataKey="sentimentScore"
              name="Sentimento"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#sentimentGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

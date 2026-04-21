import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, Fragment } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
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

function formatMonthLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const year = match?.[1];
  const month = match?.[2];

  if (!year || !month) {
    return value;
  }

  return `${month}/${year.slice(2)}`;
}

function buildMonthlyTicks(months: Array<{ month: string }>) {
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

function formatCac(value: number | null) {
  return value === null ? "Sem base" : formatCurrency(value);
}

function DailyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip" style={{ backdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(41, 86, 215, 0.2)", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}>
      <strong style={{ color: "#0f172a" }}>{formatDate(label)}</strong>
      <div className="chart-tooltip-count" style={{ marginTop: "0.5rem" }}>
        <strong style={{ color: "#2956d7", fontSize: "1.2rem" }}>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span style={{ color: "#64748b" }}>clientes na primeira compra</span>
      </div>
    </div>
  );
}

function MonthlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const dataPoint = payload[0]?.payload;
  const newCustomers = dataPoint?.newCustomers ?? 0;
  const spend = dataPoint?.spend ?? 0;
  const source = dataPoint?.spendSource;

  return (
    <div className="chart-tooltip" style={{ backdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(41, 86, 215, 0.2)", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}>
      <strong style={{ color: "#0f172a" }}>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count" style={{ marginTop: "0.5rem" }}>
        <strong style={{ color: "#2f9d67", fontSize: "1.1rem" }}>{formatNumber(newCustomers)}</strong>
        <span style={{ color: "#64748b" }}>clientes novos no mes</span>
      </div>
      <div className="chart-tooltip-count" style={{ marginTop: "0.35rem" }}>
        <strong style={{ color: "#2956d7", fontSize: "1.1rem" }}>{formatCurrency(spend)}</strong>
        <span style={{ color: "#64748b" }}>gasto em anuncios</span>
      </div>
      {source && (
        <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9", fontSize: "0.7rem", fontWeight: 800, color: source === 'api' ? '#10b981' : '#64748b', textAlign: "center", letterSpacing: "0.05em" }}>
          FONTE: {source === 'api' ? 'META ADS (API)' : 'PLANILHA (FALLBACK)'}
        </div>
      )}
    </div>
  );
}

function HistoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  // Sort payload by value DESC
  const sortedPayload = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
  const total = sortedPayload.reduce((acc, p) => acc + (p.value || 0), 0);

  return (
    <div className="chart-tooltip" style={{ 
      minWidth: "180px",
      backdropFilter: "blur(12px)", 
      background: "rgba(255,255,255,0.92)", 
      border: "1px solid rgba(148, 163, 184, 0.2)", 
      borderRadius: "16px", 
      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
      padding: "1rem"
    }}>
      <div style={{ paddingBottom: "0.75rem", marginBottom: "0.75rem", borderBottom: "1px solid #f1f5f9" }}>
        <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>{formatMonthLabel(label)}</strong>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {sortedPayload.map((entry) => (
          <div key={entry.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: entry.color }} />
              <span style={{ color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>{entry.name}</span>
            </div>
            <strong style={{ color: "#1e293b", fontSize: "0.85rem" }}>{entry.value}</strong>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "2px solid #f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#64748b", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.025em" }}>Total</span>
        <strong style={{ color: "#0f172a", fontSize: "1rem" }}>{total}</strong>
      </div>
    </div>
  );
}

function CacTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; payload?: any }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const source = payload[0]?.payload?.spendSource;

  return (
    <div className="chart-tooltip" style={{ backdropFilter: "blur(8px)", background: "rgba(255,255,255,0.9)", border: "1px solid rgba(217, 119, 6, 0.2)", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}>
      <strong style={{ color: "#0f172a" }}>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count" style={{ marginTop: "0.5rem" }}>
        <strong style={{ color: "#d97706", fontSize: "1.2rem" }}>{formatCac((payload[0]?.value as number | null | undefined) ?? null)}</strong>
        <span style={{ color: "#64748b" }}>custo por cliente adquirido</span>
      </div>
      {source && (
        <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9", fontSize: "0.7rem", fontWeight: 800, color: source === 'api' ? '#b45309' : '#64748b', textAlign: "center", letterSpacing: "0.05em" }}>
          FONTE: {source === 'api' ? 'META ADS (API)' : 'PLANILHA (FALLBACK)'}
        </div>
      )}
    </div>
  );
}

function renderTrend(current: number, previous: number) {
  if (previous <= 0) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  const isUp = diff > 0;
  const percent = Math.abs((diff / previous) * 100).toFixed(1);
  
  return (
    <span className={isUp ? "trend-up" : "trend-down"}>
      {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {percent}%
    </span>
  );
}

function renderCurrencyTrend(current: number, previous: number) {
  if (previous <= 0) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  const isUp = diff > 0;
  const percent = Math.abs((diff / previous) * 100).toFixed(1);
  
  return (
    <span className={isUp ? "trend-up" : "trend-down"}>
      {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {percent}%
    </span>
  );
}

const ATTENDANT_COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", 
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1"
];

const ATTENDANT_COLOR_MAP: Record<string, string> = {
  "Suelen": "#ec4899", // Rosa
  "Amanda": "#ef4444", // Vermelho
  "Thais": "#8b5cf6",  // Roxo
  "Tamires": "#10b981", // Verde
  "Valessa": "#3b82f6", // Azul
};

const TARGET_ATTENDANTS = ["Amanda", "Suelen", "Thais", "Tamires", "Valessa"];

export function NewCustomersPage() {
  const { token } = useAuth();
  const acquisitionQuery = useQuery({
    queryKey: ["acquisition-dashboard"],
    queryFn: () => api.acquisition(token!),
    enabled: Boolean(token),
  });

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const activeMonth = selectedMonth ?? currentMonthKey;

  const derivedSummary = useMemo(() => {
    if (!acquisitionQuery.data) return null;
    const data = acquisitionQuery.data;

    const findMonth = (m: string) => data.monthlySeries.find(s => s.month === m);

    const getDetailedMetrics = (m: string) => {
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
      spendSource: currentMonthData?.spendSource,
      prevSpend: previousMonthData?.spend ?? 0,
      prevSpendSource: previousMonthData?.spendSource,
      cac: currentMonthData?.cac ?? null,
      prevCac: previousMonthData?.cac ?? null,
      isRealTime: activeMonth === currentMonthKey,
      ltvCacRatio: data.summary.ltvCacRatio,
      estimatedLtv: data.summary.estimatedLtv,
      estimatedLifespanMonths: data.summary.estimatedLifespanMonths,
      monthlyChurnRate: data.summary.monthlyChurnRate
    };
  }, [acquisitionQuery.data, activeMonth, currentMonthKey]);

  const derivedDailySeries = useMemo(() => {
    if (!acquisitionQuery.data) return [];
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
    if (!acquisitionQuery.data) return [];
    return acquisitionQuery.data.recentCustomers.filter((c) => {
      if (!c.firstOrderDate.startsWith(activeMonth)) return false;
      const attendant = (c.firstAttendant || "").toLowerCase();
      return TARGET_ATTENDANTS.some(target => attendant.includes(target.toLowerCase()));
    });
  }, [acquisitionQuery.data, activeMonth]);

  const attendantBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredCustomers) {
      const name = c.firstAttendant || "Sem Atendente";
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCustomers]);

  const attendantsHistory = useMemo(() => {
    if (!acquisitionQuery.data) return { series: [], names: [] };
    const data = acquisitionQuery.data;
    const seriesMap = new Map<string, Record<string, any>>();
    const allAttendants = new Set<string>();

    for (const customer of data.recentCustomers) {
      const month = customer.firstOrderDate.slice(0, 7);
      const originalName = customer.firstAttendant || "Sem Atendente";
      const attendantLower = originalName.toLowerCase();
      
      const targetMatch = TARGET_ATTENDANTS.find(target => attendantLower.includes(target.toLowerCase()));
      if (!targetMatch) continue;

      if (!seriesMap.has(month)) {
        seriesMap.set(month, { month });
      }
      
      const point = seriesMap.get(month)!;
      point[targetMatch] = (point[targetMatch] || 0) + 1;
      allAttendants.add(targetMatch);
    }

    const series = Array.from(seriesMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    return { series, names: Array.from(allAttendants).sort() };
  }, [acquisitionQuery.data]);

  if (acquisitionQuery.isLoading) {
    return <div className="page-loading">Carregando clientes novos...</div>;
  }

  if (acquisitionQuery.isError || !acquisitionQuery.data) {
    return <div className="page-error">Nao foi possivel carregar os dados de clientes novos.</div>;
  }

  const data = acquisitionQuery.data;
  const metrics = derivedSummary!;
  const monthlyTicks = buildMonthlyTicks(data.monthlySeries);

  function handleBarClick(barData: { month?: string } | undefined) {
    if (barData?.month) {
      setSelectedMonth(barData.month);
    }
  }

  return (
    <div className="page-stack">
      <style>{styles}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: "0.3rem", color: "var(--accent)", fontWeight: 700, letterSpacing: "0.1em" }}>
            MÉTRICAS DE AQUISIÇÃO
          </p>
          <h2 className="premium-header-title">Clientes Novos</h2>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>Mês de Visualização:</label>
          <select
            value={activeMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
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
            }}
          >
            {data.monthlySeries.slice().reverse().map(m => (
              <option key={m.month} value={m.month}>
                {formatMonthLabel(m.month)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="premium-grid">
        <div className="premium-card" style={{ borderTop: "4px solid var(--accent)" }}>
          <div className="metric-label">Novos no Mês</div>
          <div className="metric-value">{formatNumber(metrics.count)}</div>
          <p className="metric-helper" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {renderTrend(metrics.count, metrics.prevCount)}
            vs {formatNumber(metrics.prevCount)} mês anterior
          </p>
        </div>

        <div className="premium-card">
          <div className="metric-label">Faturamento Novos</div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{formatCurrency(metrics.amount)}</div>
          <p className="metric-helper" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {renderCurrencyTrend(metrics.amount, metrics.prevAmount)}
            vs {formatCurrency(metrics.prevAmount)}
          </p>
        </div>

        <div className="premium-card">
          <div className="metric-label">Ticket Médio</div>
          <div className="metric-value">{formatCurrency(metrics.avgTicket)}</div>
          <p className="metric-helper" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {renderCurrencyTrend(metrics.avgTicket, metrics.prevAvgTicket)}
            vs {formatCurrency(metrics.prevAvgTicket)}
          </p>
        </div>

        <div className="premium-card">
          <div className="metric-label">Total de Peças</div>
          <div className="metric-value">{formatNumber(metrics.pieces)} <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 500 }}>itens</span></div>
          <p className="metric-helper" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {renderTrend(metrics.pieces, metrics.prevPieces)}
            vs {formatNumber(metrics.prevPieces)} mês anterior
          </p>
        </div>

        <div className="premium-card">
          <div className="metric-label">Média de Peças</div>
          <div className="metric-value">{formatNumber(metrics.avgPieces)} <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 500 }}>/ cliente</span></div>
          <p className="metric-helper" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {renderTrend(metrics.avgPieces, metrics.prevAvgPieces)}
            vs {formatNumber(metrics.prevAvgPieces)}
          </p>
        </div>

        <div className="premium-card">
          <div className="metric-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Gasto no Mês</span>
            {metrics.spendSource && (
              <span style={{ 
                fontSize: "0.6rem", 
                padding: "0.15rem 0.4rem", 
                borderRadius: "6px", 
                background: metrics.spendSource === 'api' ? "rgba(59, 130, 246, 0.1)" : "rgba(100, 116, 139, 0.1)", 
                color: metrics.spendSource === 'api' ? "#3b82f6" : "#64748b",
                fontWeight: 800,
                letterSpacing: "0.025em"
              }}>
                {metrics.spendSource === 'api' ? "API" : "PLANILHA"}
              </span>
            )}
          </div>
          <div className="metric-value" style={{ color: "#3b82f6" }}>{formatCurrency(metrics.spend)}</div>
          <p className="metric-helper" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {renderCurrencyTrend(metrics.spend, metrics.prevSpend)}
            vs {formatCurrency(metrics.prevSpend)}
          </p>
        </div>

        <div className="premium-card">
          <div className="metric-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>CAC no Mês</span>
            {metrics.spendSource && (
              <span style={{ 
                fontSize: "0.6rem", 
                padding: "0.15rem 0.4rem", 
                borderRadius: "6px", 
                background: metrics.spendSource === 'api' ? "rgba(217, 119, 6, 0.1)" : "rgba(100, 116, 139, 0.1)", 
                color: metrics.spendSource === 'api' ? "#d97706" : "#64748b",
                fontWeight: 800,
                letterSpacing: "0.025em"
              }}>
                {metrics.spendSource === 'api' ? "API" : "PLANILHA"}
              </span>
            )}
          </div>
          <div className="metric-value" style={{ color: "#d97706" }}>{formatCac(metrics.cac)}</div>
          <p className="metric-helper">Mes anterior: {formatCac(metrics.prevCac)}</p>
        </div>

        <div className="premium-card" style={{ borderTop: "4px solid #10b981" }}>
          <div className="metric-label">LTV (Valor Vitalício)</div>
          <div className="metric-value" style={{ color: "#10b981" }}>{formatCurrency(metrics.estimatedLtv ?? 0)}</div>
          <p className="metric-helper">Expectativa de receita por cliente</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: "1.5rem" }}>
        <section className="premium-panel">
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }}>Clientes novos por dia</h3>
            <p className="metric-helper" style={{ marginTop: "0.4rem" }}>
              Distribuição diária de aquisições em {formatMonthLabel(activeMonth)}.
            </p>
          </div>
          <div style={{ width: "100%", height: "260px" }}>
            <ResponsiveContainer>
              <LineChart data={derivedDailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip content={<DailyTooltip />} cursor={{ stroke: "rgba(59, 130, 246, 0.1)", strokeWidth: 32 }} />
                <Line
                  type="monotone"
                  dataKey="newCustomers"
                  stroke="#3b82f6"
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#3b82f6" }}
                  activeDot={{ r: 7, strokeWidth: 3, fill: "#ffffff", stroke: "#2563eb" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {attendantBreakdown.length > 0 && (
            <div style={{ marginTop: "2rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h4 style={{ fontSize: "0.9rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                  Aquisições por Vendedora
                </h4>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8" }}>
                  {filteredCustomers.length} total
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                {attendantBreakdown.map((item, idx) => (
                  <div 
                    key={item.name}
                    style={{ 
                      background: idx === 0 ? "rgba(59, 130, 246, 0.06)" : "#ffffff",
                      border: idx === 0 ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid #e2e8f0",
                      borderRadius: "14px",
                      padding: "0.5rem 0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.65rem",
                      boxShadow: idx === 0 ? "0 2px 4px rgba(59, 130, 246, 0.05)" : "none"
                    }}
                  >
                    {idx === 0 && (
                      <span style={{ fontSize: "1rem" }}>🏆</span>
                    )}
                    <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.85rem" }}>{item.name}</span>
                    <span style={{ 
                      background: idx === 0 ? "#3b82f6" : "#f1f5f9", 
                      padding: "0.1rem 0.5rem", 
                      borderRadius: "6px", 
                      fontSize: "0.8rem", 
                      fontWeight: 700, 
                      color: idx === 0 ? "#ffffff" : "#475569"
                    }}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="premium-panel">
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }}>
                Clientes novos — {formatMonthLabel(activeMonth)}
              </h3>
              {selectedMonth && (
                <button
                  onClick={() => setSelectedMonth(null)}
                  style={{
                    background: "rgba(41,86,215,0.08)",
                    border: "1px solid rgba(41,86,215,0.2)",
                    borderRadius: "8px",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "var(--accent)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  ✕ Voltar ao mês atual
                </button>
              )}
            </div>
            <p className="metric-helper" style={{ marginTop: "0.4rem" }}>
              {selectedMonth
                ? `Mostrando ${filteredCustomers.length} clientes adquiridos em ${formatMonthLabel(selectedMonth)}. Clique em outra barra do gráfico para trocar.`
                : `${filteredCustomers.length} clientes neste mês. Clique em uma barra do histórico para ver outro mês.`
              }
            </p>
          </div>

          {filteredCustomers.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", maxHeight: "600px", overflowY: "auto" }}>
              {filteredCustomers.map((customer) => (
                <article
                  key={customer.customerId}
                  className="customer-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "0.75rem",
                    padding: "1rem 1.25rem",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", marginBottom: "0.3rem", color: "#1e293b", fontSize: "0.95rem" }}>{customer.displayName}</strong>
                    <span style={{ display: "block", color: "#64748b", fontSize: "0.82rem" }}>
                      {customer.customerCode || "Sem codigo"} &bull; 1ª compra em {formatDate(customer.firstOrderDate)}
                    </span>
                    <span style={{ display: "block", color: "#64748b", fontSize: "0.82rem", marginTop: "0.35rem", fontWeight: 500 }}>
                      <span style={{ color: "#3b82f6" }}>{customer.firstAttendant ? `Atend: ${customer.firstAttendant}` : "Sem atendente"}</span> &bull;{" "}
                      {formatCurrency(customer.firstOrderAmount)}
                      <span style={{ marginLeft: "0.5rem", padding: "0.1rem 0.4rem", background: "#f1f5f9", borderRadius: "4px", fontSize: "0.75rem" }}>
                        {customer.firstItemCount} peças
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <Link
                      to={`/clientes/${customer.customerId}`}
                      className="premium-btn"
                    >
                      Abrir cliente
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "3rem 1rem", background: "#f8fafc", borderRadius: "16px", border: "1px dashed #cbd5e1" }}>
              Nenhum cliente novo em {formatMonthLabel(activeMonth)}.
            </div>
          )}
        </section>
      </div>

      <article className="premium-panel" style={{ marginTop: "2rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <p className="metric-helper" style={{ textTransform: "uppercase", fontSize: "0.75rem", fontWeight: 800, color: "var(--accent)", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
            Inteligência de Venda
          </p>
          <h3 style={{ fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }}>Saúde do Negócio (LTV vs CAC)</h3>
          <p className="metric-helper" style={{ marginTop: "0.4rem" }}>
            Relação entre o valor vitalício do cliente e o custo de aquisição. O ideal é LTV {'>'} 3x CAC.
          </p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
          <div style={{ padding: '1.5rem', borderRadius: '16px', background: 'rgba(41, 86, 215, 0.03)', border: '1px solid rgba(41, 86, 215, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              <TrendingUp size={16} />
              LTV / CAC Ratio
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 800, color: (metrics.ltvCacRatio ?? 0) >= 3 ? '#10b981' : (metrics.ltvCacRatio ?? 0) >= 1.5 ? '#f59e0b' : '#ef4444' }}>
                {metrics.ltvCacRatio ? metrics.ltvCacRatio.toFixed(1) : '--'}x
              </span>
              <span style={{ 
                fontSize: '0.85rem', 
                fontWeight: 700, 
                padding: '0.3rem 0.6rem', 
                borderRadius: '6px', 
                background: (metrics.ltvCacRatio ?? 0) >= 3 ? 'rgba(16, 185, 129, 0.1)' : (metrics.ltvCacRatio ?? 0) >= 1.5 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: (metrics.ltvCacRatio ?? 0) >= 3 ? '#10b981' : (metrics.ltvCacRatio ?? 0) >= 1.5 ? '#f59e0b' : '#ef4444'
              }}>
                {(metrics.ltvCacRatio ?? 0) >= 3 ? 'Saudável' : (metrics.ltvCacRatio ?? 0) >= 1.5 ? 'Atenção' : 'Crítico'}
              </span>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.75rem', lineHeight: 1.5 }}>
              {(metrics.ltvCacRatio ?? 0) >= 3 
                ? 'Sua operação em novos clientes está gerando valor muito acima do custo de aquisição.' 
                : (metrics.ltvCacRatio ?? 0) >= 1.5 
                  ? 'A relação de aquisição está dentro do aceitável, mas pode haver espaço para otimização do CAC.'
                  : 'Atenção: o custo de aquisição está muito próximo do retorno vitalício estimado.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Ticket Médio Histórico</span>
              <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{formatCurrency(metrics.avgTicket)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Vida do Cliente Estimada</span>
              <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{metrics.estimatedLifespanMonths?.toFixed(1)} meses</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Churn Rate Histórico</span>
              <strong style={{ fontSize: '1rem', color: '#1e293b' }}>{((metrics.monthlyChurnRate ?? 0) * 100).toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      </article>

      <section className="premium-panel" style={{ marginTop: "1.5rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1.25rem", margin: 0, color: "#0f172a", fontWeight: 700 }}>Histórico mensal</h3>
          <p className="metric-helper" style={{ marginTop: "0.4rem" }}>
            Evolucao da aquisicao desde o primeiro mes com pedidos no CRM.
          </p>
        </div>

        <div style={{ width: "100%", height: "280px", marginBottom: "2rem" }}>
          <ResponsiveContainer>
            <ComposedChart
              syncId="acquisition-history"
              syncMethod="value"
              data={data.monthlySeries}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="4 4" />
              <XAxis
                dataKey="month"
                ticks={monthlyTicks}
                tickFormatter={formatMonthLabel}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                dy={10}
              />
              <YAxis
                yAxisId="customers"
                allowDecimals={false}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={48}
                dx={-10}
              />
              <YAxis
                yAxisId="spend"
                orientation="right"
                tickFormatter={(value: number) => formatCurrency(value)}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={90}
                dx={10}
              />
              <Tooltip
                content={<MonthlyTooltip />}
                cursor={{ fill: "rgba(59, 130, 246, 0.05)" }}
              />
              <Bar
                yAxisId="customers"
                dataKey="newCustomers"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
                maxBarSize={50}
                cursor="pointer"
                onClick={(_: unknown, index: number) => {
                  const entry = data.monthlySeries[index];
                  if (entry) handleBarClick(entry);
                }}
              />
              <Line
                yAxisId="spend"
                type="monotone"
                dataKey="spend"
                stroke="#3b82f6"
                strokeWidth={4}
                dot={{ r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#3b82f6" }}
                activeDot={{ r: 7, strokeWidth: 3, fill: "#ffffff", stroke: "#2563eb" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginBottom: "1.5rem", marginTop: "2.5rem", paddingTop: "2rem", borderTop: "1px solid #f1f5f9" }}>
          <h4 style={{ margin: 0, fontSize: "1.15rem", color: "#0f172a", fontWeight: 700 }}>Gráfico de CAC</h4>
          <p className="metric-helper" style={{ marginTop: "0.3rem" }}>
            Evolucao mensal do custo por cliente novo.
          </p>
        </div>

        <div style={{ width: "100%", height: "240px", marginBottom: "2rem" }}>
          <ResponsiveContainer>
            <LineChart
              syncId="acquisition-history"
              syncMethod="value"
              data={data.monthlySeries}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="4 4" />
              <XAxis
                dataKey="month"
                ticks={monthlyTicks}
                tickFormatter={formatMonthLabel}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                dy={10}
              />
              <YAxis yAxisId="spacer" tick={false} tickLine={false} axisLine={false} width={48} />
              <YAxis
                yAxisId="cac"
                orientation="right"
                tickFormatter={(value: number) => formatCurrency(value)}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={90}
                dx={10}
              />
              <Tooltip
                content={<CacTooltip />}
                cursor={{ stroke: "rgba(217, 119, 6, 0.1)", strokeWidth: 32 }}
              />
              <Line
                yAxisId="cac"
                type="monotone"
                dataKey="cac"
                stroke="#d97706"
                strokeWidth={4}
                dot={{ r: 4, strokeWidth: 2, fill: "#ffffff", stroke: "#d97706" }}
                activeDot={{ r: 7, strokeWidth: 3, fill: "#ffffff", stroke: "#b45309" }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginBottom: "1.5rem", marginTop: "3.5rem", paddingTop: "2.5rem", borderTop: "1px solid #f1f5f9" }}>
          <h4 style={{ margin: 0, fontSize: "1.15rem", color: "#0f172a", fontWeight: 700 }}>Desempenho Histórico por Vendedora</h4>
          <p className="metric-helper" style={{ marginTop: "0.3rem" }}>
            Novos clientes captados por cada vendedora ao longo do tempo.
          </p>
        </div>

        <div style={{ width: "100%", height: "300px", marginBottom: "3rem" }}>
          <ResponsiveContainer>
            <BarChart
              syncId="acquisition-history"
              syncMethod="value"
              data={attendantsHistory.series}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="4 4" />
              <XAxis
                dataKey="month"
                ticks={monthlyTicks}
                tickFormatter={formatMonthLabel}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                dy={10}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={48}
                dx={-10}
              />
              <YAxis yAxisId="spacer" orientation="right" width={90} tick={false} axisLine={false} tickLine={false} />
              <Tooltip
                content={<HistoryTooltip />}
                cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
              />
              {attendantsHistory.names.map((name, index) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="a"
                  fill={ATTENDANT_COLOR_MAP[name] || ATTENDANT_COLORS[index % ATTENDANT_COLORS.length]}
                  radius={[0, 0, 0, 0]}
                  maxBarSize={50}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem", justifyContent: "center" }}>
            {attendantsHistory.names.map((name, index) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <div style={{ 
                  width: "10px", 
                  height: "10px", 
                  borderRadius: "2px", 
                  background: ATTENDANT_COLOR_MAP[name] || ATTENDANT_COLORS[index % ATTENDANT_COLORS.length] 
                }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>{name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px", background: "#ffffff" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr style={{ textAlign: "left", color: "#475569" }}>
                <th style={{ padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Mes</th>
                <th style={{ padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Clientes novos</th>
                <th style={{ padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Gasto</th>
                <th style={{ padding: "1rem", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>CAC</th>
              </tr>
            </thead>
            <tbody>
              {data.monthlySeries
                .slice()
                .reverse()
                .map((entry, index) => {
                  const isActive = entry.month === activeMonth;
                  const isExpanded = entry.month === expandedMonth;
                  
                  const monthCustomers = acquisitionQuery.data.recentCustomers
                    .filter(c => c.firstOrderDate.startsWith(entry.month))
                    .sort((a, b) => b.firstOrderDate.localeCompare(a.firstOrderDate));

                  return (
                    <Fragment key={entry.month}>
                      <tr 
                        onClick={() => {
                          setExpandedMonth(isExpanded ? null : entry.month);
                          setSelectedMonth(entry.month);
                        }}
                        style={{ 
                          borderBottom: (index === data.monthlySeries.length - 1 && !isExpanded) ? "none" : "1px solid #f1f5f9", 
                          background: isActive ? "rgba(41, 86, 215, 0.08)" : (index % 2 === 0 ? "#ffffff" : "rgba(248, 250, 252, 0.5)"),
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                        className="historical-row"
                      >
                        <td style={{ padding: "1rem", fontWeight: 700, color: isActive ? "var(--accent)" : "#1e293b" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.8rem", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "#64748b" }}>▶</span>
                            {formatMonthLabel(entry.month)}
                            {isActive && <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "var(--accent)", background: "rgba(41,86,215,0.1)", padding: "0.2rem 0.5rem", borderRadius: "999px" }}>Ativo</span>}
                          </span>
                        </td>
                        <td style={{ padding: "1rem", color: "#334155" }}>{formatNumber(entry.newCustomers)}</td>
                        <td style={{ padding: "1rem", color: "#334155" }}>{formatCurrency(entry.spend)}</td>
                        <td style={{ padding: "1rem", color: "#334155", fontWeight: 500 }}>{formatCac(entry.cac)}</td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: "#f8fafc" }}>
                          <td colSpan={4} style={{ padding: "0 0 1.5rem 0" }}>
                            <div style={{ padding: "1.25rem", borderLeft: "4px solid var(--accent)", marginLeft: "1rem", marginRight: "1rem", background: "#ffffff", borderRadius: "0 0 16px 16px", boxShadow: "inset 0 4px 6px -1px rgba(0,0,0,0.05)" }}>
                              <h5 style={{ fontSize: "0.85rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
                                Clientes de {formatMonthLabel(entry.month)}
                              </h5>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {monthCustomers.map(customer => (
                                  <div key={customer.customerId} style={{ display: "grid", gridTemplateColumns: "100px 1fr 120px 100px auto", gap: "1rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "10px", alignItems: "center", border: "1px solid #f1f5f9" }}>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#64748b" }}>{customer.customerCode}</span>
                                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#1e293b" }}>{customer.displayName}</span>
                                    <span style={{ fontSize: "0.8rem", color: "#475569" }}>{formatDate(customer.firstOrderDate)}</span>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }}>{formatCurrency(customer.firstOrderAmount)}</span>
                                    <div style={{ textAlign: "right" }}>
                                      <Link to={`/clientes/${customer.customerId}`} className="premium-btn" style={{ fontSize: "0.75rem" }}>Abrir</Link>
                                    </div>
                                  </div>
                                ))}
                                {monthCustomers.length === 0 && <p style={{ textAlign: "center", padding: "1rem", color: "#94a3b8" }}>Nenhum cliente registrado.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

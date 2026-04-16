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
  const [activeTab, setActiveTab] = useState<"current" | "history" | "charts">("current");
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const dashboardQuery = useQuery({
    queryKey: ["reactivation-dashboard"],
    queryFn: () => api.dashboard(token!),
    enabled: Boolean(token),
  });

  if (dashboardQuery.isLoading) {
    return <div className="page-loading">Carregando ranking de reativacao...</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <div className="page-error">Nao foi possivel carregar o ranking de reativacao.</div>;
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
    if (!acc[entry.month]) acc[entry.month] = [];
    acc[entry.month].push(entry);
    return acc;
  }, {} as Record<string, typeof dashboardQuery.data.reactivationHistory>) || {};

  const formatMonthKey = (dateStr: string) => {
    try {
      const monthStr = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(dateStr));
      return monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
    } catch {
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
      const dataPoint: Record<string, any> = {
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

  const getRankColor = (index: number) => {
    if (index === 0) return "var(--warning)"; // Ouro
    if (index === 1) return "var(--muted)"; // Prata
    if (index === 2) return "#cd7f32"; // Bronze
    return "transparent";
  };

  const getRankBg = (index: number) => {
    if (index === 0) return "var(--warning)";
    if (index === 1) return "var(--muted)";
    if (index === 2) return "#cd7f32";
    return "var(--bg-soft)";
  };

  const getRankText = (index: number) => {
    if (index <= 2) return "#ffffff";
    return "var(--text)";
  };

  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "0.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: "0.2rem" }}>
            Ranking de Reativação
          </p>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Recuperadoras de Ouro</h2>
        </div>
        <button
          onClick={() => setIsCompactMode(!isCompactMode)}
          style={{
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
          }}
        >
          <Camera size={16} />
          {isCompactMode ? "Expandir Detalhes" : "Versão Print (Compactar)"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--line)" }}>
        <button
          onClick={() => setActiveTab("current")}
          style={{
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
          }}
        >
          <Award size={18} />
          Desempenho Mês Atual
        </button>
        <button
          onClick={() => setActiveTab("history")}
          style={{
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
          }}
        >
          <History size={18} />
          Histórico (Mês a Mês)
        </button>
        <button
          onClick={() => setActiveTab("charts")}
          style={{
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
          }}
        >
          <TrendingUp size={18} />
          Gráficos
        </button>
      </div>

      {activeTab === "current" && (
        <>
          <div className="stats-grid" style={{ display: isCompactMode ? "none" : "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", paddingBottom: "1rem" }}>
        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Mês analisado</p>
            <div style={{ background: "rgba(110, 127, 159, 0.1)", padding: "0.35rem", borderRadius: "8px" }}>
              <Calendar size={16} color="var(--muted)" />
            </div>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong style={{ display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }}>{monthLabel}</strong>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--muted)" }}>Período do placar consolidado</p>
          </div>
        </div>

        <div className="stat-card" style={{ background: "rgba(47, 157, 103, 0.04)", border: "1px solid rgba(47, 157, 103, 0.2)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "3px", background: "var(--success)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Recuperados</p>
            <div style={{ background: "rgba(47, 157, 103, 0.15)", padding: "0.35rem", borderRadius: "8px" }}>
              <UserCheck size={16} color="var(--success)" />
            </div>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong style={{ display: "block", fontSize: "1.5rem", color: "var(--success)", lineHeight: "1.1", marginBottom: "0.2rem" }}>{formatNumber(totalRecoveredCustomers)}</strong>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--success)", fontWeight: 500, opacity: 0.85, lineHeight: "1.2" }}>
              Inativos +90 dias
            </p>
          </div>
        </div>

        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Faturamento</p>
            <div style={{ background: "rgba(41, 86, 215, 0.08)", padding: "0.35rem", borderRadius: "8px" }}>
              <TrendingUp size={16} color="var(--accent)" />
            </div>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong style={{ display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }}>{formatCurrency(totalRecoveredRevenue)}</strong>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--muted)" }}>Retornado ao caixa</p>
          </div>
        </div>

        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Peças Vendidas</p>
            <div style={{ background: "rgba(110, 127, 159, 0.1)", padding: "0.35rem", borderRadius: "8px" }}>
              <ShoppingBag size={16} color="var(--muted)" />
            </div>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong style={{ display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }}>{formatNumber(totalRecoveredItems)}</strong>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--muted)" }}>Total em produtos</p>
          </div>
        </div>

        <div className="stat-card" style={{ background: "#ffffff", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Equipe Ativa</p>
            <div style={{ background: "rgba(110, 127, 159, 0.1)", padding: "0.35rem", borderRadius: "8px" }}>
              <Users size={16} color="var(--muted)" />
            </div>
          </div>
          <div style={{ marginTop: "0.25rem" }}>
            <strong style={{ display: "block", fontSize: "1.25rem", color: "var(--text)", lineHeight: "1.1", marginBottom: "0.2rem" }}>{formatNumber(leaderboard.length)}</strong>
            <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--muted)" }}>Com reativação no mês</p>
          </div>
        </div>
      </div>

      <section className="panel" style={{ padding: "0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          className="panel-header"
          style={{ padding: "1.5rem 1.5rem 1.25rem", borderBottom: "1px solid var(--line)", background: "transparent" }}
        >
          <div>
            <h3 style={{ fontSize: "1.2rem", margin: 0 }}>Placar Consolidado</h3>
            <p className="panel-subcopy" style={{ marginTop: "0.3rem" }}>
              Detalhamento da conversão por consultor e seus respectivos clientes reativados.
            </p>
          </div>
        </div>

        {leaderboard.length ? (
          <div className="leaderboard-list" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", background: "var(--bg-soft)" }}>
            {leaderboard.map((entry, index) => (
              <article key={`${entry.attendant}-${index}`} className="leaderboard-card" style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", boxShadow: index === 0 ? "0 4px 20px rgba(208, 154, 41, 0.15)" : "0 4px 15px rgba(0,0,0,0.03)", border: index === 0 ? "2px solid rgba(208, 154, 41, 0.4)" : "1px solid var(--line)" }}>
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", 
                    padding: isCompactMode ? "0.75rem 1.5rem" : "1.25rem 1.5rem", 
                    background: index === 0 ? "linear-gradient(to right, rgba(208, 154, 41, 0.08), transparent)" : index === 1 ? "linear-gradient(to right, rgba(110, 127, 159, 0.06), transparent)" : index === 2 ? "linear-gradient(to right, rgba(205, 127, 50, 0.06), transparent)" : "transparent",
                    borderBottom: isCompactMode ? "none" : "1px solid var(--line)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                    <div style={{ 
                        background: getRankBg(index), 
                        color: getRankText(index),
                        width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontWeight: "bold", fontSize: "1rem",
                        boxShadow: index <= 2 ? "0 4px 10px rgba(0,0,0,0.1)" : "none"
                    }}>
                        {index === 0 ? <Award size={20}/> : index === 1 ? <Medal size={20}/> : index === 2 ? <Medal size={20}/> : `${index + 1}º`}
                    </div>
                    <div>
                      <strong style={{ color: index === 0 ? "var(--warning)" : "var(--text)", fontSize: "1.1rem" }}>{entry.attendant}</strong>
                      <span style={{ display: "block", fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                        <strong style={{ color: "var(--text)" }}>{formatNumber(entry.recoveredCustomers)}</strong> clientes recuperados
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Faturamento Gerado</span>
                    <strong style={{ display: "block", color: "var(--success)", fontSize: "1.25rem", marginTop: "0.2rem" }}>{formatCurrency(entry.recoveredRevenue)}</strong>
                  </div>
                </div>

                {!isCompactMode && (
                  <div style={{ padding: "0" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", tableLayout: "fixed" }}>
                      <thead>
                        <tr style={{ background: "rgba(0,0,0,0.015)", borderBottom: "1px solid var(--line)" }}>
                          <th style={{ width: "45%", textAlign: "left", padding: "0.85rem 1.5rem", fontWeight: 600, color: "var(--muted)" }}>Cliente Reativado</th>
                          <th style={{ width: "20%", textAlign: "center", padding: "0.85rem 1.5rem", fontWeight: 600, color: "var(--muted)" }}>Período Inativo</th>
                          <th style={{ width: "25%", textAlign: "right", padding: "0.85rem 1.5rem", fontWeight: 600, color: "var(--muted)" }}>Pedido de Retorno</th>
                          <th style={{ width: "10%", minWidth: "90px", padding: "0.85rem 1.5rem", textAlign: "right" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.recoveredClients.map((client, cIdx) => (
                          <tr key={`${entry.attendant}-${client.customerId}`} style={{ borderBottom: cIdx === entry.recoveredClients.length - 1 ? "none" : "1px solid var(--line)" }}>
                            <td style={{ padding: "1rem 1.5rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <strong style={{ color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {client.displayName}
                                </strong>
                                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "monospace", marginTop: "0.2rem" }}>{client.customerCode || "Sem código"}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: "center", padding: "1rem 1.5rem" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", padding: "0.25rem 0.75rem", background: client.daysInactiveBeforeReturn > 90 ? "rgba(217, 83, 79, 0.08)" : "rgba(41, 86, 215, 0.06)", color: client.daysInactiveBeforeReturn > 90 ? "var(--danger)" : "var(--accent)", borderRadius: "14px", fontSize: "0.75rem", fontWeight: 600 }}>
                                {formatNumber(client.daysInactiveBeforeReturn)} dias
                              </span>
                            </td>
                            <td style={{ textAlign: "right", padding: "1rem 1.5rem", fontWeight: 600, color: "var(--success)", whiteSpace: "nowrap", fontSize: "0.9rem" }}>
                              {formatCurrency(client.reactivatedOrderAmount)}
                            </td>
                            <td style={{ textAlign: "right", padding: "1rem 1.5rem" }}>
                              <Link
                                to={`/clientes/${client.customerId}`}
                                style={{
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
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = "var(--accent)";
                                  e.currentTarget.style.color = "#fff";
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = "rgba(41,86,215,0.06)";
                                  e.currentTarget.style.color = "var(--accent)";
                                }}
                              >
                                Abrir <ExternalLink size={14} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "3rem" }}>
            Ainda não houve reativação registrada neste mês.
          </div>
        )}
      </section>
        </>
      )}

      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {Object.entries(historyByMonth).length === 0 ? (
            <div className="empty-state" style={{ padding: "3rem" }}>
              Ainda não há dados históricos de reativação disponíveis.
            </div>
          ) : (
            Object.entries(historyByMonth).map(([month, entries]) => (
              <section key={month} className="panel" style={{ padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }}>
                <div className="panel-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }}>
                  <h3 style={{ fontSize: "1.2rem", margin: 0, textTransform: "capitalize", color: "var(--accent)" }}>
                    <Calendar size={18} style={{ display: "inline", marginBottom: "-3px", marginRight: "6px" }}/>
                    {formatMonthKey(month)}
                  </h3>
                </div>
                <div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left", background: "var(--bg-soft)", color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <th style={{ padding: "1rem 1.5rem", fontWeight: 600, width: "100px" }}>Posição</th>
                        <th style={{ padding: "1rem 1.5rem", fontWeight: 600 }}>Consultora</th>
                        <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "center" }}>Recuperados</th>
                        <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "center" }}>Peças</th>
                        <th style={{ padding: "1rem 1.5rem", fontWeight: 600, textAlign: "right" }}>Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => {
                        const rowKey = `${month}-${entry.attendant}`;
                        const isExpanded = !!expandedHistory[rowKey];
                        
                        return (
                        <Fragment key={entry.attendant}>
                          <tr 
                            onClick={() => setExpandedHistory(prev => ({ ...prev, [rowKey]: !isExpanded }))}
                            style={{ borderBottom: isExpanded ? "none" : "1px solid var(--line)", cursor: "pointer", background: isExpanded ? "rgba(41,86,215,0.02)" : "transparent", transition: "all 0.2s" }}
                          >
                            <td style={{ padding: "1rem 1.5rem" }}>
                              <div style={{ 
                                  background: getRankBg(idx), 
                                  color: getRankText(idx),
                                  width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontWeight: "bold", fontSize: "0.85rem",
                                  boxShadow: idx <= 2 ? "0 4px 10px rgba(0,0,0,0.1)" : "none"
                              }}>
                                  {idx === 0 ? <Award size={16}/> : idx <= 2 ? <Medal size={16}/> : `${idx + 1}º`}
                              </div>
                            </td>
                            <td style={{ padding: "1rem 1.5rem", fontWeight: 600, color: idx === 0 ? "var(--warning)" : "var(--text)", fontSize: "1.05rem" }}>
                              {entry.attendant}
                            </td>
                            <td style={{ padding: "1rem 1.5rem", textAlign: "center", color: "var(--success)", fontWeight: 600 }}>
                              {formatNumber(entry.recoveredCustomers)}
                            </td>
                            <td style={{ padding: "1rem 1.5rem", textAlign: "center", color: "var(--text)" }}>
                              {formatNumber(entry.recoveredItems)}
                            </td>
                            <td style={{ padding: "1rem 1.5rem", textAlign: "right", color: "var(--success)", fontWeight: 700, fontSize: "1.1rem" }}>
                              {formatCurrency(entry.recoveredRevenue)}
                            </td>
                          </tr>
                          {isExpanded && entry.recoveredClients && (
                            <tr style={{ borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }}>
                              <td colSpan={5} style={{ padding: "0 1.5rem 1.5rem 1.5rem" }}>
                                <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid var(--line)", overflow: "hidden" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead>
                                      <tr style={{ background: "rgba(41,86,215,0.04)", fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                        <th style={{ padding: "0.75rem 1.25rem", textAlign: "left", fontWeight: 600 }}>Cliente</th>
                                        <th style={{ padding: "0.75rem 1.25rem", textAlign: "center", fontWeight: 600 }}>Tempo Inativo</th>
                                        <th style={{ padding: "0.75rem 1.25rem", textAlign: "center", fontWeight: 600 }}>Peças</th>
                                        <th style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 600 }}>Faturado</th>
                                        <th style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 600 }}></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {entry.recoveredClients.map((client) => (
                                        <tr key={client.customerId} style={{ borderBottom: "1px solid var(--line)" }}>
                                          <td style={{ padding: "0.75rem 1.25rem" }}>
                                            <strong style={{ display: "block", color: "var(--text)", fontSize: "0.9rem" }}>{client.displayName}</strong>
                                            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{client.customerCode}</span>
                                          </td>
                                          <td style={{ textAlign: "center", padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                                            {client.daysInactiveBeforeReturn} dias
                                          </td>
                                          <td style={{ textAlign: "center", padding: "0.75rem 1.25rem", fontSize: "0.85rem", color: "var(--text)" }}>
                                            {client.reactivatedItems || 0}
                                          </td>
                                          <td style={{ textAlign: "right", padding: "0.75rem 1.25rem", color: "var(--success)", fontWeight: 600, fontSize: "0.9rem" }}>
                                            {formatCurrency(client.reactivatedOrderAmount)}
                                          </td>
                                          <td style={{ textAlign: "right", padding: "0.75rem 1.25rem" }}>
                                            <Link
                                              to={`/clientes/${client.customerId}`}
                                              onClick={(e) => e.stopPropagation()}
                                              style={{
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
                                              }}
                                            >
                                              Abrir <ExternalLink size={12} />
                                            </Link>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
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
            ))
          )}
        </div>
      )}

      {activeTab === "charts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <section className="panel" style={{ padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }}>
            <div className="panel-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }}>
              <h3 style={{ fontSize: "1.2rem", margin: 0, color: "var(--text)" }}>
                Evolução do Faturamento de Reativação
              </h3>
            </div>
            <div style={{ height: 350, width: "100%", padding: "1.5rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="monthKey" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: "var(--muted)" }}
                    tickFormatter={(value) => `R$ ${(value / 1000)}k`}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: "var(--text)", fontWeight: 600, marginBottom: "0.5rem" }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '1rem' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
                  <Area type="monotone" name="Faturamento (R$)" dataKey="Faturamento" stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorFaturamento)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel" style={{ padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }}>
            <div className="panel-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }}>
              <h3 style={{ fontSize: "1.2rem", margin: 0, color: "var(--text)" }}>
                Volume de Conversão: Clientes vs Peças
              </h3>
            </div>
            <div style={{ height: 350, width: "100%", padding: "1.5rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="monthKey" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                  <YAxis 
                    yAxisId="left"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: "var(--muted)" }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: "var(--muted)" }}
                  />
                  <Tooltip 
                    labelStyle={{ color: "var(--text)", fontWeight: 600, marginBottom: "0.5rem" }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '1rem' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
                  <Bar yAxisId="left" dataKey="Clientes" name="Clientes Recuperados" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  <Bar yAxisId="right" dataKey="Peças" name="Peças Vendidas" fill="#d09a29" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel" style={{ padding: "0", background: "#fff", border: "1px solid var(--line)", overflow: "hidden" }}>
            <div className="panel-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--line)", background: "rgba(41,86,215,0.02)" }}>
              <h3 style={{ fontSize: "1.2rem", margin: 0, color: "var(--text)" }}>
                Evolução de Clientes Recuperados por Consultora
              </h3>
            </div>
            <div style={{ height: 350, width: "100%", padding: "1.5rem" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendantLineChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="monthKey" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--muted)" }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: "var(--muted)" }}
                  />
                  <Tooltip 
                    labelStyle={{ color: "var(--text)", fontWeight: 600, marginBottom: "0.5rem" }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '1rem' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: "20px" }} />
                  {uniqueAttendants.map((attendant, index) => (
                    <Line 
                      key={attendant}
                      type="monotone"
                      dataKey={attendant}
                      name={attendant}
                      stroke={chartColors[index % chartColors.length]}
                      strokeWidth={3}
                      activeDot={{ r: 6 }}
                      dot={{ r: 3, strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

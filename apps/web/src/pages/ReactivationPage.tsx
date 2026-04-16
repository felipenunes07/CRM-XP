import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, formatShortDate } from "../lib/format";

function formatMonthLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const year = match?.[1];
  const month = match?.[2];

  if (!year || !month) {
    return value;
  }

  return `${month}/${year.slice(2)}`;
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
    <div className="chart-tooltip">
      <strong>{formatDate(label)}</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span>clientes na primeira compra</span>
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
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span>clientes novos no mes</span>
      </div>
    </div>
  );
}

function ReactivationGoldPage() {
  const { token } = useAuth();
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

  const leaderboard = dashboardQuery.data.reactivationLeaderboard;
  const totalRecoveredCustomers = leaderboard.reduce((sum, entry) => sum + entry.recoveredCustomers, 0);
  const totalRecoveredRevenue = leaderboard.reduce((sum, entry) => sum + entry.recoveredRevenue, 0);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: "0.2rem" }}>
            Ranking de reativacao
          </p>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Recuperadoras de Ouro</h2>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Mes analisado</h3>
          </div>
          <div className="stat-card-body">
            <strong>{monthLabel}</strong>
            <p className="stat-card-helper">Primeira reativacao no mes</p>
          </div>
        </div>
        <div className="stat-card tone-success">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Clientes recuperados</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(totalRecoveredCustomers)}</strong>
            <p className="stat-card-helper">Soma total do ranking</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Faturamento reativado</h3>
          </div>
          <div className="stat-card-body">
            <strong style={{ color: "var(--success)" }}>{formatCurrency(totalRecoveredRevenue)}</strong>
            <p className="stat-card-helper">Soma de pedidos de retorno</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Equipe ativa</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(leaderboard.length)}</strong>
            <p className="stat-card-helper">Atendentes com reativacao</p>
          </div>
        </div>
      </div>

      <section className="panel" style={{ padding: "0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div
          className="panel-header"
          style={{ padding: "1.25rem 1.25rem 1rem 1.25rem", borderBottom: "1px solid var(--line)", background: "transparent" }}
        >
          <div>
            <h3 style={{ fontSize: "1.2rem", margin: 0 }}>Placar Consolidado</h3>
            <p className="panel-subcopy" style={{ marginTop: "0.3rem" }}>
              Detalhamento da conversao por consultor e seus respectivos clientes reativados.
            </p>
          </div>
        </div>

        {leaderboard.length ? (
          <div className="leaderboard-list" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {leaderboard.map((entry, index) => (
              <article key={`${entry.attendant}-${index}`} className="leaderboard-card">
                <div className="leaderboard-card-header">
                  <div className="leaderboard-rank">#{index + 1}</div>
                  <div className="leaderboard-copy">
                    <strong style={index === 0 ? { color: "var(--accent)" } : {}}>{entry.attendant}</strong>
                    <span>{formatNumber(entry.recoveredCustomers)} clientes recuperados</span>
                  </div>
                  <div className="leaderboard-metric">
                    <span>Faturamento gerado</span>
                    <strong style={{ color: "var(--success)" }}>{formatCurrency(entry.recoveredRevenue)}</strong>
                  </div>
                </div>

                <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--line)", paddingTop: "0.5rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ color: "var(--muted)" }}>
                        <th style={{ width: "45%", textAlign: "left", padding: "0.4rem 0.5rem", fontWeight: 600 }}>Cliente</th>
                        <th style={{ width: "20%", textAlign: "center", padding: "0.4rem 0.5rem", fontWeight: 600 }}>Inativo por</th>
                        <th style={{ width: "25%", textAlign: "right", padding: "0.4rem 0.5rem", fontWeight: 600 }}>Pedido Retorno</th>
                        <th style={{ width: "10%", minWidth: "60px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.recoveredClients.map((client) => (
                        <tr key={`${entry.attendant}-${client.customerId}`} style={{ borderBottom: "1px solid rgba(41,86,215,0.05)" }}>
                          <td style={{ padding: "0.6rem 0.5rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <strong
                                style={{ color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                              >
                                {client.displayName}
                              </strong>
                              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{client.customerCode || "Sem codigo"}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: "center", padding: "0.6rem 0.5rem", color: "var(--text)", whiteSpace: "nowrap" }}>
                            {formatNumber(client.daysInactiveBeforeReturn)} dias
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "0.6rem 0.5rem",
                              fontWeight: 600,
                              color: "var(--success)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatCurrency(client.reactivatedOrderAmount)}
                          </td>
                          <td style={{ textAlign: "right", padding: "0.6rem 0.5rem" }}>
                            <Link
                              to={`/clientes/${client.customerId}`}
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--accent)",
                                textDecoration: "none",
                                fontWeight: 600,
                                padding: "0.2rem 0.4rem",
                                border: "1px solid rgba(41,86,215,0.15)",
                                borderRadius: "4px",
                              }}
                            >
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "3rem" }}>
            Ainda nao houve reativacao registrada neste mes.
          </div>
        )}
      </section>
    </div>
  );
}

function NewCustomersPage() {
  const { token } = useAuth();
  const acquisitionQuery = useQuery({
    queryKey: ["acquisition-dashboard"],
    queryFn: () => api.acquisition(token!),
    enabled: Boolean(token),
  });

  if (acquisitionQuery.isLoading) {
    return <div className="page-loading">Carregando clientes novos...</div>;
  }

  if (acquisitionQuery.isError || !acquisitionQuery.data) {
    return <div className="page-error">Nao foi possivel carregar os dados de clientes novos.</div>;
  }

  const data = acquisitionQuery.data;

  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: "0.2rem" }}>
            Aquisição por primeira compra
          </p>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Clientes novos</h2>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card tone-success">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Novos hoje</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(data.summary.today)}</strong>
            <p className="stat-card-helper">Primeira compra registrada hoje</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Novos ontem</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(data.summary.yesterday)}</strong>
            <p className="stat-card-helper">Comparativo imediato</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Novos no mes</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(data.summary.currentMonth)}</strong>
            <p className="stat-card-helper">Contra {formatNumber(data.summary.previousMonth)} no mes anterior</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Total historico</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(data.summary.historicalTotal)}</strong>
            <p className="stat-card-helper">Clientes contados uma unica vez</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: "1rem" }}>
        <section className="panel">
          <div className="panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", margin: 0 }}>Clientes novos por dia</h3>
              <p className="panel-subcopy" style={{ marginTop: "0.3rem" }}>
                Leitura diaria dos ultimos 30 dias para acompanhar a aquisicao recente.
              </p>
            </div>
          </div>
          <div style={{ width: "100%", height: "260px" }}>
            <ResponsiveContainer>
              <LineChart data={data.dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip content={<DailyTooltip />} />
                <Line
                  type="monotone"
                  dataKey="newCustomers"
                  stroke="#2956d7"
                  strokeWidth={3}
                  dot={{ r: 3, strokeWidth: 0, fill: "#2956d7" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", margin: 0 }}>Clientes novos do mes</h3>
              <p className="panel-subcopy" style={{ marginTop: "0.3rem" }}>
                Lista atual de aquisicao para abrir o cadastro e revisar origem.
              </p>
            </div>
          </div>

          {data.recentCustomers.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {data.recentCustomers.map((customer) => (
                <article
                  key={customer.customerId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "0.75rem",
                    padding: "0.9rem 1rem",
                    border: "1px solid var(--line)",
                    borderRadius: "16px",
                    background: "rgba(249, 251, 255, 0.9)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", marginBottom: "0.2rem" }}>{customer.displayName}</strong>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.82rem" }}>
                      {customer.customerCode || "Sem codigo"} | 1a compra em {formatDate(customer.firstOrderDate)}
                    </span>
                    <span style={{ display: "block", color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.25rem" }}>
                      {customer.firstAttendant ? `Atendente: ${customer.firstAttendant}` : "Atendente nao informado"} |{" "}
                      {formatCurrency(customer.firstOrderAmount)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <Link
                      to={`/clientes/${customer.customerId}`}
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--accent)",
                        textDecoration: "none",
                        fontWeight: 700,
                        padding: "0.5rem 0.8rem",
                        border: "1px solid rgba(41,86,215,0.15)",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Abrir cliente
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              Ainda nao houve cliente novo neste mes.
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.15rem", margin: 0 }}>Historico mensal</h3>
            <p className="panel-subcopy" style={{ marginTop: "0.3rem" }}>
              Evolucao da aquisicao desde o primeiro mes com pedidos no CRM.
            </p>
          </div>
        </div>

        <div style={{ width: "100%", height: "250px", marginBottom: "1rem" }}>
          <ResponsiveContainer>
            <BarChart data={data.monthlySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthLabel}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip content={<MonthlyTooltip />} />
              <Bar dataKey="newCustomers" fill="#2f9d67" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>Mes</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>Clientes novos</th>
              </tr>
            </thead>
            <tbody>
              {data.monthlySeries
                .slice()
                .reverse()
                .map((entry) => (
                  <tr key={entry.month} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>{formatMonthLabel(entry.month)}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{formatNumber(entry.newCustomers)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ReactivationPage() {
  const [activeTab, setActiveTab] = useState<"reactivation" | "acquisition">("reactivation");

  return (
    <div className="page-stack">
      <div className="whatsapp-segmented-control" style={{ alignSelf: "flex-start", marginBottom: "0.5rem" }}>
        <button type="button" className={activeTab === "reactivation" ? "active" : ""} onClick={() => setActiveTab("reactivation")}>
          Reativacao
        </button>
        <button type="button" className={activeTab === "acquisition" ? "active" : ""} onClick={() => setActiveTab("acquisition")}>
          Clientes novos
        </button>
      </div>

      {activeTab === "reactivation" ? <ReactivationGoldPage /> : <NewCustomersPage />}
    </div>
  );
}

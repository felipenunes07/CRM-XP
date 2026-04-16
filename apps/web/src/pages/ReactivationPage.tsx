import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";

export function ReactivationPage() {
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

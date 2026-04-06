import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";

function statusClass(status: "ACTIVE" | "ATTENTION" | "INACTIVE") {
  if (status === "ACTIVE") {
    return "status-active";
  }

  if (status === "ATTENTION") {
    return "status-attention";
  }

  return "status-inactive";
}

function formatPriority(value: number) {
  return value.toFixed(1).replace(".", ",");
}

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
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Ranking de reativacao</p>
          <h2>Recuperadoras de Ouro</h2>
          <p>
            Veja quem mais trouxe clientes inativos de volta neste mes. O ranking considera a primeira volta do cliente
            no mes, quando o novo pedido aconteceu apos pelo menos 90 dias sem comprar.
          </p>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">Mes analisado</p>
          <strong>{monthLabel}</strong>
          <span>Primeira reativacao do cliente no mes</span>
        </article>
        <article className="stat-card tone-success">
          <p className="eyebrow">Clientes recuperados</p>
          <strong>{formatNumber(totalRecoveredCustomers)}</strong>
          <span>Total somado do ranking</span>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Faturamento reativado</p>
          <strong>{formatCurrency(totalRecoveredRevenue)}</strong>
          <span>Soma dos pedidos de retorno</span>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Atendentes no ranking</p>
          <strong>{formatNumber(leaderboard.length)}</strong>
          <span>Quem ja reativou clientes neste mes</span>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Placar do mes</p>
            <h3>Quem esta trazendo clientes mortos de volta</h3>
            <p className="panel-subcopy">
              Abaixo voce ve nao so o ranking, mas tambem quais clientes cada vendedora reativou, quando voltaram e
              quanto tempo ficaram sem comprar.
            </p>
          </div>
        </div>

        {leaderboard.length ? (
          <div className="leaderboard-list">
            {leaderboard.map((entry, index) => (
              <article key={`${entry.attendant}-${index}`} className={`leaderboard-card ${index === 0 ? "is-leader" : ""}`}>
                <div className="leaderboard-card-header">
                  <div className="leaderboard-rank">#{index + 1}</div>
                  <div className="leaderboard-copy">
                    <strong>{entry.attendant}</strong>
                    <span>{formatNumber(entry.recoveredCustomers)} clientes recuperados</span>
                  </div>
                  <div className="leaderboard-metric">
                    <span>Faturamento reativado</span>
                    <strong>{formatCurrency(entry.recoveredRevenue)}</strong>
                  </div>
                </div>

                <div className="reactivation-client-list">
                  {entry.recoveredClients.map((client) => (
                    <article key={`${entry.attendant}-${client.customerId}`} className="reactivation-client-card">
                      <div className="reactivation-client-main">
                        <div className="reactivation-client-copy">
                          <strong>{client.displayName}</strong>
                          <span>
                            {client.customerCode || "Sem codigo"} • voltou em {formatDate(client.reactivationOrderDate)}
                          </span>
                        </div>
                        <span className={`status-badge ${statusClass(client.status)}`}>{statusLabel(client.status)}</span>
                      </div>

                      <div className="reactivation-client-metrics">
                        <span>Ficou {formatNumber(client.daysInactiveBeforeReturn)} dias sem comprar</span>
                        <span>Pedido de retorno: {formatCurrency(client.reactivatedOrderAmount)}</span>
                        <span>Compra anterior: {formatDate(client.previousOrderDate)}</span>
                        <span>Prioridade atual: {formatPriority(client.priorityScore)}</span>
                      </div>

                      <div className="reactivation-client-actions">
                        <Link className="ghost-button" to={`/clientes/${client.customerId}`}>
                          Abrir cliente
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Ainda nao houve reativacao registrada neste mes.</div>
        )}
      </section>
    </div>
  );
}

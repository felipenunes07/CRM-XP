import { useState } from "react";
import type { TrendRangeAnalysisResponse } from "@olist-crm/shared";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useUiLanguage } from "../i18n";
import { formatCurrency, formatDate, formatNumber, getFormattingLocale } from "../lib/format";

type LossMetric = "revenue" | "pieces";

function formatLossMonthLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getFormattingLocale(), {
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: "ATTENTION" | "INACTIVE") {
  return status === "INACTIVE" ? "Inativo" : "Atencao";
}

function LossSeriesTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
  metric: LossMetric;
}) {
  const { tx } = useUiLanguage();

  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{formatLossMonthLabel(label)}</strong>
      <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.35rem" }}>
        {payload.map((entry) => (
          <div
            key={`${entry.name}-${entry.color}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
          >
            <span style={{ color: entry.color, fontWeight: 600 }}>{entry.name}</span>
            <strong>
              {metric === "revenue"
                ? formatCurrency(Number(entry.value ?? 0))
                : `${formatNumber(Number(entry.value ?? 0))} ${tx("pecas", "pieces")}`}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendRangeAnalysisPanel({
  analysis,
  isLoading,
  isError,
  onClearSelection,
}: {
  analysis?: TrendRangeAnalysisResponse;
  isLoading: boolean;
  isError: boolean;
  onClearSelection: () => void;
}) {
  const { tx } = useUiLanguage();
  const [lossMetric, setLossMetric] = useState<LossMetric>("revenue");

  if (isLoading) {
    return <div className="page-loading">{tx("Montando a analise do periodo...", "Loading period analysis...")}</div>;
  }

  if (isError || !analysis) {
    return <div className="page-error">{tx("Nao foi possivel montar a analise do periodo.", "Could not load the period analysis.")}</div>;
  }

  const { selection, summary, lostCustomers, recoveredSummary, monthlyLossSeries } = analysis;
  const hasCohort = summary.totalCustomers > 0;

  return (
    <section className="panel period-loss-panel">
      <div className="panel-header period-loss-panel__header">
        <div>
          <p className="eyebrow">{tx("Analise por periodo", "Period analysis")}</p>
          <h3>
            {tx("Quem entrou em atencao ou inativo nesse recorte", "Who turned attention or inactive in this range")}
          </h3>
          <p className="panel-subcopy">
            {tx(
              "O recorte inclui quem ficou em Atencao ou Inativo em qualquer dia do periodo. A tabela destaca so quem nao fez nenhum pedido depois do fim da faixa.",
              "The cohort includes anyone who was attention or inactive on any day in the selected range. The table keeps only customers with no orders after the end of the range.",
            )}
          </p>
        </div>
        <button className="ghost-button" type="button" onClick={onClearSelection}>
          {tx("Limpar analise", "Clear analysis")}
        </button>
      </div>

      <div className="period-loss-selection-chip">
        <strong>{formatDate(selection.startDate)}</strong>
        <span>ate</span>
        <strong>{formatDate(selection.endDate)}</strong>
      </div>

      {!hasCohort ? (
        <div className="empty-state">
          {tx(
            "Nenhum cliente entrou em Atencao ou Inativo dentro do periodo selecionado.",
            "No customer entered attention or inactive during the selected range.",
          )}
        </div>
      ) : (
        <>
          <div className="period-loss-summary-grid">
            <article className="period-loss-summary-card">
              <span>{tx("Clientes no recorte", "Customers in cohort")}</span>
              <strong>{formatNumber(summary.totalCustomers)}</strong>
            </article>
            <article className="period-loss-summary-card tone-warning">
              <span>{tx("Ficaram em atencao", "Attention in range")}</span>
              <strong>{formatNumber(summary.attentionCustomers)}</strong>
            </article>
            <article className="period-loss-summary-card tone-danger">
              <span>{tx("Ficaram inativos", "Inactive in range")}</span>
              <strong>{formatNumber(summary.inactiveCustomers)}</strong>
            </article>
            <article className="period-loss-summary-card tone-danger">
              <span>{tx("Nao voltaram depois", "Never returned")}</span>
              <strong>{formatNumber(summary.neverReturnedCustomers)}</strong>
            </article>
            <article className="period-loss-summary-card">
              <span>{tx("Ticket medio do grupo", "Cohort average ticket")}</span>
              <strong>{formatCurrency(summary.averageTicket)}</strong>
            </article>
            <article className="period-loss-summary-card tone-danger">
              <span>{tx("Perda mensal estimada", "Estimated monthly loss")}</span>
              <strong>{formatCurrency(summary.estimatedMonthlyRevenueLoss)}</strong>
            </article>
            <article className="period-loss-summary-card tone-danger">
              <span>{tx("Pecas perdidas por mes", "Estimated pieces lost per month")}</span>
              <strong>{formatNumber(summary.estimatedMonthlyPiecesLoss)}</strong>
            </article>
          </div>

          <div className="period-loss-recovered-card">
            <div>
              <span className="eyebrow">{tx("Clientes que voltaram depois", "Customers who came back later")}</span>
              <strong>{formatNumber(recoveredSummary.recoveredCustomers)}</strong>
            </div>
            <div>
              <span>{tx("Faturamento recuperado", "Recovered revenue")}</span>
              <strong>{formatCurrency(recoveredSummary.recoveredRevenue)}</strong>
            </div>
            <div>
              <span>{tx("Pecas recuperadas", "Recovered pieces")}</span>
              <strong>{formatNumber(recoveredSummary.recoveredPieces)}</strong>
            </div>
          </div>

          <article className="period-loss-chart-card">
            <div className="panel-header" style={{ marginBottom: "1rem" }}>
              <div>
                <p className="eyebrow">{tx("Serie mensal", "Monthly series")}</p>
                <h4>{tx("Esperado x realizado apos o corte", "Expected vs actual after cutoff")}</h4>
                <p className="panel-subcopy">
                  {tx(
                    "A linha compara o baseline mensal do grupo com o que esses clientes realmente geraram depois do periodo.",
                    "The line compares the cohort monthly baseline against what those customers actually generated after the selected period.",
                  )}
                </p>
              </div>
              <div className="period-loss-chart-toggle" role="tablist" aria-label={tx("Alternar leitura da perda mensal", "Switch monthly loss metric")}>
                <button
                  type="button"
                  className={`chart-switch-button ${lossMetric === "revenue" ? "active" : ""}`}
                  onClick={() => setLossMetric("revenue")}
                >
                  <strong>{tx("Faturamento", "Revenue")}</strong>
                </button>
                <button
                  type="button"
                  className={`chart-switch-button ${lossMetric === "pieces" ? "active" : ""}`}
                  onClick={() => setLossMetric("pieces")}
                >
                  <strong>{tx("Pecas", "Pieces")}</strong>
                </button>
              </div>
            </div>

            {monthlyLossSeries.length ? (
              <div className="trend-chart-wrap period-loss-series-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={monthlyLossSeries} margin={{ top: 12, right: 18, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={formatLossMonthLabel} stroke="#5f6f95" minTickGap={18} />
                    <YAxis
                      stroke="#5f6f95"
                      width={lossMetric === "revenue" ? 88 : 64}
                      tickFormatter={(value) =>
                        lossMetric === "revenue"
                          ? formatCurrency(Number(value)).replace(/\s/g, "")
                          : formatNumber(Number(value))
                      }
                    />
                    <Tooltip content={<LossSeriesTooltip metric={lossMetric} />} />
                    <Bar
                      dataKey={lossMetric === "revenue" ? "lostRevenue" : "lostPieces"}
                      name={lossMetric === "revenue" ? tx("Perdido", "Lost") : tx("Pecas perdidas", "Lost pieces")}
                      fill="#ef4444"
                      radius={[8, 8, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey={lossMetric === "revenue" ? "expectedRevenue" : "expectedPieces"}
                      name={lossMetric === "revenue" ? tx("Esperado", "Expected") : tx("Pecas esperadas", "Expected pieces")}
                      stroke="#2956d7"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={lossMetric === "revenue" ? "actualRevenue" : "actualPieces"}
                      name={lossMetric === "revenue" ? tx("Realizado", "Actual") : tx("Pecas reais", "Actual pieces")}
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state">
                {tx(
                  "Ainda nao ha meses fechados depois do fim do periodo para montar a serie mensal.",
                  "There are no closed months after the selected period yet.",
                )}
              </div>
            )}
          </article>

          <div className="panel-header" style={{ marginTop: "1.5rem" }}>
            <div>
              <p className="eyebrow">{tx("Clientes que nao voltaram", "Customers who never returned")}</p>
              <h4>{tx("Lista priorizada para reativacao", "Prioritized reactivation list")}</h4>
              <p className="panel-subcopy">
                {tx(
                  "Ordenado pelo potencial mensal perdido para ajudar o time a atacar primeiro quem mais pesa na carteira.",
                  "Sorted by estimated monthly loss so the team can start with the customers that weigh the most on the portfolio.",
                )}
              </p>
            </div>
          </div>

          {lostCustomers.length ? (
            <div className="period-loss-table-wrap">
              <table className="period-loss-table">
                <thead>
                  <tr>
                    <th>{tx("Cliente", "Customer")}</th>
                    <th>{tx("Codigo", "Code")}</th>
                    <th>{tx("Pior status", "Worst status")}</th>
                    <th>{tx("Primeira data critica", "First critical date")}</th>
                    <th>{tx("Ultima compra", "Last purchase")}</th>
                    <th>{tx("Dias sem comprar", "Days without buying")}</th>
                    <th>{tx("Ticket medio", "Average ticket")}</th>
                    <th>{tx("Total historico", "Lifetime spend")}</th>
                    <th>{tx("Ultimo atendente", "Last attendant")}</th>
                    <th>{tx("Fat. perdido/mes", "Revenue lost/month")}</th>
                    <th>{tx("Pecas perdidas/mes", "Pieces lost/month")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lostCustomers.map((customer) => (
                    <tr key={customer.customerId}>
                      <td>
                        <div className="period-loss-customer-cell">
                          <Link to={`/clientes/${customer.customerId}`}>{customer.displayName}</Link>
                        </div>
                      </td>
                      <td>{customer.customerCode || "--"}</td>
                      <td>
                        <span className={`status-badge status-${customer.worstStatus.toLowerCase()}`}>
                          {statusLabel(customer.worstStatus)}
                        </span>
                      </td>
                      <td>{formatDate(customer.firstCriticalDate)}</td>
                      <td>{customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "--"}</td>
                      <td>{customer.daysSinceLastPurchase !== null ? formatNumber(customer.daysSinceLastPurchase) : "--"}</td>
                      <td>{formatCurrency(customer.avgTicket)}</td>
                      <td>{formatCurrency(customer.totalSpent)}</td>
                      <td>{customer.lastAttendant || "--"}</td>
                      <td>{formatCurrency(customer.estimatedMonthlyRevenueLoss)}</td>
                      <td>{formatNumber(customer.estimatedMonthlyPiecesLoss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              {tx(
                "Todos os clientes do recorte voltaram a comprar depois do periodo selecionado.",
                "Every customer in the selected cohort bought again after the selected period.",
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

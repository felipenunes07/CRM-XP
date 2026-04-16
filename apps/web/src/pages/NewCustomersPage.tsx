import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const newCustomers = payload.find((entry) => entry.dataKey === "newCustomers")?.value ?? 0;
  const spend = payload.find((entry) => entry.dataKey === "spend")?.value ?? 0;

  return (
    <div className="chart-tooltip">
      <strong>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(newCustomers)}</strong>
        <span>clientes novos no mes</span>
      </div>
      <div className="chart-tooltip-count" style={{ marginTop: "0.35rem" }}>
        <strong>{formatCurrency(spend)}</strong>
        <span>gasto em anuncios</span>
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
  payload?: Array<{ value?: number | null }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count">
        <strong>{formatCac((payload[0]?.value as number | null | undefined) ?? null)}</strong>
        <span>custo por cliente adquirido</span>
      </div>
    </div>
  );
}

export function NewCustomersPage() {
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
  const monthlyTicks = buildMonthlyTicks(data.monthlySeries);

  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, marginBottom: "0.2rem" }}>
            Aquisicao por primeira compra
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
            <h3 className="stat-card-title">Novos no mes</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatNumber(data.summary.currentMonth)}</strong>
            <p className="stat-card-helper">Contra {formatNumber(data.summary.previousMonth)} no mes anterior</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">Gasto no mes</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatCurrency(data.summary.currentMonthSpend)}</strong>
            <p className="stat-card-helper">Contra {formatCurrency(data.summary.previousMonthSpend)} no mes anterior</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <h3 className="stat-card-title">CAC no mes</h3>
          </div>
          <div className="stat-card-body">
            <strong>{formatCac(data.summary.currentMonthCac)}</strong>
            <p className="stat-card-helper">Mes anterior: {formatCac(data.summary.previousMonthCac)}</p>
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
            <ComposedChart
              syncId="acquisition-history"
              syncMethod="value"
              data={data.monthlySeries}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
              <XAxis
                dataKey="month"
                ticks={monthlyTicks}
                tickFormatter={formatMonthLabel}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis
                yAxisId="customers"
                allowDecimals={false}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <YAxis
                yAxisId="spend"
                orientation="right"
                tickFormatter={(value: number) => formatCurrency(value)}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <Tooltip
                content={<MonthlyTooltip />}
                cursor={{ stroke: "rgba(41, 86, 215, 0.35)", strokeWidth: 2, strokeDasharray: "4 4" }}
              />
              <Bar yAxisId="customers" dataKey="newCustomers" fill="#2f9d67" radius={[8, 8, 0, 0]} />
              <Line
                yAxisId="spend"
                type="monotone"
                dataKey="spend"
                stroke="#2956d7"
                strokeWidth={3}
                dot={{ r: 2, strokeWidth: 0, fill: "#2956d7" }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "#ffffff", fill: "#2956d7" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginBottom: "0.9rem" }}>
          <h4 style={{ margin: 0, fontSize: "1rem" }}>Grafico de CAC</h4>
          <p className="panel-subcopy" style={{ marginTop: "0.25rem" }}>
            Evolucao mensal do custo por cliente novo com base no gasto do Meta Ads.
          </p>
        </div>

        <div style={{ width: "100%", height: "220px", marginBottom: "1rem" }}>
          <ResponsiveContainer>
            <LineChart
              syncId="acquisition-history"
              syncMethod="value"
              data={data.monthlySeries}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
              <XAxis
                dataKey="month"
                ticks={monthlyTicks}
                tickFormatter={formatMonthLabel}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis yAxisId="spacer" tick={false} tickLine={false} axisLine={false} width={48} />
              <YAxis
                yAxisId="cac"
                orientation="right"
                tickFormatter={(value: number) => formatCurrency(value)}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <Tooltip
                content={<CacTooltip />}
                cursor={{ stroke: "rgba(217, 119, 6, 0.35)", strokeWidth: 2, strokeDasharray: "4 4" }}
              />
              <Line
                yAxisId="cac"
                type="monotone"
                dataKey="cac"
                stroke="#d97706"
                strokeWidth={3}
                dot={{ r: 2, strokeWidth: 0, fill: "#d97706" }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "#ffffff", fill: "#d97706" }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>Mes</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>Clientes novos</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>Gasto</th>
                <th style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>CAC</th>
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
                    <td style={{ padding: "0.75rem 0.5rem" }}>{formatCurrency(entry.spend)}</td>
                    <td style={{ padding: "0.75rem 0.5rem" }}>{formatCac(entry.cac)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

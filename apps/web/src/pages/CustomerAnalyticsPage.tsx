import type { CustomerAnalyticsResponse, CustomerAnalyticsTimelinePoint, InsightTag } from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Mail,
  MapPin,
  PackageOpen,
  Phone,
  ReceiptText,
  Tag,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CustomerDetailNavigation } from "../components/CustomerDetailNavigation";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatMonthLabel, formatNumber, formatPercent, statusLabel } from "../lib/format";

type AnalyticsPeriod = 6 | 12 | 24 | "all";
type SalesMetric = "salesAmount" | "pieces" | "orderCount";

const salesMetricLabels: Record<SalesMetric, string> = {
  salesAmount: "Vendas",
  pieces: "Peças",
  orderCount: "Pedidos",
};

const salesMetricColors: Record<SalesMetric, string> = {
  salesAmount: "#2956d7",
  pieces: "#7252df",
  orderCount: "#169d84",
};

const insightLabels: Record<InsightTag, string> = {
  alto_valor: "Alto valor",
  reativacao: "Reativação",
  recorrente: "Recorrente",
  queda_frequencia: "Queda de frequência",
  risco_churn: "Risco de perda",
  compra_prevista_vencida: "Compra prevista vencida",
  novo_cliente: "Novo cliente",
};

export function calculateCustomerSalesTrend(timeline: CustomerAnalyticsTimelinePoint[]) {
  const recent = timeline.slice(-3);
  const previous = timeline.slice(-6, -3);
  if (!recent.length || !previous.length) {
    return { direction: "stable" as const, percent: null, label: "Histórico em formação" };
  }

  const recentAverage = recent.reduce((sum, point) => sum + point.salesAmount, 0) / recent.length;
  const previousAverage = previous.reduce((sum, point) => sum + point.salesAmount, 0) / previous.length;
  if (previousAverage <= 0) {
    return recentAverage > 0
      ? { direction: "up" as const, percent: 1, label: "Comprando mais" }
      : { direction: "stable" as const, percent: 0, label: "Sem mudança" };
  }

  const percent = (recentAverage - previousAverage) / previousAverage;
  if (percent > 0.05) return { direction: "up" as const, percent, label: "Comprando mais" };
  if (percent < -0.05) return { direction: "down" as const, percent, label: "Comprando menos" };
  return { direction: "stable" as const, percent, label: "Ritmo estável" };
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function AnalyticsTooltip({
  active,
  payload,
  label,
  currency = false,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  currency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="customer-analytics-tooltip">
      <strong>{label ? formatMonthLabel(label) : "Período"}</strong>
      {payload.map((entry) => (
        <span key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {currency ? formatCurrency(Number(entry.value ?? 0)) : formatNumber(Number(entry.value ?? 0))}
        </span>
      ))}
    </div>
  );
}

function CustomerAnalyticsView({ analytics }: { analytics: CustomerAnalyticsResponse }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(24);
  const [salesMetric, setSalesMetric] = useState<SalesMetric>("salesAmount");
  const trend = calculateCustomerSalesTrend(analytics.timeline);
  const timeline = period === "all" ? analytics.timeline : analytics.timeline.slice(-period);
  const maxPaymentType = Math.max(...analytics.paymentTypes.map((item) => item.amount), 1);
  const maxSeller = Math.max(...analytics.sellers.map((item) => item.salesAmount), 1);
  const location = [analytics.customer.city, analytics.customer.state].filter(Boolean).join(" / ") || "Não informado";
  const TrendIcon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : ArrowRight;

  return (
    <div className="page-stack customer-detail-page customer-analytics-page">
      <Link to="/clientes" className="customer-back-link"><ArrowLeft size={16} /> Voltar para clientes</Link>

      <section className="customer-detail-hero customer-analytics-hero">
        <div className="customer-identity">
          <div className="customer-avatar" aria-hidden="true"><ChartNoAxesCombined size={23} /></div>
          <div>
            <p className="eyebrow">Análise completa do cliente</p>
            <h1>{analytics.customer.displayName}</h1>
            <div className="customer-identity-meta">
              <span>{analytics.customer.customerCode || "Sem código"}</span>
              <span><MapPin size={14} /> {location}</span>
              <span><UserRound size={14} /> {analytics.customer.lastAttendant || "Sem vendedora"}</span>
            </div>
          </div>
        </div>
        <div className={`customer-analytics-trend is-${trend.direction}`}>
          <TrendIcon size={21} />
          <div><span>Últimos 3 meses</span><strong>{trend.label}</strong></div>
          {trend.percent !== null ? <em>{trend.percent >= 0 ? "+" : ""}{formatPercent(trend.percent)}</em> : null}
        </div>
      </section>

      <CustomerDetailNavigation customerId={analytics.customer.id} />

      <section className="customer-analytics-kpis" aria-label="Resumo histórico do cliente">
        <article><span><CircleDollarSign size={19} /></span><div><small>Total vendido</small><strong>{formatCurrency(analytics.sales.totalAmount)}</strong><em>{formatNumber(analytics.sales.totalOrders)} pedidos</em></div></article>
        <article><span><PackageOpen size={19} /></span><div><small>Peças compradas</small><strong>{formatNumber(analytics.sales.totalPieces)}</strong><em>Ticket {formatCurrency(analytics.sales.averageTicket)}</em></div></article>
        <article><span><Banknote size={19} /></span><div><small>Total pago</small><strong>{formatCurrency(analytics.payments.totalAmount)}</strong><em>{formatNumber(analytics.payments.totalPayments)} pagamentos</em></div></article>
        <article><span><WalletCards size={19} /></span><div><small>Saldo atual</small><strong>{analytics.credit ? formatCurrency(analytics.credit.balanceAmount) : "Sem dados"}</strong><em>{analytics.credit?.debtAmount ? `${formatCurrency(analytics.credit.debtAmount)} em aberto` : "Sem dívida registrada"}</em></div></article>
      </section>

      <div className="customer-analytics-period" role="group" aria-label="Período dos gráficos">
        <span>Período</span>
        {([6, 12, 24, "all"] as AnalyticsPeriod[]).map((option) => (
          <button key={option} type="button" className={period === option ? "active" : ""} onClick={() => setPeriod(option)}>
            {option === "all" ? "Tudo" : `${option}m`}
          </button>
        ))}
      </div>

      <section className="customer-analytics-charts">
        <article className="panel customer-analytics-chart-card">
          <header>
            <div><p className="eyebrow">Evolução de compras</p><h2>Está comprando mais ou menos?</h2></div>
            <div className="customer-analytics-metric-toggle" role="group" aria-label="Métrica de vendas">
              {(Object.keys(salesMetricLabels) as SalesMetric[]).map((metric) => (
                <button key={metric} type="button" className={salesMetric === metric ? "active" : ""} onClick={() => setSalesMetric(metric)}>{salesMetricLabels[metric]}</button>
              ))}
            </div>
          </header>
          {timeline.length ? (
            <div className="customer-analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeline} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="customerSalesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={salesMetricColors[salesMetric]} stopOpacity={0.28} /><stop offset="95%" stopColor={salesMetricColors[salesMetric]} stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} stroke="#71809d" minTickGap={18} />
                  <YAxis tickFormatter={compactNumber} stroke="#71809d" width={54} />
                  <Tooltip content={<AnalyticsTooltip currency={salesMetric === "salesAmount"} />} />
                  <Area type="monotone" dataKey={salesMetric} name={salesMetricLabels[salesMetric]} stroke={salesMetricColors[salesMetric]} strokeWidth={3} fill="url(#customerSalesGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="customer-list-empty">Ainda não há histórico de vendas para este cliente.</div>}
        </article>

        <article className="panel customer-analytics-chart-card">
          <header><div><p className="eyebrow">Fluxo financeiro</p><h2>Vendas x pagamentos</h2></div></header>
          {timeline.length ? (
            <div className="customer-analytics-chart-wrap">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeline} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={formatMonthLabel} stroke="#71809d" minTickGap={18} />
                  <YAxis tickFormatter={compactNumber} stroke="#71809d" width={54} />
                  <Tooltip content={<AnalyticsTooltip currency />} />
                  <Legend />
                  <Bar dataKey="salesAmount" name="Vendas" fill="#2956d7" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="paymentAmount" name="Pagamentos" fill="#18a685" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="customer-list-empty">Ainda não há movimentos suficientes para comparar.</div>}
        </article>
      </section>

      <section className="customer-analytics-details">
        <article className="panel customer-analytics-financial">
          <header><div><p className="eyebrow">Crédito e pagamentos</p><h2>Situação financeira</h2></div>{analytics.credit ? <span className={`customer-analytics-risk is-${(analytics.credit.riskLevel || "OK").toLowerCase()}`}>{analytics.credit.riskLevel}</span> : null}</header>
          {analytics.credit ? (
            <div className="customer-analytics-financial-grid">
              <div><span>Limite</span><strong>{formatCurrency(analytics.credit.creditLimit)}</strong></div>
              <div><span>Disponível</span><strong>{formatCurrency(analytics.credit.availableCreditAmount)}</strong></div>
              <div><span>Em aberto</span><strong>{formatCurrency(analytics.credit.debtAmount)}</strong></div>
              <div><span>Saldo a favor</span><strong>{formatCurrency(analytics.credit.creditBalanceAmount)}</strong></div>
              <div><span>Prazo</span><strong>{analytics.credit.paymentTerm ? `${analytics.credit.paymentTerm} dias` : "Não definido"}</strong></div>
              <div><span>Último pagamento</span><strong>{formatDate(analytics.payments.lastPaymentDate)}</strong></div>
            </div>
          ) : <div className="customer-list-empty">Cliente sem registro no snapshot financeiro atual.</div>}
          {analytics.credit?.observation ? <p className="customer-analytics-observation"><ReceiptText size={16} /> {analytics.credit.observation}</p> : null}
          {analytics.credit?.flags.length ? <div className="customer-insight-chips">{analytics.credit.flags.map((flag) => <span key={flag}>{flag}</span>)}</div> : null}
          <Link className="customer-analytics-deep-link" to={`/clientes/financeiro/${analytics.customer.id}`}>Abrir dossiê financeiro completo <ArrowRight size={15} /></Link>
        </article>

        <article className="panel customer-analytics-profile">
          <header><div><p className="eyebrow">Cadastro consolidado</p><h2>Dados do cliente</h2></div></header>
          <div className="customer-analytics-profile-list">
            <div><Phone size={16} /><span>Telefone</span><strong>{analytics.customer.phone || "Não informado"}</strong></div>
            <div><Mail size={16} /><span>E-mail</span><strong>{analytics.customer.email || "Não informado"}</strong></div>
            <div><MapPin size={16} /><span>Localização</span><strong>{location}</strong></div>
            <div><UserRound size={16} /><span>Vendedora recente</span><strong>{analytics.customer.lastAttendant || "Não informado"}</strong></div>
            <div><CalendarDays size={16} /><span>Cliente desde</span><strong>{formatDate(analytics.customer.customerSince)}</strong></div>
            <div><ShoppingBag size={16} /><span>Primeira compra</span><strong>{formatDate(analytics.sales.firstOrderDate)}</strong></div>
            <div><ShoppingBag size={16} /><span>Última compra</span><strong>{formatDate(analytics.behavior.lastPurchaseAt)}</strong></div>
            <div><CalendarDays size={16} /><span>Próxima compra prevista</span><strong>{formatDate(analytics.behavior.predictedNextPurchaseAt)}</strong></div>
            <div><ChartNoAxesCombined size={16} /><span>Status atual</span><strong>{statusLabel(analytics.customer.status)}</strong></div>
            <div><CalendarDays size={16} /><span>Sem comprar</span><strong>{formatDaysSince(analytics.behavior.daysSinceLastPurchase)}</strong></div>
            <div><ReceiptText size={16} /><span>Intervalo médio</span><strong>{analytics.behavior.averageDaysBetweenOrders === null ? "Sem base" : `${formatNumber(analytics.behavior.averageDaysBetweenOrders)} dias`}</strong></div>
            <div><ShoppingBag size={16} /><span>Compras em 90 dias</span><strong>{formatNumber(analytics.behavior.purchaseFrequency90d)}</strong></div>
            <div><ArrowDownRight size={16} /><span>Queda de frequência</span><strong>{formatPercent(analytics.behavior.frequencyDropRatio)}</strong></div>
            <div><ChartNoAxesCombined size={16} /><span>Prioridade / valor</span><strong>{formatNumber(analytics.behavior.priorityScore)} / {formatNumber(analytics.behavior.valueScore)}</strong></div>
          </div>
          {(analytics.behavior.primaryInsight || analytics.behavior.insightTags.length || analytics.behavior.labels.length) ? (
            <div className="customer-analytics-profile-tags">
              {analytics.behavior.primaryInsight ? <span className="is-insight"><ChartNoAxesCombined size={13} /> {insightLabels[analytics.behavior.primaryInsight]}</span> : null}
              {analytics.behavior.insightTags.filter((tag) => tag !== analytics.behavior.primaryInsight).map((tag) => <span className="is-insight" key={tag}>{insightLabels[tag]}</span>)}
              {analytics.behavior.labels.map((label) => <span key={label.id} style={{ borderColor: label.color, color: label.color }}><Tag size={13} /> {label.name}</span>)}
            </div>
          ) : null}
          {analytics.behavior.internalNotes ? <p className="customer-analytics-internal-notes"><ReceiptText size={16} /><span><strong>Observações internas</strong>{analytics.behavior.internalNotes}</span></p> : null}
        </article>
      </section>

      <section className="customer-analytics-breakdowns">
        <article className="panel">
          <header><div><p className="eyebrow">Relacionamento comercial</p><h2>Vendas por vendedora</h2></div></header>
          <div className="customer-analytics-bars">
            {analytics.sellers.length ? analytics.sellers.map((seller) => (
              <div key={seller.seller}>
                <div><strong>{seller.seller}</strong><span>{formatCurrency(seller.salesAmount)} · {formatNumber(seller.orderCount)} pedidos</span></div>
                <span className="customer-analytics-bar"><i style={{ width: `${Math.max(4, (seller.salesAmount / maxSeller) * 100)}%` }} /></span>
              </div>
            )) : <div className="customer-list-empty">Sem vendedora identificada no histórico.</div>}
          </div>
        </article>
        <article className="panel">
          <header><div><p className="eyebrow">Recebimentos</p><h2>Formas de pagamento</h2></div></header>
          <div className="customer-analytics-bars is-payment">
            {analytics.paymentTypes.length ? analytics.paymentTypes.map((payment) => (
              <div key={payment.paymentType}>
                <div><strong>{payment.paymentType}</strong><span>{formatCurrency(payment.amount)} · {formatNumber(payment.count)} pagamentos</span></div>
                <span className="customer-analytics-bar"><i style={{ width: `${Math.max(4, (payment.amount / maxPaymentType) * 100)}%` }} /></span>
              </div>
            )) : <div className="customer-list-empty">Sem pagamentos classificados no snapshot atual.</div>}
          </div>
        </article>
      </section>

      <section className="panel customer-analytics-products">
        <header><div><p className="eyebrow">Mix completo</p><h2>Produtos mais comprados</h2></div></header>
        <div className="customer-analytics-product-table" role="table" aria-label="Produtos mais comprados pelo cliente">
          <div role="row" className="customer-analytics-product-head"><span role="columnheader">Produto</span><span role="columnheader">Quantidade</span><span role="columnheader">Faturamento</span><span role="columnheader">Pedidos</span><span role="columnheader">Última compra</span></div>
          {analytics.products.map((product) => (
            <div role="row" key={product.sku ?? product.itemDescription} className="customer-analytics-product-row">
              <div role="cell"><strong>{product.itemDescription}</strong><span>{product.sku ? `SKU ${product.sku}` : "SKU não informado"}</span></div>
              <strong role="cell" data-label="Quantidade">{formatNumber(product.quantity)}</strong>
              <strong role="cell" data-label="Faturamento">{formatCurrency(product.salesAmount)}</strong>
              <span role="cell" data-label="Pedidos">{formatNumber(product.orderCount)}</span>
              <span role="cell" data-label="Última compra">{formatDate(product.lastOrderDate)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CustomerAnalyticsPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const analyticsQuery = useQuery({
    queryKey: ["customer-analytics", id],
    queryFn: () => api.customerAnalytics(token!, id!),
    enabled: Boolean(token && id),
  });

  if (analyticsQuery.isLoading) return <div className="page-loading">Preparando análises do cliente...</div>;
  if (analyticsQuery.isError || !analyticsQuery.data) return <div className="page-error">Não foi possível carregar as análises deste cliente.</div>;
  return <CustomerAnalyticsView analytics={analyticsQuery.data} />;
}

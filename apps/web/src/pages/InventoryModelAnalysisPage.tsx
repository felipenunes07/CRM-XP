import type {
  InventoryDailySeriesPoint,
  InventoryModelCustomerMonthlyPoint,
  InventoryModelDetailResponse,
  InventoryModelTopCustomer,
  InventoryProductKind,
} from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  MessageCircle,
  PackagePlus,
  Phone,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber, formatShortDate } from "../lib/format";
import "../components/inventorySales.css";

type AnalysisTab = "sales" | "history";
type CustomerFilter = "all" | "overdue" | "next_15" | "active" | "inactive";
type CustomerSort = "volume" | "opportunity" | "monthly" | "recent";

function productKindLabel(kind: InventoryProductKind) {
  if (kind === "DOC_DE_CARGA") return "DOC de carga";
  if (kind === "BATERIA") return "Bateria";
  return "Tela";
}

function formatMonthlyAverage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function daysSinceDate(value: string | null) {
  if (!value) return null;
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;

  const [year, month, day] = parts as [number, number, number];
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.floor((today - target) / 86_400_000));
}

function daysUntilDate(value: string | null) {
  if (!value) return null;
  const parts = value.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;

  const [year, month, day] = parts as [number, number, number];
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(year, month - 1, day);
  return Math.ceil((target - today) / 86_400_000);
}

function opportunityForCustomer(customer: InventoryModelTopCustomer) {
  const daysSincePurchase = daysSinceDate(customer.lastPurchaseAt);
  const daysUntilExpected = daysUntilDate(customer.predictedNextPurchaseAt);
  const potentialQuantity = Math.max(customer.averageOrderQuantity, customer.averageMonthlyQuantity, 1);
  const potentialRevenue = potentialQuantity * customer.averageUnitPrice;
  const overdueDays = daysUntilExpected !== null && daysUntilExpected < 0 ? Math.abs(daysUntilExpected) : 0;
  const isCold = (daysSincePurchase ?? 0) > 45;
  const isOverdue = overdueDays > 0 || (daysUntilExpected === null && isCold);
  const isNext15 = daysUntilExpected !== null && daysUntilExpected >= 0 && daysUntilExpected <= 15;

  let label = "Acompanhar";
  let tone = "attention";
  let action = "Reforce disponibilidade e confirme o próximo pedido.";
  let priority = 3;

  if (isOverdue) {
    label = overdueDays ? `Recompra atrasada ${overdueDays}d` : "Reativar agora";
    tone = "danger";
    action = "Contato imediato: o cliente já passou do ritmo normal de recompra.";
    priority = 0;
  } else if (isNext15) {
    label = daysUntilExpected === 0 ? "Recompra prevista hoje" : `Recompra em até ${daysUntilExpected}d`;
    tone = "warning";
    action = "Antecipe a necessidade e reserve quantidade antes do próximo pedido.";
    priority = 1;
  } else if (customer.quantity30Days > 0) {
    label = "Comprando agora";
    tone = "success";
    action = "Cliente ativo: ofereça reposição, aumento de volume ou combinação com outros itens.";
    priority = 4;
  } else if (isCold) {
    label = "Cliente esfriando";
    tone = "warning";
    action = "Investigue preço, qualidade e concorrência; leve uma condição de retorno.";
    priority = 2;
  }

  const opportunityScore = Math.round(
    overdueDays * 1.4
    + customer.averageMonthlyQuantity * 4
    + customer.customerPriorityScore * 0.35
    + (customer.trend90dPercent !== null && customer.trend90dPercent < 0 ? 12 : 0)
    + (isNext15 ? 30 : 0)
    + (isCold ? 18 : 0),
  );

  return {
    action,
    daysSincePurchase,
    daysUntilExpected,
    isCold,
    isNext15,
    isOverdue,
    label,
    opportunityScore,
    potentialQuantity,
    potentialRevenue,
    priority,
    tone,
  };
}

function whatsappLink(customer: InventoryModelTopCustomer, modelLabel: string) {
  const phone = customer.phone?.replace(/\D/g, "");
  if (!phone) return null;
  const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
  const message = [
    `Olá, ${customer.customerDisplayName}!`,
    `Estamos com ${modelLabel} disponível.`,
    `Vi que esse modelo faz parte do seu histórico e separei uma condição para sua próxima reposição.`,
    "Posso te passar quantidade e valor?",
  ].join(" ");
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function customerSearchText(customer: InventoryModelTopCustomer) {
  return [
    customer.customerDisplayName,
    customer.customerCode,
    customer.lastAttendant ?? "",
  ].join(" ").toLocaleLowerCase("pt-BR");
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
  }).format(value);
}

type HistoryRange = 30 | 90 | "all";

interface ModelHistoryChartPoint extends InventoryDailySeriesPoint {
  measuredStockUnits: number | null;
  sales7Average: number;
}

interface ModelHistoryAnalysis {
  points: ModelHistoryChartPoint[];
  averageDailySales: number;
  currentStock: number | null;
  estimatedPointCount: number;
  measuredPointCount: number;
  previous7Sales: number;
  last7Sales: number;
  salesTrendPercent: number | null;
  stockChange: number | null;
  totalRestock: number;
  totalSales: number;
}

export function buildModelHistoryAnalysis(
  series: InventoryDailySeriesPoint[],
  range: HistoryRange,
): ModelHistoryAnalysis {
  const startIndex = range === "all" ? 0 : Math.max(0, series.length - range);
  const visibleSeries = series.slice(startIndex);
  const points = visibleSeries.map((point, visibleIndex) => {
    const globalIndex = startIndex + visibleIndex;
    const rollingWindow = series.slice(Math.max(0, globalIndex - 6), globalIndex + 1);
    const rollingSales = rollingWindow.reduce((total, item) => total + item.salesUnits, 0);

    return {
      ...point,
      measuredStockUnits: point.stockIsEstimated ? null : point.stockUnits,
      sales7Average: rollingWindow.length ? rollingSales / rollingWindow.length : 0,
    };
  });
  const stockPoints = points.filter(
    (point): point is ModelHistoryChartPoint & { stockUnits: number } => point.stockUnits !== null,
  );
  const totalSales = points.reduce((total, point) => total + point.salesUnits, 0);
  const totalRestock = points.reduce((total, point) => total + point.restockUnits, 0);
  const last7Sales = points.slice(-7).reduce((total, point) => total + point.salesUnits, 0);
  const previous7Sales = points.slice(-14, -7).reduce((total, point) => total + point.salesUnits, 0);
  const firstStockPoint = stockPoints[0];
  const lastStockPoint = stockPoints.at(-1);
  const salesTrendPercent = previous7Sales > 0
    ? ((last7Sales - previous7Sales) / previous7Sales) * 100
    : last7Sales > 0
      ? 100
      : null;

  return {
    points,
    averageDailySales: points.length ? totalSales / points.length : 0,
    currentStock: lastStockPoint?.stockUnits ?? null,
    estimatedPointCount: points.filter((point) => point.stockIsEstimated).length,
    measuredPointCount: points.filter((point) => point.stockUnits !== null && !point.stockIsEstimated).length,
    previous7Sales,
    last7Sales,
    salesTrendPercent,
    stockChange: firstStockPoint && lastStockPoint && firstStockPoint !== lastStockPoint
      ? lastStockPoint.stockUnits - firstStockPoint.stockUnits
      : null,
    totalRestock,
    totalSales,
  };
}

function ModelHistoryTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey?: string;
    payload?: ModelHistoryChartPoint;
    value?: number | null;
  }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="model-history-tooltip">
      <strong>{formatDate(label ?? point.date)}</strong>
      <div><span>Saldo</span><b>{point.stockUnits === null ? "Sem leitura" : `${formatNumber(point.stockUnits)} peças`}</b></div>
      <div><span>Vendas</span><b>{formatNumber(point.salesUnits)} peças</b></div>
      <div><span>Entradas</span><b>{formatNumber(point.restockUnits)} peças</b></div>
      <div><span>Média móvel 7d</span><b>{formatMonthlyAverage(point.sales7Average)} peças/dia</b></div>
      <small>
        {point.stockIsEstimated
          ? "Saldo estimado pelas movimentações desde a última leitura da planilha."
          : "Saldo confirmado pela leitura da planilha."}
      </small>
    </div>
  );
}

function ModelSalesHistoryChart({
  coverageDays,
  series,
}: {
  coverageDays: number | null;
  series: InventoryDailySeriesPoint[];
}) {
  const [range, setRange] = useState<HistoryRange>(90);
  const analysis = useMemo(() => buildModelHistoryAnalysis(series, range), [range, series]);
  const confidenceBase = analysis.measuredPointCount + analysis.estimatedPointCount;
  const measuredShare = confidenceBase ? (analysis.measuredPointCount / confidenceBase) * 100 : 0;
  const trendIsUp = (analysis.salesTrendPercent ?? 0) >= 0;
  const TrendIcon = trendIsUp ? TrendingUp : TrendingDown;
  const coverageTone = coverageDays === null
    ? "neutral"
    : coverageDays < 15
      ? "danger"
      : coverageDays > 90
        ? "warning"
        : "success";
  const coverageMessage = coverageDays === null
    ? "Ainda não há ritmo de venda suficiente para calcular a cobertura."
    : coverageDays < 15
      ? "Risco de ruptura: priorize reposição para não perder vendas."
      : coverageDays > 90
        ? "Estoque alto para o ritmo atual: acelere ofertas antes de comprar mais."
        : "Cobertura equilibrada para o ritmo de venda observado.";

  return (
    <div className="model-history-visual">
      <div className="model-history-range" aria-label="Período do histórico">
        {([
          [30, "30 dias"],
          [90, "90 dias"],
          ["all", "Todo histórico"],
        ] as const).map(([value, label]) => (
          <button
            className={range === value ? "active" : ""}
            key={value}
            onClick={() => setRange(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="model-history-chart-kpis" aria-label="Resumo do período selecionado">
        <div>
          <span className="model-history-kpi-icon blue"><Boxes size={17} /></span>
          <span>Saldo atual<strong>{analysis.currentStock === null ? "Sem leitura" : formatNumber(analysis.currentStock)}</strong></span>
        </div>
        <div>
          <span className="model-history-kpi-icon gold"><ShoppingBag size={17} /></span>
          <span>Vendidos no período<strong>{formatNumber(analysis.totalSales)}</strong></span>
        </div>
        <div>
          <span className="model-history-kpi-icon green"><PackagePlus size={17} /></span>
          <span>Entradas identificadas<strong>{formatNumber(analysis.totalRestock)}</strong></span>
        </div>
        <div>
          <span className="model-history-kpi-icon violet"><Gauge size={17} /></span>
          <span>Média por dia<strong>{formatMonthlyAverage(analysis.averageDailySales)}</strong></span>
        </div>
        <div>
          <span className={`model-history-kpi-icon ${analysis.stockChange !== null && analysis.stockChange < 0 ? "red" : "blue"}`}>
            {analysis.stockChange !== null && analysis.stockChange < 0 ? <TrendingDown size={17} /> : <TrendingUp size={17} />}
          </span>
          <span>Variação do saldo<strong>{analysis.stockChange === null ? "Sem base" : `${analysis.stockChange > 0 ? "+" : ""}${formatNumber(analysis.stockChange)}`}</strong></span>
        </div>
      </div>

      <div className="model-history-chart" aria-label="Histórico diário de saldo, entradas e vendas">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={analysis.points} margin={{ bottom: 4, left: 4, right: 8, top: 12 }}>
            <defs>
              <linearGradient id="modelStockArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2956d7" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#2956d7" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.11)" />
            <XAxis
              dataKey="date"
              minTickGap={28}
              tickFormatter={formatShortDate}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="stock"
              tickFormatter={(value) => formatCompactNumber(Number(value))}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              width={48}
            />
            <YAxis
              yAxisId="activity"
              orientation="right"
              tickFormatter={(value) => formatCompactNumber(Number(value))}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<ModelHistoryTooltip />} />
            <Area
              connectNulls
              dataKey="stockUnits"
              fill="url(#modelStockArea)"
              name="Saldo"
              stroke="#2956d7"
              strokeWidth={2.5}
              type="stepAfter"
              yAxisId="stock"
            />
            <Bar
              dataKey="salesUnits"
              fill="#d99a22"
              maxBarSize={12}
              name="Vendas"
              radius={[4, 4, 0, 0]}
              yAxisId="activity"
            />
            <Bar
              dataKey="restockUnits"
              fill="#28a06a"
              maxBarSize={12}
              name="Entradas"
              radius={[4, 4, 0, 0]}
              yAxisId="activity"
            />
            <Line
              dataKey="sales7Average"
              dot={false}
              name="Média móvel 7d"
              stroke="#7c5ce7"
              strokeDasharray="5 4"
              strokeWidth={2}
              type="monotone"
              yAxisId="activity"
            />
            <Scatter
              dataKey="measuredStockUnits"
              fill="#ffffff"
              line={false}
              name="Saldo confirmado"
              shape="circle"
              stroke="#2956d7"
              strokeWidth={2}
              yAxisId="stock"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="model-history-chart-legend" aria-label="Legenda do gráfico">
        <span><i className="area" /> Saldo contínuo</span>
        <span><i className="dot" /> Saldo confirmado</span>
        <span><i className="sales" /> Vendas</span>
        <span><i className="restock" /> Entradas</span>
        <span><i className="average" /> Média móvel 7d</span>
      </div>

      <div className="model-history-insight-grid">
        <article>
          <span className={`model-history-insight-icon ${trendIsUp ? "success" : "danger"}`}><TrendIcon size={18} /></span>
          <div>
            <span>Velocidade de venda</span>
            <strong>
              {analysis.salesTrendPercent === null
                ? "Sem comparação"
                : `${trendIsUp ? "+" : ""}${formatMonthlyAverage(analysis.salesTrendPercent)}%`}
            </strong>
            <p>
              {formatNumber(analysis.last7Sales)} peças nos últimos 7 dias contra{" "}
              {formatNumber(analysis.previous7Sales)} nos 7 dias anteriores.
            </p>
          </div>
        </article>
        <article>
          <span className={`model-history-insight-icon ${coverageTone}`}><Gauge size={18} /></span>
          <div>
            <span>Decisão de estoque</span>
            <strong>{coverageDays === null ? "Cobertura sem base" : `${formatNumber(coverageDays)} dias de cobertura`}</strong>
            <p>{coverageMessage}</p>
          </div>
        </article>
        <article>
          <span className="model-history-insight-icon neutral"><Boxes size={18} /></span>
          <div>
            <span>Confiabilidade da curva</span>
            <strong>{formatMonthlyAverage(measuredShare)}% confirmado</strong>
            <p>
              {formatNumber(analysis.measuredPointCount)} leituras da planilha e{" "}
              {formatNumber(analysis.estimatedPointCount)} saldos estimados entre leituras.
            </p>
          </div>
        </article>
      </div>

      <p className="model-history-method-note">
        O saldo azul permanece contínuo porque, entre duas leituras da planilha, o sistema desconta as vendas conhecidas.
        Os pontos azuis são saldos confirmados; os demais trechos são estimados e uma nova leitura sempre substitui a estimativa.
      </p>
    </div>
  );
}

interface CustomerBehaviorPoint {
  month: string;
  label: string;
  quantity: number;
  orders: number;
  revenue: number;
  average3Months: number;
}

export function buildCustomerBehaviorSeries(
  history: InventoryModelCustomerMonthlyPoint[],
  referenceDate = new Date(),
): CustomerBehaviorPoint[] {
  const byMonth = new Map(history.map((point) => [point.month, point]));
  const points = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth() - 11 + index, 1));
    const month = date.toISOString().slice(0, 7);
    const source = byMonth.get(month);
    return {
      month,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
        .format(date)
        .replace(".", ""),
      quantity: source?.quantity ?? 0,
      orders: source?.orders ?? 0,
      revenue: source?.revenue ?? 0,
      average3Months: 0,
    };
  });

  return points.map((point, index) => {
    const rolling = points.slice(Math.max(0, index - 2), index + 1);
    return {
      ...point,
      average3Months: rolling.reduce((total, item) => total + item.quantity, 0) / rolling.length,
    };
  });
}

function customerStatusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE") return "Ativo";
  if (normalized === "ATTENTION") return "Atenção";
  if (normalized === "INACTIVE") return "Inativo";
  return status || "Sem status";
}

function CustomerBehaviorTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CustomerBehaviorPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="model-customer-tooltip">
      <strong>{point.label.toUpperCase()} / {point.month.slice(0, 4)}</strong>
      <div><span>Peças</span><b>{formatNumber(point.quantity)}</b></div>
      <div><span>Pedidos</span><b>{formatNumber(point.orders)}</b></div>
      <div><span>Receita</span><b>{formatCurrency(point.revenue)}</b></div>
      <div><span>Média móvel 3m</span><b>{formatMonthlyAverage(point.average3Months)}</b></div>
    </div>
  );
}

function CustomerBehaviorDialog({
  customer,
  modelLabel,
  onClose,
}: {
  customer: InventoryModelTopCustomer;
  modelLabel: string;
  onClose: () => void;
}) {
  const points = useMemo(
    () => buildCustomerBehaviorSeries(customer.monthlyHistory ?? []),
    [customer.monthlyHistory],
  );
  const opportunity = opportunityForCustomer(customer);
  const contactLink = whatsappLink(customer, modelLabel);
  const activeMonths = points.filter((point) => point.quantity > 0);
  const bestMonth = [...points].sort((left, right) => right.quantity - left.quantity)[0];
  const last3Quantity = points.slice(-3).reduce((total, point) => total + point.quantity, 0);
  const previous3Quantity = points.slice(-6, -3).reduce((total, point) => total + point.quantity, 0);
  const recentTrend = previous3Quantity > 0
    ? ((last3Quantity - previous3Quantity) / previous3Quantity) * 100
    : last3Quantity > 0
      ? 100
      : null;
  const consistency = Math.round((activeMonths.length / 12) * 100);
  const trendTone = recentTrend === null ? "neutral" : recentTrend >= 0 ? "success" : "danger";
  const TrendIcon = recentTrend !== null && recentTrend < 0 ? TrendingDown : TrendingUp;

  return (
    <div
      className="model-customer-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="model-customer-dialog-title"
        aria-modal="true"
        className="model-customer-dialog"
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Comportamento neste modelo</p>
            <h2 id="model-customer-dialog-title">{customer.customerDisplayName}</h2>
            <p>{modelLabel} · {customer.customerCode || "Sem código"}</p>
          </div>
          <button aria-label="Fechar análise do cliente" onClick={onClose} type="button"><X size={19} /></button>
        </header>

        <div className="model-customer-kpis">
          <div><span>Total comprado</span><strong>{formatNumber(customer.totalQuantity)}</strong><small>{formatNumber(customer.totalOrders)} pedidos</small></div>
          <div><span>Receita no modelo</span><strong>{formatCurrency(customer.totalRevenue)}</strong><small>{formatCurrency(customer.averageUnitPrice)} por peça</small></div>
          <div><span>Média mensal</span><strong>{formatMonthlyAverage(customer.averageMonthlyQuantity)}</strong><small>peças por mês</small></div>
          <div><span>Pedido médio</span><strong>{formatMonthlyAverage(customer.averageOrderQuantity)}</strong><small>peças por pedido</small></div>
          <div><span>Última compra</span><strong>{formatDate(customer.lastPurchaseAt)}</strong><small>{formatDaysSince(opportunity.daysSincePurchase)}</small></div>
        </div>

        <div className="model-customer-chart-head">
          <div>
            <h3>Compras nos últimos 12 meses</h3>
            <p>Barras mostram peças compradas; a linha mostra a média móvel de três meses.</p>
          </div>
          <span className={`model-customer-trend ${trendTone}`}>
            <TrendIcon size={15} />
            {recentTrend === null
              ? "Sem base para tendência"
              : `${recentTrend >= 0 ? "+" : ""}${formatMonthlyAverage(recentTrend)}% nos últimos 3 meses`}
          </span>
        </div>

        <div className="model-customer-chart" aria-label={`Compras de ${customer.customerDisplayName} para ${modelLabel}`}>
          <ResponsiveContainer height={260} width="100%">
            <ComposedChart data={points} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="rgba(41, 86, 215, 0.1)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(value) => formatCompactNumber(Number(value))} tickLine={false} width={44} />
              <Tooltip content={<CustomerBehaviorTooltip />} />
              <Bar dataKey="quantity" fill="#2956d7" maxBarSize={28} name="Peças" radius={[6, 6, 0, 0]} />
              <Line dataKey="average3Months" dot={false} name="Média móvel 3m" stroke="#7c5ce7" strokeWidth={2.5} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="model-customer-intelligence">
          <article>
            <span className="model-customer-intelligence-icon blue"><Activity size={18} /></span>
            <div>
              <span>Frequência</span>
              <strong>{activeMonths.length} de 12 meses com compra</strong>
              <p>{consistency}% de constância. Intervalo médio de {customer.averageDaysBetweenPurchases === null ? "sem base" : `${formatNumber(customer.averageDaysBetweenPurchases)} dias`}.</p>
            </div>
          </article>
          <article>
            <span className={`model-customer-intelligence-icon ${opportunity.tone}`}><CalendarClock size={18} /></span>
            <div>
              <span>Próxima oportunidade</span>
              <strong>{opportunity.label}</strong>
              <p>{opportunity.action} Previsão: {formatDate(customer.predictedNextPurchaseAt)}.</p>
            </div>
          </article>
          <article>
            <span className="model-customer-intelligence-icon violet"><TrendingUp size={18} /></span>
            <div>
              <span>Melhor mês</span>
              <strong>{bestMonth?.quantity ? `${bestMonth.label.toUpperCase()} · ${formatNumber(bestMonth.quantity)} peças` : "Sem compra no período"}</strong>
              <p>{formatNumber(customer.quantity90Days)} peças nos últimos 90 dias contra {formatNumber(customer.previous90DaysQuantity)} nos 90 dias anteriores.</p>
            </div>
          </article>
          <article>
            <span className="model-customer-intelligence-icon green"><CircleDollarSign size={18} /></span>
            <div>
              <span>Próximo pedido provável</span>
              <strong>{formatCurrency(opportunity.potentialRevenue)}</strong>
              <p>Potencial estimado de {formatMonthlyAverage(opportunity.potentialQuantity)} peças com base no histórico deste modelo.</p>
            </div>
          </article>
        </div>

        <footer>
          <span>
            Status da carteira: <strong>{customerStatusLabel(customer.customerStatus)}</strong>
            {" · "}Última vendedora: <strong>{customer.lastAttendant || "Sem registro"}</strong>
          </span>
          <div>
            {contactLink ? (
              <a className="primary-button" href={contactLink} rel="noreferrer" target="_blank">
                <MessageCircle size={15} /> Abordar no WhatsApp
              </a>
            ) : null}
            <Link className="ghost-button" to={`/clientes/${customer.customerId}`}>
              Ver cadastro completo <ArrowUpRight size={15} />
            </Link>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function InventoryModelAnalysisContent({
  detail,
  initialTab = "sales",
}: {
  detail: InventoryModelDetailResponse;
  initialTab?: AnalysisTab;
}) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>(initialTab);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [customerSort, setCustomerSort] = useState<CustomerSort>("volume");
  const [selectedCustomer, setSelectedCustomer] = useState<InventoryModelTopCustomer | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const model = detail.model;

  const customerRows = useMemo(
    () =>
      detail.topCustomers.map((customer) => {
        return {
          customer,
          opportunity: opportunityForCustomer(customer),
        };
      }),
    [detail.topCustomers],
  );
  const inactiveCustomerRows = useMemo(
    () =>
      (detail.topInactiveCustomers
        ?? detail.topCustomers.filter((customer) => customer.customerStatus.toUpperCase() === "INACTIVE"))
        .map((customer) => ({
          customer,
          opportunity: opportunityForCustomer(customer),
        })),
    [detail.topCustomers, detail.topInactiveCustomers],
  );

  const visibleCustomers = useMemo(() => {
    const sourceRows = filter === "inactive" ? inactiveCustomerRows : customerRows;
    const filtered = sourceRows.filter(({ customer, opportunity }) => {
      if (deferredSearch && !customerSearchText(customer).includes(deferredSearch)) return false;
      if (filter === "overdue" && !opportunity.isOverdue) return false;
      if (filter === "next_15" && !opportunity.isNext15) return false;
      if (filter === "active" && customer.quantity30Days <= 0) return false;
      return true;
    });

    return [...filtered].sort((left, right) => {
      if (customerSort === "opportunity") {
        return right.opportunity.opportunityScore - left.opportunity.opportunityScore
          || left.opportunity.priority - right.opportunity.priority;
      }
      if (customerSort === "monthly") {
        return right.customer.averageMonthlyQuantity - left.customer.averageMonthlyQuantity
          || right.customer.totalQuantity - left.customer.totalQuantity;
      }
      if (customerSort === "recent") {
        return (right.customer.lastPurchaseAt ?? "").localeCompare(left.customer.lastPurchaseAt ?? "")
          || right.customer.totalQuantity - left.customer.totalQuantity;
      }
      return right.customer.totalQuantity - left.customer.totalQuantity
        || (right.customer.lastPurchaseAt ?? "").localeCompare(left.customer.lastPurchaseAt ?? "");
    });
  }, [customerRows, customerSort, deferredSearch, filter, inactiveCustomerRows]);

  if (!model) {
    return (
      <section className="panel model-analysis-empty">
        <h2>Modelo não encontrado</h2>
        <p>Este modelo não está disponível no retrato atual do estoque.</p>
        <Link className="ghost-button" to="/estoque"><ArrowLeft size={16} /> Voltar ao estoque</Link>
      </section>
    );
  }

  const totalCustomerVolume = customerRows.reduce((total, row) => total + row.customer.totalQuantity, 0);
  const monthlyCustomerVolume = customerRows.reduce((total, row) => total + row.customer.averageMonthlyQuantity, 0);
  const customersToReactivate = customerRows.filter((row) => row.opportunity.isOverdue);
  const customersNext15 = customerRows.filter((row) => row.opportunity.isNext15);
  const customersActive30 = customerRows.filter((row) => row.customer.quantity30Days > 0);
  const customersInactive = inactiveCustomerRows;
  const volumeRankByCustomer = new Map(
    [...(filter === "inactive" ? inactiveCustomerRows : customerRows)]
      .sort((left, right) => right.customer.totalQuantity - left.customer.totalQuantity)
      .map((row, index) => [row.customer.customerId, index + 1]),
  );
  const customersDeclining = customerRows.filter(
    (row) => row.customer.trend90dPercent !== null && row.customer.trend90dPercent < -10,
  );
  const potentialPipeline = customerRows
    .filter((row) => row.opportunity.isOverdue || row.opportunity.isNext15)
    .reduce((total, row) => total + row.opportunity.potentialRevenue, 0);
  const revenue12Months = customerRows.reduce((total, row) => total + row.customer.revenue12Months, 0);
  const topFiveVolume = [...customerRows]
    .sort((left, right) => right.customer.totalQuantity - left.customer.totalQuantity)
    .slice(0, 5)
    .reduce((total, row) => total + row.customer.totalQuantity, 0);
  const topFiveShare = totalCustomerVolume ? Math.round((topFiveVolume / totalCustomerVolume) * 100) : 0;
  const priorityCount = customersToReactivate.length + customersNext15.length;
  const historyInsights = detail.highlights.length
    ? detail.highlights
    : [
        `A carteira compra em média ${formatMonthlyAverage(monthlyCustomerVolume)} peças deste modelo por mês.`,
        `Os 5 maiores clientes representam ${formatNumber(topFiveShare)}% do volume histórico do ranking.`,
        customersDeclining.length
          ? `${formatNumber(customersDeclining.length)} clientes reduziram o consumo nos últimos 90 dias.`
          : "Nenhum cliente relevante apresenta queda forte de consumo nos últimos 90 dias.",
      ];

  return (
    <div className="model-analysis-page">
      <div className="model-analysis-back-row">
        <Link className="ghost-button small-button" to="/estoque">
          <ArrowLeft size={16} /> Voltar ao estoque
        </Link>
      </div>

      <section className="panel model-analysis-hero model-analysis-hero-simple">
        <div className="model-analysis-heading">
          <div>
            <p className="eyebrow">Modelo selecionado</p>
            <h1>{model.modelLabel}</h1>
            <p>Veja quem pode comprar agora ou consulte o histórico do modelo.</p>
          </div>
          <div className="model-analysis-tags" aria-label="Características do modelo">
            <span>{productKindLabel(model.productKind)}</span>
            <span>{model.brand || "Sem marca"}</span>
            {model.qualityLabels.map((quality) => <span key={quality}>{quality}</span>)}
          </div>
        </div>

        <div className="model-analysis-summary model-analysis-summary-simple" aria-label="Resumo do modelo">
          <div>
            <span>Estoque atual</span>
            <strong>{formatNumber(model.stockUnits)}</strong>
            <small>peças</small>
          </div>
          <div>
            <span>Vendas em 30 dias</span>
            <strong>{formatNumber(model.sales30)}</strong>
            <small>{formatNumber(model.orders30)} pedidos</small>
          </div>
          <div>
            <span>Contatos prioritários</span>
            <strong>{formatNumber(priorityCount)}</strong>
            <small>{formatCurrency(potentialPipeline)} em pedidos estimados</small>
          </div>
        </div>

        <div className="model-analysis-tabs" role="tablist" aria-label="Visões do modelo">
          <button
            aria-selected={activeTab === "sales"}
            className={activeTab === "sales" ? "active" : ""}
            onClick={() => setActiveTab("sales")}
            role="tab"
            type="button"
          >
            Clientes para vender
          </button>
          <button
            aria-selected={activeTab === "history"}
            className={activeTab === "history" ? "active" : ""}
            onClick={() => setActiveTab("history")}
            role="tab"
            type="button"
          >
            Histórico do modelo
          </button>
        </div>
      </section>

      <section
        aria-labelledby="model-sales-tab-title"
        className={`panel model-analysis-clients model-analysis-tab-panel ${activeTab === "sales" ? "active" : ""}`}
      >
        <div className="model-analysis-client-head">
          <div>
            <h2 id="model-sales-tab-title">Quem mais compra este modelo</h2>
            <p>
              {filter === "inactive" && inactiveCustomerRows.length >= 100
                ? "Top 100 compradores inativos deste modelo, ordenados pelo volume histórico."
                : filter === "inactive"
                  ? `${formatNumber(inactiveCustomerRows.length)} compradores inativos encontrados para este modelo.`
                  : customerRows.length >= 100
                ? "Top 100 compradores históricos, incluindo clientes inativos."
                : `${formatNumber(customerRows.length)} compradores históricos encontrados. O ranking inclui inativos e não é preenchido com clientes sem compra.`}
            </p>
          </div>
          <div className="model-analysis-client-tools">
            <label>
              Ordenar por
              <select
                aria-label="Ordenar clientes"
                onChange={(event) => setCustomerSort(event.target.value as CustomerSort)}
                value={customerSort}
              >
                <option value="volume">Maior volume histórico</option>
                <option value="monthly">Maior média mensal</option>
                <option value="opportunity">Oportunidade de venda</option>
                <option value="recent">Compra mais recente</option>
              </select>
            </label>
            <label className="model-analysis-search">
              <Search size={15} />
              <input
                aria-label="Buscar cliente ou vendedora"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente ou vendedora"
                value={search}
              />
            </label>
          </div>
        </div>

        <div className="model-analysis-filter-row" role="group" aria-label="Filtrar oportunidades">
          {([
            { value: "all", label: `Todos (${customerRows.length})` },
            { value: "overdue", label: `Atrasados (${customersToReactivate.length})` },
            { value: "next_15", label: `Próximos 15 dias (${customersNext15.length})` },
            { value: "active", label: `Comprando agora (${customersActive30.length})` },
            {
              value: "inactive",
              label: customersInactive.length >= 100
                ? "Inativos (Top 100)"
                : `Inativos (${customersInactive.length})`,
            },
          ] satisfies Array<{ value: CustomerFilter; label: string }>).map((option) => (
            <button
              className={filter === option.value ? "active" : ""}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        {visibleCustomers.length ? (
          <div className="invsales-table-wrap model-analysis-table-wrap">
            <table className="invsales-table model-analysis-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Cliente</th>
                  <th className="num">Total comprado</th>
                  <th className="num">Média mensal</th>
                  <th>Situação</th>
                  <th className="num">Próximo pedido</th>
                  <th>Última compra</th>
                  <th>Status</th>
                  <th>Vendedora</th>
                  <th>Análise e ação</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map(({ customer, opportunity }) => {
                  const contactLink = whatsappLink(customer, model.modelLabel);

                  return (
                    <tr key={customer.customerId}>
                      <td className="num model-analysis-rank">{volumeRankByCustomer.get(customer.customerId) ?? "—"}</td>
                      <td>
                        <button
                          className="model-analysis-customer model-analysis-customer-button"
                          onClick={() => setSelectedCustomer(customer)}
                          type="button"
                        >
                          <strong>{customer.customerDisplayName}</strong>
                          <span>{customer.customerCode || "Sem código"} · Ver comportamento</span>
                        </button>
                      </td>
                      <td className="num">
                        <div className="model-analysis-money">
                          <strong>{formatNumber(customer.totalQuantity)} peças</strong>
                          <span>{formatNumber(customer.totalOrders)} pedidos · {formatCurrency(customer.totalRevenue)}</span>
                        </div>
                      </td>
                      <td className="num">
                        <div className="model-analysis-monthly">
                          <strong>{formatMonthlyAverage(customer.averageMonthlyQuantity)} peças/mês</strong>
                          <span>{formatMonthlyAverage(customer.averageOrderQuantity)} por pedido</span>
                        </div>
                      </td>
                      <td>
                        <div className="model-analysis-action">
                          <span className={`model-analysis-status ${opportunity.tone}`}>{opportunity.label}</span>
                          <small>Recompra prevista: {formatDate(customer.predictedNextPurchaseAt)}</small>
                        </div>
                      </td>
                      <td className="num">
                        <div className="model-analysis-money">
                          <strong>{formatCurrency(opportunity.potentialRevenue)}</strong>
                          <span>≈ {formatMonthlyAverage(opportunity.potentialQuantity)} peças</span>
                        </div>
                      </td>
                      <td>
                        <div className="model-analysis-date">
                          <strong>{formatDate(customer.lastPurchaseAt)}</strong>
                          <span>{formatDaysSince(opportunity.daysSincePurchase)}</span>
                        </div>
                      </td>
                      <td><span className={`model-analysis-customer-status ${customer.customerStatus.toLowerCase()}`}>{customerStatusLabel(customer.customerStatus)}</span></td>
                      <td>{customer.lastAttendant || "Sem vendedora"}</td>
                      <td>
                        <div className="model-analysis-row-actions">
                          <button
                            className="ghost-button small-button model-analysis-open-customer"
                            onClick={() => setSelectedCustomer(customer)}
                            type="button"
                          >
                            <Activity size={14} /> Analisar
                          </button>
                          {contactLink ? (
                            <a className="primary-button small-button" href={contactLink} rel="noreferrer" target="_blank">
                              <MessageCircle size={14} /> WhatsApp
                            </a>
                          ) : (
                            <span className="model-analysis-no-phone"><Phone size={13} /> Sem telefone</span>
                          )}
                          <Link className="ghost-button small-button" to={`/clientes/${customer.customerId}`}>
                            Cliente <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="invsales-empty">
            {(filter === "inactive" ? inactiveCustomerRows.length : detail.topCustomers.length)
              ? "Nenhum cliente corresponde à busca."
              : filter === "inactive"
                ? "Ainda não há compradores inativos registrados para este modelo."
                : "Ainda não há clientes com compras registradas para este modelo."}
          </div>
        )}
      </section>

      {selectedCustomer ? (
        <CustomerBehaviorDialog
          customer={selectedCustomer}
          modelLabel={model.modelLabel}
          onClose={() => setSelectedCustomer(null)}
        />
      ) : null}

      <section
        aria-labelledby="model-history-tab-title"
        className={`panel model-history-panel model-analysis-tab-panel ${activeTab === "history" ? "active" : ""}`}
      >
        <div className="model-history-head">
          <div>
            <h2 id="model-history-tab-title">Histórico do modelo</h2>
            <p>Vendas, estoque e sinais que ajudam a entender o desempenho deste produto.</p>
          </div>
          <div className="model-history-dates">
            <span>Última venda <strong>{formatDate(model.lastSaleAt)}</strong></span>
            <span>Última reposição <strong>{formatDate(model.lastRestockAt)}</strong></span>
          </div>
        </div>

        <div className="model-history-facts" aria-label="Indicadores históricos">
          <div><span>Vendas 30 dias</span><strong>{formatNumber(model.sales30)}</strong></div>
          <div><span>Vendas 90 dias</span><strong>{formatNumber(model.sales90)}</strong></div>
          <div><span>Receita em 12 meses</span><strong>{formatCurrency(revenue12Months)}</strong></div>
          <div>
            <span>Cobertura do estoque</span>
            <strong>{model.coverageDays === null ? "Sem base" : `${formatNumber(model.coverageDays)} dias`}</strong>
          </div>
        </div>

        <div className="model-history-chart-section">
          <div>
            <h3>Movimento, saldo e velocidade de venda</h3>
            <p>Compare o saldo, as vendas, as entradas e a tendência para decidir quando repor ou acelerar a saída.</p>
          </div>
          {detail.dailySeries.length ? (
            <ModelSalesHistoryChart coverageDays={model.coverageDays} series={detail.dailySeries} />
          ) : (
            <div className="invsales-empty">Ainda não há histórico diário suficiente para este modelo.</div>
          )}
        </div>

        <div className="model-history-bottom">
          <section>
            <h3>O que o histórico mostra</h3>
            <ul>
              {historyInsights.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <section>
            <h3>Comparações históricas</h3>
            <div className="model-history-comparisons">
              <div>
                <span>Com estoque baixo</span>
                <strong>
                  {detail.benchmarks.lowStockAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.lowStockAvgSales)} peças/dia`}
                </strong>
              </div>
              <div>
                <span>Com estoque alto</span>
                <strong>
                  {detail.benchmarks.highStockAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.highStockAvgSales)} peças/dia`}
                </strong>
              </div>
              <div>
                <span>Com poucas variações</span>
                <strong>
                  {detail.benchmarks.shortMixAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.shortMixAvgSales)} peças/dia`}
                </strong>
              </div>
              <div>
                <span>Com mais variações</span>
                <strong>
                  {detail.benchmarks.wideMixAvgSales === null
                    ? "Sem base"
                    : `${formatMonthlyAverage(detail.benchmarks.wideMixAvgSales)} peças/dia`}
                </strong>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function InventoryModelAnalysisPage() {
  const { modelKey } = useParams<{ modelKey: string }>();
  const { token } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["inventory-model-detail", modelKey],
    queryFn: () => api.inventoryModelDetail(token!, modelKey!),
    enabled: Boolean(token && modelKey),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="model-analysis-page">
        <div className="model-analysis-back-row">
          <Link className="ghost-button small-button" to="/estoque"><ArrowLeft size={16} /> Voltar ao estoque</Link>
        </div>
        <section className="panel invsales-empty">Carregando análise comercial do modelo...</section>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="model-analysis-page">
        <div className="model-analysis-back-row">
          <Link className="ghost-button small-button" to="/estoque"><ArrowLeft size={16} /> Voltar ao estoque</Link>
        </div>
        <section className="panel model-analysis-empty">
          <h2>Não foi possível carregar esta análise</h2>
          <p>Tente novamente em alguns instantes ou volte para a lista de estoque.</p>
        </section>
      </div>
    );
  }

  return <InventoryModelAnalysisContent detail={detailQuery.data} />;
}

import type {
  InventoryBuyingListItem,
  InventoryDailySeriesPoint,
  InventoryModelDetailResponse,
  InventoryOverviewCard,
  InventoryRestockListItem,
  InventoryStaleListItem,
} from "@olist-crm/shared";
import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Package,
  RefreshCcw,
  ShoppingCart,
  Tags,
  TrendingDown,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDateTime, formatDaysSince, formatNumber, formatShortDate } from "../lib/format";

type InventoryView = "overview" | "buying" | "restock" | "stale" | "models";
type BuyingFilter = "all" | "buy_now" | "ending_soon" | "watch" | "do_not_buy" | "hold_sales";
type RestockWindow = "all" | "today" | "7d" | "30d";
type StaleFilter = 30 | 60 | 90 | 120;

const viewTabs = [
  {
    value: "overview" as const,
    label: "Resumo",
    helper: "Visao rapida para a chefe bater o olho e entender o que fazer primeiro.",
    title: "Resumo do estoque",
  },
  {
    value: "buying" as const,
    label: "Compras",
    helper: "Veja o que precisa comprar agora, o que so precisa acompanhar e o que nao vale repor.",
    title: "Leitura para compras",
  },
  {
    value: "restock" as const,
    label: "Reposicao",
    helper: "Acompanhe o que chegou, se voltou a vender e o que ainda precisa de nova reposicao.",
    title: "Acompanhamento de reposicao",
  },
  {
    value: "stale" as const,
    label: "Estoque parado",
    helper: "Encontre o que esta ocupando espaco ha muito tempo e precisa de acao comercial.",
    title: "Produtos parados",
  },
  {
    value: "models" as const,
    label: "Modelos",
    helper: "Abra cada modelo com calma e acompanhe estoque, vendas, reposicoes e clientes.",
    title: "Analise por modelo",
  },
] as const;

function formatCoverage(value: number | null) {
  if (value === null || value === undefined) {
    return "Sem base";
  }

  return `${formatNumber(value)} dias`;
}

function formatCompactNumber(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
      notation: "compact",
    }).format(value)}`;
  }

  return formatNumber(value);
}

function toDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const matched = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] ?? null : null;
}

function daysBetween(date: string | null, referenceDate: string | null) {
  const target = toDateOnly(date);
  const reference = toDateOnly(referenceDate);
  if (!target || !reference) {
    return null;
  }

  const targetMs = Date.parse(`${target}T00:00:00.000Z`);
  const referenceMs = Date.parse(`${reference}T00:00:00.000Z`);
  if (Number.isNaN(targetMs) || Number.isNaN(referenceMs)) {
    return null;
  }

  return Math.floor((referenceMs - targetMs) / (1000 * 60 * 60 * 24));
}

function buyRecommendationLabel(value: InventoryBuyingListItem["buyRecommendation"]) {
  if (value === "BUY_NOW") {
    return "Comprar agora";
  }

  if (value === "WATCH") {
    return "Acompanhar";
  }

  return "Nao comprar";
}

function buyRecommendationTone(value: InventoryBuyingListItem["buyRecommendation"]) {
  if (value === "BUY_NOW") {
    return "danger";
  }

  if (value === "WATCH") {
    return "warning";
  }

  return "neutral";
}

function restockStatusLabel(value: InventoryRestockListItem["status"]) {
  if (value === "ARRIVED_TODAY") {
    return "Chegou hoje";
  }

  if (value === "BACK_TO_SELLING") {
    return "Deu resultado";
  }

  if (value === "RESTOCK_AGAIN") {
    return "Repor de novo";
  }

  return "Ainda nao reagiu";
}

function restockStatusTone(value: InventoryRestockListItem["status"]) {
  if (value === "ARRIVED_TODAY" || value === "BACK_TO_SELLING") {
    return "success";
  }

  if (value === "RESTOCK_AGAIN") {
    return "danger";
  }

  return "warning";
}

function staleActionLabel(value: InventoryStaleListItem["suggestedAction"]) {
  if (value === "COMMERCIAL_PUSH") {
    return "Dar foco comercial";
  }

  if (value === "PROMOTION") {
    return "Fazer promocao";
  }

  if (value === "LIQUIDATE_REVIEW") {
    return "Liquidar ou rever compra";
  }

  return "Acompanhar";
}

function staleActionTone(value: InventoryStaleListItem["suggestedAction"]) {
  if (value === "LIQUIDATE_REVIEW") {
    return "danger";
  }

  if (value === "PROMOTION") {
    return "warning";
  }

  return "neutral";
}

function productKindLabel(value: InventoryStaleListItem["productKind"] | InventoryBuyingListItem["productKind"]) {
  return value === "DOC_DE_CARGA" ? "DOC de Carga" : "Tela";
}

function productKindTone(value: InventoryStaleListItem["productKind"] | InventoryBuyingListItem["productKind"]) {
  return value === "DOC_DE_CARGA" ? "warning" : "success";
}

function matchesBuyingFilter(item: InventoryBuyingListItem, filter: BuyingFilter) {
  if (filter === "buy_now") {
    return item.buyRecommendation === "BUY_NOW";
  }

  if (filter === "ending_soon") {
    return item.stockUnits > 0 && item.coverageDays !== null && item.coverageDays <= 15;
  }

  if (filter === "watch") {
    return item.buyRecommendation === "WATCH";
  }

  if (filter === "do_not_buy") {
    return item.buyRecommendation === "DO_NOT_BUY";
  }

  if (filter === "hold_sales") {
    return item.holdSales;
  }

  return true;
}

function matchesRestockWindow(item: InventoryRestockListItem, latestSeriesDate: string | null, window: RestockWindow) {
  if (window === "all") {
    return true;
  }

  if (window === "today") {
    return toDateOnly(item.lastRestockAt) === toDateOnly(latestSeriesDate);
  }

  const gap = daysBetween(item.lastRestockAt, latestSeriesDate);
  if (gap === null) {
    return false;
  }

  if (window === "7d") {
    return gap <= 7;
  }

  return gap <= 30;
}

function matchesStaleFilter(item: InventoryStaleListItem, filter: StaleFilter) {
  if (item.daysSinceLastSale === null) {
    return filter === 120;
  }

  return item.daysSinceLastSale >= filter;
}

function formatSeriesValue(dataKey: string, value: number) {
  if (dataKey.includes("Units") || dataKey.includes("Stock")) {
    return `${formatNumber(value)} pecas`;
  }

  if (dataKey.includes("Count")) {
    return `${formatNumber(value)} modelos`;
  }

  return formatNumber(value);
}

function hasOverviewSnapshotPoint(point: InventoryDailySeriesPoint) {
  return point.totalStockUnits > 0 || point.activeModelCount > 0;
}

function InventoryChartEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="inventory-chart-empty">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function InventoryFocusCard({
  card,
  onClick,
}: {
  card: InventoryOverviewCard;
  onClick: (card: InventoryOverviewCard) => void;
}) {
  return (
    <button type="button" className={`stat-card inventory-focus-card tone-${card.tone}`} onClick={() => onClick(card)}>
      <div className="stat-card-header">
        <p className="stat-card-title">{card.title}</p>
        <div className={`stat-card-icon tone-${card.tone}`}>
          {card.key === "BUY_URGENT" ? <ShoppingCart size={18} /> : null}
          {card.key === "ENDING_SOON" ? <TrendingDown size={18} /> : null}
          {card.key === "RESTOCKED_TODAY" ? <Package size={18} /> : null}
          {card.key === "STALE_90" ? <CalendarClock size={18} /> : null}
          {card.key === "HOLD_SALES" ? <AlertTriangle size={18} /> : null}
        </div>
      </div>
      <div className="stat-card-body">
        <strong>{formatCompactNumber(card.count)}</strong>
        <div className="stat-card-footer">
          <span className={`stat-card-badge tone-${card.tone}`}>Abrir lista</span>
          <span className="stat-card-helper">{card.helper}</span>
        </div>
      </div>
    </button>
  );
}

function InventoryTrendChart({ series }: { series: InventoryDailySeriesPoint[] }) {
  const stockSeries = series.filter(hasOverviewSnapshotPoint).slice(-60);
  const salesSeries = series.filter((point) => point.salesUnits > 0 || point.restockUnits > 0).slice(-60);
  const firstSnapshotDate = stockSeries[0]?.date ?? null;

  return (
    <div className="inventory-overview-chart-grid">
      <article className="inventory-overview-chart-card">
        <div className="inventory-overview-chart-header">
          <div>
            <span>Grafico 1</span>
            <h4>Pecas em estoque</h4>
          </div>
          <p>Mostra so a quantidade total da planilha em cada leitura do dia.</p>
        </div>

        {stockSeries.length >= 2 ? (
          <div className="trend-chart-wrap inventory-trend-chart">
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={stockSeries}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.12)" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)]}
                />
                <Area
                  type="monotone"
                  dataKey="totalStockUnits"
                  name="Pecas em estoque"
                  stroke="#2956d7"
                  fill="rgba(95, 140, 255, 0.18)"
                  strokeWidth={2.4}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <InventoryChartEmptyState
            title="Ainda nao da para ver a curva do estoque"
            description={
              firstSnapshotDate
                ? `O historico do estoque comecou em ${formatDate(firstSnapshotDate)}. Quando entrar mais um dia de leitura, esse grafico vai ficar claro.`
                : "Assim que a planilha diaria for sendo lida em mais dias, a curva do estoque aparece aqui."
            }
          />
        )}
      </article>

      <article className="inventory-overview-chart-card">
        <div className="inventory-overview-chart-header">
          <div>
            <span>Grafico 2</span>
            <h4>Modelos ativos</h4>
          </div>
          <p>Mostra quantos modelos diferentes estavam com saldo na leitura de cada dia.</p>
        </div>

        {stockSeries.length >= 2 ? (
          <div className="trend-chart-wrap inventory-trend-chart">
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={stockSeries}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.12)" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)]}
                />
                <Line
                  type="monotone"
                  dataKey="activeModelCount"
                  name="Modelos ativos"
                  stroke="#173260"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <InventoryChartEmptyState
            title="Ainda nao da para ver a curva do mix"
            description="Esse grafico depende de mais de uma leitura diaria da planilha para mostrar se a variedade aumentou ou caiu."
          />
        )}
      </article>

      <article className="inventory-overview-chart-card inventory-overview-chart-card-wide">
        <div className="inventory-overview-chart-header">
          <div>
            <span>Grafico 3</span>
            <h4>Vendas por dia</h4>
          </div>
          <p>Mostra so as vendas do CRM. A reposicao aparece separada em verde quando existir.</p>
        </div>

        {salesSeries.length ? (
          <div className="trend-chart-wrap inventory-trend-chart">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={salesSeries}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.12)" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="sales"
                  tickFormatter={(value) => formatCompactNumber(Number(value))}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  yAxisId="restock"
                  orientation="right"
                  tickFormatter={(value) => formatCompactNumber(Number(value))}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)]}
                />
                <Bar yAxisId="sales" dataKey="salesUnits" name="Pecas vendidas" fill="#d09a29" radius={[8, 8, 0, 0]} maxBarSize={20} />
                <Line
                  yAxisId="restock"
                  type="monotone"
                  dataKey="restockUnits"
                  name="Reposicao"
                  stroke="#2f9d67"
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <InventoryChartEmptyState
            title="Ainda nao apareceram vendas nesse periodo"
            description="Assim que o CRM tiver vendas registradas no recorte atual, elas vao aparecer aqui separadas do estoque."
          />
        )}

        <div className="inventory-chart-legend">
          <span>
            <i className="tone-sales" /> Pecas vendidas
          </span>
          <span>
            <i className="tone-restock" /> Reposicao
          </span>
        </div>
      </article>
    </div>
  );
}

function InventoryModelChart({ series }: { series: InventoryDailySeriesPoint[] }) {
  return (
    <div className="trend-chart-wrap inventory-model-chart">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={series}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.12)" />
          <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
          <YAxis yAxisId="stock" tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 12 }} />
          <YAxis
            yAxisId="activity"
            orientation="right"
            tickFormatter={(value) => formatCompactNumber(Number(value))}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={(value) => formatDate(String(value))}
            formatter={(value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)]}
          />
          <Line
            yAxisId="stock"
            type="monotone"
            dataKey="stockUnits"
            name="Estoque"
            stroke="#2956d7"
            strokeWidth={2.4}
            dot={false}
          />
          <Bar yAxisId="activity" dataKey="salesUnits" name="Vendas" fill="#d09a29" radius={[8, 8, 0, 0]} maxBarSize={16} />
          <Line
            yAxisId="activity"
            type="monotone"
            dataKey="activeSkuCount"
            name="SKUs ativos"
            stroke="#173260"
            strokeWidth={2.3}
            dot={false}
          />
          <Bar
            yAxisId="activity"
            dataKey="restockUnits"
            name="Reposicao"
            fill="#2f9d67"
            radius={[8, 8, 0, 0]}
            maxBarSize={10}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ModelDetailPanel({
  detail,
  isLoading,
}: {
  detail: InventoryModelDetailResponse | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <section className="panel inventory-detail-panel">Carregando analise do modelo...</section>;
  }

  if (!detail?.model) {
    return (
      <section className="panel inventory-detail-panel inventory-detail-empty">
        <div className="empty-state">Escolha um modelo da lista para abrir a analise completa.</div>
      </section>
    );
  }

  const model = detail.model;

  return (
    <section className="panel inventory-detail-panel">
          <div className="inventory-detail-header">
        <div>
          <p className="eyebrow">Detalhe do modelo</p>
          <h3>{model.modelLabel}</h3>
          <p className="panel-subcopy">
            {buyRecommendationLabel(model.buyRecommendation)} · {model.sampleSkus.slice(0, 3).join(", ")}
          </p>
        </div>
        <div className="inventory-note-pills">
          <span className={`inventory-status-pill tone-${productKindTone(model.productKind)}`}>
            {productKindLabel(model.productKind)}
          </span>
          <span className={`inventory-status-pill tone-${buyRecommendationTone(model.buyRecommendation)}`}>
            {buyRecommendationLabel(model.buyRecommendation)}
          </span>
        </div>
      </div>

      <div className="inventory-mini-stats">
        <article className="inventory-mini-stat">
          <span>Pecas em estoque</span>
          <strong>{formatNumber(model.stockUnits)}</strong>
        </article>
        <article className="inventory-mini-stat">
          <span>SKUs ativos</span>
          <strong>{formatNumber(model.activeSkuCount)}</strong>
        </article>
        <article className="inventory-mini-stat">
          <span>Venda 30 dias</span>
          <strong>{formatNumber(model.sales30)}</strong>
        </article>
        <article className="inventory-mini-stat">
          <span>Cobertura</span>
          <strong>{formatCoverage(model.coverageDays)}</strong>
        </article>
      </div>

      <InventoryModelChart series={detail.dailySeries} />

      <div className="inventory-detail-story">
        {detail.highlights.map((line) => (
          <div key={line} className="inventory-story-card">
            <CircleDashed size={16} />
            <span>{line}</span>
          </div>
        ))}
      </div>

      <div className="inventory-benchmark-grid">
        <article className="inventory-benchmark-card">
          <span>Estoque baixo</span>
          <strong>
            {detail.benchmarks.lowStockAvgSales === null ? "Sem base" : `${detail.benchmarks.lowStockAvgSales} pecas/dia`}
          </strong>
        </article>
        <article className="inventory-benchmark-card">
          <span>Estoque alto</span>
          <strong>
            {detail.benchmarks.highStockAvgSales === null ? "Sem base" : `${detail.benchmarks.highStockAvgSales} pecas/dia`}
          </strong>
        </article>
        <article className="inventory-benchmark-card">
          <span>Mix curto</span>
          <strong>
            {detail.benchmarks.shortMixAvgSales === null ? "Sem base" : `${detail.benchmarks.shortMixAvgSales} pecas/dia`}
          </strong>
        </article>
        <article className="inventory-benchmark-card">
          <span>Mix amplo</span>
          <strong>
            {detail.benchmarks.wideMixAvgSales === null ? "Sem base" : `${detail.benchmarks.wideMixAvgSales} pecas/dia`}
          </strong>
        </article>
      </div>

      <div className="inventory-detail-grid">
        <section className="inventory-detail-column">
          <div className="inventory-section-heading">
            <h4>Clientes que mais compram</h4>
            <span>{formatNumber(detail.topCustomers.length)}</span>
          </div>
          {detail.topCustomers.length ? (
            <div className="inventory-detail-list">
              {detail.topCustomers.map((customer) => (
                <article key={customer.customerId} className="inventory-detail-list-row">
                  <div>
                    <strong>{customer.customerDisplayName}</strong>
                    <span>
                      {customer.customerCode} · {formatNumber(customer.totalQuantity)} pecas · {formatDaysSince(daysBetween(customer.lastPurchaseAt, toDateOnly(new Date().toISOString())))}
                    </span>
                  </div>
                  <Link className="ghost-button small-button" to={`/clientes/${customer.customerId}`}>
                    Ver cliente
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Sem clientes com historico deste modelo.</div>
          )}
        </section>

        <section className="inventory-detail-column">
          <div className="inventory-section-heading">
            <h4>Depositos e saldo</h4>
            <span>{formatNumber(detail.deposits.length)}</span>
          </div>
          {detail.deposits.length ? (
            <div className="inventory-detail-list">
              {detail.deposits.map((deposit) => (
                <article key={`${deposit.name}-${deposit.companyName ?? ""}`} className="inventory-detail-list-row">
                  <div>
                    <strong>{deposit.name}</strong>
                    <span>{deposit.companyName ?? "Sem empresa"} </span>
                  </div>
                  <div className="inventory-row-numbers">
                    <strong>{formatNumber(deposit.balance)}</strong>
                    <span>Reservado {formatNumber(deposit.reservedBalance)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Sem leitura de deposito no cache agora.</div>
          )}
        </section>

        <section className="inventory-detail-column">
          <div className="inventory-section-heading">
            <h4>SKUs do modelo</h4>
            <span>{formatNumber(detail.skus.length)}</span>
          </div>
          <div className="inventory-detail-list">
            {detail.skus.map((sku) => (
              <article key={sku.sku} className="inventory-detail-list-row">
                <div>
                  <strong>{sku.sku}</strong>
                  <span>
                    {sku.quality ?? "Sem qualidade"} · {sku.color ?? "Sem cor"}
                  </span>
                </div>
                <div className="inventory-row-numbers">
                  <strong>{formatNumber(sku.stockCurrent)}</strong>
                  <span>Venda 90d {formatNumber(sku.sales90)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export function InventoryPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<InventoryView>("overview");
  const [buyingFilter, setBuyingFilter] = useState<BuyingFilter>("all");
  const [restockWindow, setRestockWindow] = useState<RestockWindow>("all");
  const [staleFilter, setStaleFilter] = useState<StaleFilter>(90);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const deferredSearch = useDeferredValue(modelSearch.trim().toLowerCase());
  const activeTab = viewTabs.find((tab) => tab.value === activeView) ?? viewTabs[0];
  const canRefresh = user?.role === "ADMIN" || user?.role === "MANAGER";

  const snapshotQuery = useQuery({
    queryKey: ["inventory-snapshot"],
    queryFn: () => api.inventorySnapshot(token!),
    enabled: Boolean(token),
  });

  const overviewQuery = useQuery({
    queryKey: ["inventory-overview"],
    queryFn: () => api.inventoryOverview(token!),
    enabled: Boolean(token),
  });

  const buyingQuery = useQuery({
    queryKey: ["inventory-buying"],
    queryFn: () => api.inventoryBuying(token!),
    enabled: Boolean(token && activeView === "buying"),
  });

  const restockQuery = useQuery({
    queryKey: ["inventory-restock"],
    queryFn: () => api.inventoryRestock(token!),
    enabled: Boolean(token && activeView === "restock"),
  });

  const staleQuery = useQuery({
    queryKey: ["inventory-stale"],
    queryFn: () => api.inventoryStale(token!),
    enabled: Boolean(token && activeView === "stale"),
  });

  const modelsQuery = useQuery({
    queryKey: ["inventory-models"],
    queryFn: () => api.inventoryModels(token!),
    enabled: Boolean(token && activeView === "models"),
  });

  const detailQuery = useQuery({
    queryKey: ["inventory-model-detail", selectedModelKey],
    queryFn: () => api.inventoryModelDetail(token!, selectedModelKey!),
    enabled: Boolean(token && activeView === "models" && selectedModelKey),
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.refreshInventorySnapshot(token!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-buying"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-restock"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-stale"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-models"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-model-detail"] }),
      ]);
    },
  });

  const snapshotMeta = overviewQuery.data?.snapshot ?? snapshotQuery.data;
  const latestSeriesDate = overviewQuery.data?.dailySeries.at(-1)?.date ?? toDateOnly(snapshotMeta?.importedAt ?? null);

  const visibleBuyingItems = useMemo(
    () => (buyingQuery.data?.items ?? []).filter((item) => matchesBuyingFilter(item, buyingFilter)),
    [buyingFilter, buyingQuery.data?.items],
  );

  const visibleRestockItems = useMemo(
    () => (restockQuery.data?.items ?? []).filter((item) => matchesRestockWindow(item, latestSeriesDate, restockWindow)),
    [latestSeriesDate, restockQuery.data?.items, restockWindow],
  );

  const visibleStaleItems = useMemo(
    () => (staleQuery.data?.items ?? []).filter((item) => matchesStaleFilter(item, staleFilter)),
    [staleFilter, staleQuery.data?.items],
  );

  const visibleModels = useMemo(() => {
    return (modelsQuery.data?.items ?? []).filter((item) => {
      if (deferredSearch) {
        const haystack = [item.modelLabel, item.brand, item.family, item.sampleSkus.join(" "), item.qualityLabels.join(" ")]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(deferredSearch)) {
          return false;
        }
      }

      if (brandFilter && item.brand !== brandFilter) {
        return false;
      }

      if (familyFilter && item.family !== familyFilter) {
        return false;
      }

      if (qualityFilter && !item.qualityLabels.includes(qualityFilter)) {
        return false;
      }

      return true;
    });
  }, [brandFilter, deferredSearch, familyFilter, modelsQuery.data?.items, qualityFilter]);

  function openModel(modelKey: string) {
    setSelectedModelKey(modelKey);
    setActiveView("models");
  }

  function handleOverviewCardClick(card: InventoryOverviewCard) {
    if (card.targetTab === "buying") {
      setActiveView("buying");
      setBuyingFilter((card.targetFilter as BuyingFilter | null) ?? "all");
      return;
    }

    if (card.targetTab === "restock") {
      setActiveView("restock");
      setRestockWindow(card.targetFilter === "arrived_today" ? "today" : "30d");
      return;
    }

    setActiveView("stale");
    setStaleFilter(card.targetFilter === "90_plus" ? 90 : 30);
  }

  return (
    <div className="page-stack inventory-workspace">
      <section className="panel inventory-shell">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Estoque</p>
            <h2 className="premium-header-title">{activeTab.title}</h2>
            <p className="panel-subcopy">{activeTab.helper}</p>
          </div>

          <div className="inventory-shell-actions">
            {canRefresh ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                <RefreshCcw size={16} />
                {refreshMutation.isPending ? "Atualizando..." : "Atualizar planilha"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="chart-switcher customers-view-switcher inventory-view-switcher" role="tablist" aria-label="Abas de estoque">
          {viewTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeView === tab.value}
              aria-pressed={activeView === tab.value}
              className={`chart-switch-button ${activeView === tab.value ? "active" : ""}`}
              onClick={() => setActiveView(tab.value)}
            >
              <strong>{tab.label}</strong>
            </button>
          ))}
        </div>

        <div className="inventory-shell-meta">
          <span className="inventory-shell-badge">
            <Warehouse size={14} />
            {snapshotMeta ? `Ultima leitura: ${formatDateTime(snapshotMeta.importedAt)}` : "Sem leitura da planilha ainda"}
          </span>
          {snapshotMeta ? (
            <>
              <span className="inventory-shell-badge">
                <Boxes size={14} />
                {formatNumber(snapshotMeta.inStockRows)} SKUs com saldo
              </span>
              <span className="inventory-shell-badge">
                <Tags size={14} />
                {formatNumber(snapshotMeta.totalRows)} linhas na planilha
              </span>
            </>
          ) : null}
        </div>
      </section>

      {activeView === "overview" ? (
        <>
          <section className="inventory-focus-grid">
            {(overviewQuery.data?.cards ?? []).map((card) => (
              <InventoryFocusCard key={card.key} card={card} onClick={handleOverviewCardClick} />
            ))}
          </section>

          <section className="panel">
            <div className="inventory-section-heading">
              <div>
                <p className="eyebrow">Leitura visual</p>
                <h3>Cada grafico mostra uma coisa</h3>
                <p className="panel-subcopy">Separei estoque, variedade e vendas para a leitura ficar mais clara.</p>
              </div>
              <div className="inventory-row-numbers">
                <strong>{formatNumber(overviewQuery.data?.totals.totalStockUnits ?? 0)}</strong>
                <span>Pecas em estoque agora</span>
              </div>
            </div>

            <InventoryTrendChart series={overviewQuery.data?.dailySeries ?? []} />

            <div className="inventory-story-grid">
              {(overviewQuery.data?.highlights ?? []).map((line) => (
                <article key={line} className="inventory-story-card">
                  <TrendingUp size={16} />
                  <span>{line}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="inventory-summary-grid">
            <article className="panel inventory-summary-panel">
              <div className="inventory-section-heading">
                <h3>Leitura do dia</h3>
              </div>
              <div className="inventory-summary-list">
                <div>
                  <span>Modelos ativos</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.activeModelCount ?? 0)}</strong>
                </div>
                <div>
                  <span>SKUs ativos</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.activeSkuCount ?? 0)}</strong>
                </div>
                <div>
                  <span>Venda 30 dias</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.sales30 ?? 0)}</strong>
                </div>
                <div>
                  <span>Capital parado</span>
                  <strong>{formatCurrency(overviewQuery.data?.totals.trappedValue ?? 0)}</strong>
                </div>
              </div>
            </article>

            <article className="panel inventory-summary-panel">
              <div className="inventory-section-heading">
                <h3>Proximo passo</h3>
              </div>
              <div className="inventory-next-actions">
                <button type="button" className="ghost-button" onClick={() => setActiveView("buying")}>
                  Ver compras <ArrowRight size={14} />
                </button>
                <button type="button" className="ghost-button" onClick={() => setActiveView("restock")}>
                  Ver reposicao <ArrowRight size={14} />
                </button>
                <button type="button" className="ghost-button" onClick={() => setActiveView("stale")}>
                  Ver estoque parado <ArrowRight size={14} />
                </button>
              </div>
            </article>
          </section>
        </>
      ) : null}

      {activeView === "buying" ? (
        <>
          <section className="panel inventory-inline-toolbar">
            <div className="inventory-chip-row">
              {[
                { value: "all" as const, label: "Todos" },
                { value: "buy_now" as const, label: "Comprar agora" },
                { value: "ending_soon" as const, label: "Vai acabar" },
                { value: "watch" as const, label: "Acompanhar" },
                { value: "do_not_buy" as const, label: "Nao comprar" },
                { value: "hold_sales" as const, label: "Segurar venda" },
              ].map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  className={`inventory-filter-chip ${buyingFilter === chip.value ? "active" : ""}`}
                  onClick={() => setBuyingFilter(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </section>

          <section className="inventory-card-list">
            {visibleBuyingItems.map((item) => (
              <article key={item.modelKey} className="panel inventory-line-card">
                <div className="inventory-line-header">
                  <div>
                    <p className="eyebrow">Modelo</p>
                    <h3>{item.modelLabel}</h3>
                    <p className="panel-subcopy">{item.sampleSkus.slice(0, 3).join(", ")}</p>
                  </div>
                  <div className="inventory-note-pills">
                    <span className={`inventory-status-pill tone-${productKindTone(item.productKind)}`}>
                      {productKindLabel(item.productKind)}
                    </span>
                    <span className={`inventory-status-pill tone-${buyRecommendationTone(item.buyRecommendation)}`}>
                      {buyRecommendationLabel(item.buyRecommendation)}
                    </span>
                  </div>
                </div>

                <div className="inventory-line-metrics">
                  <div>
                    <span>Pecas</span>
                    <strong>{formatNumber(item.stockUnits)}</strong>
                  </div>
                  <div>
                    <span>SKUs ativos</span>
                    <strong>{formatNumber(item.activeSkuCount)}</strong>
                  </div>
                  <div>
                    <span>Venda 30/90</span>
                    <strong>
                      {formatNumber(item.sales30)} / {formatNumber(item.sales90)}
                    </strong>
                  </div>
                  <div>
                    <span>Cobertura</span>
                    <strong>{formatCoverage(item.coverageDays)}</strong>
                  </div>
                  <div>
                    <span>Ultima venda</span>
                    <strong>{formatDate(item.lastSaleAt)}</strong>
                  </div>
                  <div>
                    <span>Ultima reposicao</span>
                    <strong>{formatDate(item.lastRestockAt)}</strong>
                  </div>
                </div>

                <div className="inventory-line-footer">
                  <div className="inventory-note-pills">
                    {item.holdSales ? <span className="inventory-note-pill tone-danger">Segurar venda</span> : null}
                    {item.trappedValueEstimated ? <span className="inventory-note-pill tone-warning">Valor estimado</span> : null}
                    <span className="inventory-note-pill tone-neutral">Valor em estoque {formatCurrency(item.trappedValue)}</span>
                  </div>

                  <button type="button" className="primary-button small-button" onClick={() => openModel(item.modelKey)}>
                    Abrir analise
                  </button>
                </div>
              </article>
            ))}

            {!visibleBuyingItems.length ? <div className="empty-state">Nenhum modelo entrou nesse filtro agora.</div> : null}
          </section>
        </>
      ) : null}

      {activeView === "restock" ? (
        <>
          <section className="inventory-summary-grid">
            <button type="button" className="panel inventory-summary-panel inventory-summary-clickable" onClick={() => setRestockWindow("today")}>
              <span>Chegou hoje</span>
              <strong>{formatNumber(restockQuery.data?.counts.arrivedToday ?? 0)}</strong>
            </button>
            <button type="button" className="panel inventory-summary-panel inventory-summary-clickable" onClick={() => setRestockWindow("7d")}>
              <span>Chegou e voltou a vender</span>
              <strong>{formatNumber(restockQuery.data?.counts.backToSelling ?? 0)}</strong>
            </button>
            <button type="button" className="panel inventory-summary-panel inventory-summary-clickable" onClick={() => setRestockWindow("30d")}>
              <span>Chegou e ainda nao girou</span>
              <strong>{formatNumber(restockQuery.data?.counts.noReactionYet ?? 0)}</strong>
            </button>
            <article className="panel inventory-summary-panel">
              <span>Ainda precisa repor</span>
              <strong>{formatNumber(restockQuery.data?.counts.restockAgain ?? 0)}</strong>
            </article>
          </section>

          <section className="panel inventory-inline-toolbar">
            <div className="inventory-chip-row">
              {[
                { value: "all" as const, label: "Tudo" },
                { value: "today" as const, label: "Hoje" },
                { value: "7d" as const, label: "7 dias" },
                { value: "30d" as const, label: "30 dias" },
              ].map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  className={`inventory-filter-chip ${restockWindow === chip.value ? "active" : ""}`}
                  onClick={() => setRestockWindow(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </section>

          <section className="inventory-card-list">
            {visibleRestockItems.map((item) => (
              <article key={`${item.modelKey}-${item.lastRestockAt ?? "no-restock"}`} className="panel inventory-line-card">
                <div className="inventory-line-header">
                  <div>
                    <p className="eyebrow">Reposicao</p>
                    <h3>{item.modelLabel}</h3>
                    <p className="panel-subcopy">Ultima entrada: {formatDate(item.lastRestockAt)}</p>
                  </div>
                  <span className={`inventory-status-pill tone-${restockStatusTone(item.status)}`}>
                    {restockStatusLabel(item.status)}
                  </span>
                </div>

                <div className="inventory-line-metrics">
                  <div>
                    <span>Entrou</span>
                    <strong>{formatNumber(item.restockUnits)}</strong>
                  </div>
                  <div>
                    <span>Antes / Depois</span>
                    <strong>
                      {formatNumber(item.stockBefore)} / {formatNumber(item.stockAfter)}
                    </strong>
                  </div>
                  <div>
                    <span>Venda 7d antes</span>
                    <strong>{formatNumber(item.sales7Before)}</strong>
                  </div>
                  <div>
                    <span>Venda 7d depois</span>
                    <strong>{formatNumber(item.sales7After)}</strong>
                  </div>
                  <div>
                    <span>Estoque agora</span>
                    <strong>{formatNumber(item.stockUnits)}</strong>
                  </div>
                  <div>
                    <span>Cobertura</span>
                    <strong>{formatCoverage(item.coverageDays)}</strong>
                  </div>
                </div>

                <div className="inventory-line-footer">
                  <div className="inventory-note-pills">
                    <span className={`inventory-note-pill tone-${buyRecommendationTone(item.buyRecommendation)}`}>
                      {buyRecommendationLabel(item.buyRecommendation)}
                    </span>
                  </div>

                  <button type="button" className="primary-button small-button" onClick={() => openModel(item.modelKey)}>
                    Abrir analise
                  </button>
                </div>
              </article>
            ))}

            {!visibleRestockItems.length ? <div className="empty-state">Nenhum modelo entrou nesse periodo agora.</div> : null}
          </section>
        </>
      ) : null}

      {activeView === "stale" ? (
        <>
          <section className="inventory-summary-grid">
            {[
              { value: 30 as const, label: "30+ dias sem vender", count: staleQuery.data?.counts.stale30 ?? 0 },
              { value: 60 as const, label: "60+ dias sem vender", count: staleQuery.data?.counts.stale60 ?? 0 },
              { value: 90 as const, label: "90+ dias sem vender", count: staleQuery.data?.counts.stale90 ?? 0 },
              { value: 120 as const, label: "120+ dias sem vender", count: staleQuery.data?.counts.stale120 ?? 0 },
            ].map((card) => (
              <button
                key={card.value}
                type="button"
                aria-pressed={staleFilter === card.value}
                className={`panel inventory-summary-panel inventory-summary-clickable ${staleFilter === card.value ? "selected" : ""}`}
                onClick={() => setStaleFilter(card.value)}
              >
                <div className="inventory-summary-top">
                  <span>{card.label}</span>
                  {staleFilter === card.value ? (
                    <span className="inventory-summary-selected-badge">
                      <CheckCircle2 size={14} />
                      Selecionado
                    </span>
                  ) : (
                    <small className="inventory-summary-hint">Clique para filtrar</small>
                  )}
                </div>
                <strong>{formatNumber(card.count)}</strong>
              </button>
            ))}
          </section>

          <section className="inventory-card-list">
            {visibleStaleItems.length ? (
              <section className="panel inventory-stale-table-panel">
                <div className="inventory-section-heading">
                  <div>
                    <p className="eyebrow">Produtos parados</p>
                    <h3>Tabela de produtos sem giro</h3>
                  </div>
                  <span>{formatNumber(visibleStaleItems.length)} modelos</span>
                </div>

                <div className="inventory-stale-table-wrap">
                  <table className="data-table inventory-stale-table">
                    <thead>
                      <tr>
                        <th>Modelo</th>
                        <th>Tipo</th>
                        <th>Dias sem vender</th>
                        <th>Pecas</th>
                        <th>SKUs</th>
                        <th>Ultima venda</th>
                        <th>Venda 90 dias</th>
                        <th>Valor parado</th>
                        <th>Ultima reposicao</th>
                        <th>Acao sugerida</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStaleItems.map((item) => (
                        <tr key={item.modelKey}>
                          <td>
                            <div className="inventory-stale-model-cell">
                              <strong>{item.modelLabel}</strong>
                              <span>{item.brand} · {item.family}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`inventory-status-pill tone-${productKindTone(item.productKind)}`}>
                              {productKindLabel(item.productKind)}
                            </span>
                          </td>
                          <td>
                            <strong>{item.daysSinceLastSale === null ? "Sem venda" : `${formatNumber(item.daysSinceLastSale)} dias`}</strong>
                          </td>
                          <td>{formatNumber(item.stockUnits)}</td>
                          <td>{formatNumber(item.activeSkuCount)}</td>
                          <td>{formatDate(item.lastSaleAt)}</td>
                          <td>{formatNumber(item.sales90)}</td>
                          <td>
                            <div className="inventory-stale-value-cell">
                              <strong>{formatCurrency(item.trappedValue)}</strong>
                              {item.trappedValueEstimated ? <span className="inventory-note-pill tone-warning">Estimado</span> : null}
                            </div>
                          </td>
                          <td>{formatDate(item.lastRestockAt)}</td>
                          <td>
                            <span className={`inventory-status-pill tone-${staleActionTone(item.suggestedAction)}`}>
                              {staleActionLabel(item.suggestedAction)}
                            </span>
                          </td>
                          <td>
                            <button type="button" className="primary-button small-button" onClick={() => openModel(item.modelKey)}>
                              Abrir analise
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="empty-state">Nenhum modelo entrou nessa faixa agora.</div>
            )}
          </section>
        </>
      ) : null}

      {activeView === "models" ? (
        <>
          <section className="panel inventory-search-panel">
            <div className="inventory-search-grid">
              <label>
                Buscar modelo, marca, familia ou SKU
                <input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Ex.: A05, Xiaomi, 1308-1" />
              </label>

              <label>
                Marca
                <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {(modelsQuery.data?.filters.brands ?? []).map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Familia
                <select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {(modelsQuery.data?.filters.families ?? []).map((family) => (
                    <option key={family} value={family}>
                      {family}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Qualidade
                <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {(modelsQuery.data?.filters.qualities ?? []).map((quality) => (
                    <option key={quality} value={quality}>
                      {quality}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="inventory-models-layout">
            <section className="panel inventory-model-list-panel">
              <div className="inventory-section-heading">
                <div>
                  <p className="eyebrow">Catalogo</p>
                  <h3>Modelos para analisar</h3>
                </div>
                <span>{formatNumber(visibleModels.length)}</span>
              </div>

              <div className="inventory-model-list">
                {visibleModels.map((item) => (
                  <button
                    key={item.modelKey}
                    type="button"
                    className={`inventory-model-button ${selectedModelKey === item.modelKey ? "active" : ""}`}
                    onClick={() => setSelectedModelKey(item.modelKey)}
                  >
                    <div>
                      <strong>{item.modelLabel}</strong>
                      <span>
                        {productKindLabel(item.productKind)} · {item.sampleSkus.slice(0, 3).join(", ")} · {item.qualityLabels.slice(0, 2).join(", ") || "Sem qualidade"}
                      </span>
                    </div>
                    <div className="inventory-row-numbers">
                      <strong>{formatNumber(item.stockUnits)}</strong>
                      <span>{buyRecommendationLabel(item.buyRecommendation)}</span>
                    </div>
                  </button>
                ))}

                {!visibleModels.length ? <div className="empty-state">Nenhum modelo bateu com essa busca.</div> : null}
              </div>
            </section>

            <ModelDetailPanel detail={detailQuery.data} isLoading={detailQuery.isLoading} />
          </section>
        </>
      ) : null}
    </div>
  );
}

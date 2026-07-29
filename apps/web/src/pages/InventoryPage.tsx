import type {
  InventoryBuyingListItem,
  InventoryDailySeriesPoint,
  InventoryModelDetailResponse,
  InventoryOverviewCard,
  InventoryProductKind,
  InventoryRestockListItem,
  InventoryStaleListItem,
} from "@olist-crm/shared";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Download,
  Package,
  RefreshCcw,
  ShoppingCart,
  Tags,
  TrendingDown,
  TrendingUp,
  Warehouse,
  X,
} from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { InventorySalesTab } from "../components/InventorySalesTab";
import { InventoryStockTab } from "../components/InventoryStockTab";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDateTime, formatDaysSince, formatNumber, formatShortDate } from "../lib/format";

type InventoryView = "overview" | "screens" | "sales" | "buying" | "restock" | "stale" | "models";
type BuyingFilter = "all" | "buy_now" | "ending_soon" | "watch" | "do_not_buy" | "hold_sales";
type RestockWindow = "all" | "today" | "7d" | "30d";
type StaleFilter = "30_60" | "60_90" | "90_120" | "120plus";
type InventoryKindFilter = "all" | InventoryProductKind;
type ModelRecommendationFilter = "all" | InventoryBuyingListItem["buyRecommendation"];
type ModelSort = "priority" | "stock" | "sales30" | "sales90" | "lastSale";

const viewTabs = [
  {
    value: "overview" as const,
    label: "Resumo",
    helper: "Visao rapida para a chefe bater o olho e entender o que fazer primeiro.",
    title: "Resumo do estoque",
  },
  {
    value: "screens" as const,
    label: "Estoque",
    helper: "Consulte a quantidade disponível por modelo e filtre por tipo de produto, marca ou qualidade.",
    title: "Estoque",
  },
  {
    value: "sales" as const,
    label: "Vendas",
    helper: "Veja quantas pecas cada modelo vendeu: por tela, DOC, bateria, marca e qualidade, mes a mes.",
    title: "Vendas por modelo",
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
    label: "Análise",
    helper: "Compare estoque, giro e necessidade de compra de cada SKU em uma única visão.",
    title: "Análise por SKU",
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
  if (value === "DOC_DE_CARGA") {
    return "DOC de Carga";
  }

  if (value === "BATERIA") {
    return "Bateria";
  }

  return "Tela";
}

function productKindTone(value: InventoryStaleListItem["productKind"] | InventoryBuyingListItem["productKind"]) {
  if (value === "DOC_DE_CARGA") {
    return "warning";
  }

  if (value === "BATERIA") {
    return "neutral";
  }

  return "success";
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
  const days = item.daysSinceLastSale;

  if (filter === "30_60") {
    return days !== null && days >= 30 && days < 60;
  }

  if (filter === "60_90") {
    return days !== null && days >= 60 && days < 90;
  }

  if (filter === "90_120") {
    return days !== null && days >= 90 && days < 120;
  }

  // 120plus: includes null (never sold)
  return days === null || days >= 120;
}

function formatSeriesValue(dataKey: string, value: number) {
  if (dataKey.includes("Units") || dataKey.includes("Stock")) {
    return `${formatNumber(value)} pecas`;
  }

  if (dataKey.includes("SkuCount")) {
    return `${formatNumber(value)} SKUs`;
  }

  if (dataKey.includes("Count")) {
    return `${formatNumber(value)} SKUs`;
  }

  return formatNumber(value);
}

const inventoryKindChartConfig = [
  {
    value: "TELA" as const,
    label: "Telas",
    stockKey: "totalStockUnitsTela" as const,
    activeSkuKey: "activeSkuCountTela" as const,
    salesKey: "salesUnitsTela" as const,
    restockKey: "restockUnitsTela" as const,
    color: "#2956d7",
    fill: "rgba(95, 140, 255, 0.18)",
  },
  {
    value: "BATERIA" as const,
    label: "Baterias",
    stockKey: "totalStockUnitsBattery" as const,
    activeSkuKey: "activeSkuCountBattery" as const,
    salesKey: "salesUnitsBattery" as const,
    restockKey: "restockUnitsBattery" as const,
    color: "#2f9d67",
    fill: "rgba(47, 157, 103, 0.16)",
  },
  {
    value: "DOC_DE_CARGA" as const,
    label: "DOCs de Carga",
    stockKey: "totalStockUnitsDoc" as const,
    activeSkuKey: "activeSkuCountDoc" as const,
    salesKey: "salesUnitsDoc" as const,
    restockKey: "restockUnitsDoc" as const,
    color: "#d09a29",
    fill: "rgba(208, 154, 41, 0.18)",
  },
] as const;

function overviewSeriesValue(
  point: InventoryDailySeriesPoint,
  filter: InventoryKindFilter,
  metric: "stock" | "activeSku" | "sales" | "restock",
) {
  if (filter === "all") {
    if (metric === "stock") return point.totalStockUnits;
    if (metric === "activeSku") return point.activeSkuCount ?? 0;
    if (metric === "sales") return point.salesUnits;
    return point.restockUnits;
  }

  const config = inventoryKindChartConfig.find((item) => item.value === filter);
  if (!config) return 0;
  if (metric === "stock") return Number(point[config.stockKey] ?? 0);
  if (metric === "activeSku") return Number(point[config.activeSkuKey] ?? 0);
  if (metric === "sales") return Number(point[config.salesKey] ?? 0);
  return Number(point[config.restockKey] ?? 0);
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

function InventoryTrendChart({
  series,
  kindFilter,
}: {
  series: InventoryDailySeriesPoint[];
  kindFilter: InventoryKindFilter;
}) {
  const visibleKindConfigs =
    kindFilter === "all"
      ? inventoryKindChartConfig
      : inventoryKindChartConfig.filter((config) => config.value === kindFilter);
  const selectedKindConfig =
    kindFilter === "all" ? null : inventoryKindChartConfig.find((config) => config.value === kindFilter) ?? null;
  const salesDataKey = selectedKindConfig?.salesKey ?? "salesUnits";
  const restockDataKey = selectedKindConfig?.restockKey ?? "restockUnits";
  const stockSeries = series
    .filter(
      (point) =>
        overviewSeriesValue(point, kindFilter, "stock") > 0 ||
        overviewSeriesValue(point, kindFilter, "activeSku") > 0,
    )
    .slice(-60);
  const salesSeries = series
    .filter(
      (point) =>
        overviewSeriesValue(point, kindFilter, "sales") > 0 ||
        overviewSeriesValue(point, kindFilter, "restock") > 0,
    )
    .slice(-60);
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

        {stockSeries.length > 0 ? (
          <div className="trend-chart-wrap inventory-trend-chart">
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart syncId="inventory-overview" syncMethod="value" data={stockSeries}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.12)" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)]}
                />
                {visibleKindConfigs.map((config) => (
                  <Area
                    key={config.value}
                    type="monotone"
                    dataKey={config.stockKey}
                    name={`Pecas ${config.label}`}
                    stroke={config.color}
                    fill={config.fill}
                    strokeWidth={2.4}
                    dot={stockSeries.length === 1 ? { r: 4, fill: config.color } : false}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            <div className="inventory-chart-legend">
              {visibleKindConfigs.map((config) => (
                <span key={config.value}>
                  <i style={{ backgroundColor: config.color }} /> {config.label}
                </span>
              ))}
            </div>
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
            <h4>SKUs ativos</h4>
          </div>
          <p>Mostra quantos SKUs de Telas, Baterias e DOCs estavam com saldo maior que zero.</p>
        </div>

        {stockSeries.length > 0 ? (
          <div className="trend-chart-wrap inventory-trend-chart">
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart syncId="inventory-overview" syncMethod="value" data={stockSeries}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(41, 86, 215, 0.12)" />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => formatCompactNumber(Number(value))} tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value, name) => [formatSeriesValue(String(name), Number(value ?? 0)), String(name)]}
                />
                {visibleKindConfigs.map((config) => (
                  <Line
                    key={config.value}
                    type="monotone"
                    dataKey={config.activeSkuKey}
                    name={`SKUs ${config.label}`}
                    stroke={config.color}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
            <div className="inventory-chart-legend">
              {visibleKindConfigs.map((config) => (
                <span key={config.value}>
                  <i style={{ backgroundColor: config.color }} /> {config.label}
                </span>
              ))}
            </div>
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
            <h4>Vendas e entradas por dia</h4>
          </div>
          <p>A entrada e estimada pela diferença de saldo somada às vendas ocorridas entre as leituras.</p>
        </div>

        {salesSeries.length ? (
          <div className="trend-chart-wrap inventory-trend-chart">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart syncId="inventory-overview" syncMethod="value" data={salesSeries}>
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
                <Bar
                  yAxisId="sales"
                  dataKey={salesDataKey}
                  name={selectedKindConfig ? `Vendas ${selectedKindConfig.label}` : "Pecas vendidas"}
                  fill="#d09a29"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={20}
                />
                <Line
                  yAxisId="restock"
                  type="monotone"
                  dataKey={restockDataKey}
                  name={selectedKindConfig ? `Entradas ${selectedKindConfig.label}` : "Entrada estimada"}
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
            <i className="tone-restock" /> Entrada de estoque estimada
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
    return <section className="panel sku-detail-panel">Carregando diagnóstico do SKU...</section>;
  }

  if (!detail?.model) {
    return (
      <section className="panel sku-detail-panel inventory-detail-empty">
        <div className="empty-state">Selecione um SKU na tabela para abrir o diagnóstico completo.</div>
      </section>
    );
  }

  const model = detail.model;
  const decisionCopy =
    model.buyRecommendation === "BUY_NOW"
      ? "Reposição recomendada: a demanda recente está pressionando o estoque disponível."
      : model.buyRecommendation === "WATCH"
        ? "Acompanhe este SKU: estoque e ritmo de venda pedem revisão antes da próxima compra."
        : "Evite uma nova compra agora: priorize vender o saldo atual antes de repor.";

  return (
    <section className="panel sku-detail-panel">
      <div className="sku-detail-hero">
        <div className="sku-detail-identity">
          <p className="eyebrow">Diagnóstico selecionado</p>
          <h3>{model.modelLabel}</h3>
          <p className="panel-subcopy">
            {model.sku} · {model.brand} · {model.qualityLabels.join(", ") || "Sem qualidade informada"}
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

      <div className={`sku-decision-banner tone-${buyRecommendationTone(model.buyRecommendation)}`}>
        <div>
          <span>Orientação de compra</span>
          <strong>{decisionCopy}</strong>
        </div>
        <div className="sku-detail-meta">
          <span>Última venda: {model.lastSaleAt ? formatDate(model.lastSaleAt) : "sem registro"}</span>
          <span>Última reposição: {model.lastRestockAt ? formatDate(model.lastRestockAt) : "sem registro"}</span>
        </div>
      </div>

      <div className="invsales-kpi-grid">
        <article className="invsales-kpi">
          <span>Estoque atual</span>
          <strong>{formatNumber(model.stockUnits)}</strong>
          <small>{formatNumber(model.activeSkuCount)} variações com saldo</small>
        </article>
        <article className="invsales-kpi">
          <span>Vendas em 30 dias</span>
          <strong>{formatNumber(model.sales30)}</strong>
          <small>{formatNumber(model.orders30)} pedidos no período</small>
        </article>
        <article className="invsales-kpi">
          <span>Vendas em 90 dias</span>
          <strong>{formatNumber(model.sales90)}</strong>
          <small>{formatNumber(model.orders90)} pedidos no período</small>
        </article>
        <article className="invsales-kpi">
          <span>Cobertura estimada</span>
          <strong>{formatCoverage(model.coverageDays)}</strong>
          <small>{formatDaysSince(model.daysSinceLastSale)}</small>
        </article>
      </div>

      <div className="inventory-overview-chart-card sku-detail-chart-card">
        <div className="inventory-section-heading">
          <div>
            <p className="eyebrow">Movimentação</p>
            <h4>Estoque, vendas e reposições</h4>
            <p className="panel-subcopy">Veja se a entrada de peças realmente virou venda depois da reposição.</p>
          </div>
        </div>
        {detail.dailySeries.length ? (
          <InventoryModelChart series={detail.dailySeries} />
        ) : (
          <div className="empty-state">Ainda não há histórico diário suficiente para este SKU.</div>
        )}
      </div>

      {detail.highlights.length ? (
        <section className="sku-detail-section">
          <div className="sku-detail-section-heading">
            <div>
              <p className="eyebrow">Leitura recomendada</p>
              <h4>O que merece atenção neste SKU</h4>
            </div>
          </div>
          <div className="inventory-detail-story">
            {detail.highlights.map((line) => (
              <div key={line} className="inventory-story-card">
                <CircleDashed size={16} />
                <span>{line}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="sku-comparison-grid">
        <article className="sku-comparison-card">
          <div>
            <span>Comparação histórica</span>
            <strong>Efeito do nível de estoque</strong>
          </div>
          <div className="sku-comparison-values">
            <div>
              <span>Estoque baixo</span>
              <strong>
                {detail.benchmarks.lowStockAvgSales === null ? "Sem base" : `${detail.benchmarks.lowStockAvgSales} peças/dia`}
              </strong>
            </div>
            <div>
              <span>Estoque alto</span>
              <strong>
                {detail.benchmarks.highStockAvgSales === null ? "Sem base" : `${detail.benchmarks.highStockAvgSales} peças/dia`}
              </strong>
            </div>
          </div>
        </article>
        <article className="sku-comparison-card">
          <div>
            <span>Comparação histórica</span>
            <strong>Efeito da variedade disponível</strong>
          </div>
          <div className="sku-comparison-values">
            <div>
              <span>Mix curto</span>
              <strong>
                {detail.benchmarks.shortMixAvgSales === null ? "Sem base" : `${detail.benchmarks.shortMixAvgSales} peças/dia`}
              </strong>
            </div>
            <div>
              <span>Mix amplo</span>
              <strong>
                {detail.benchmarks.wideMixAvgSales === null ? "Sem base" : `${detail.benchmarks.wideMixAvgSales} peças/dia`}
              </strong>
            </div>
          </div>
        </article>
      </div>

      <div className="sku-detail-grid">
        <section className="sku-detail-card">
          <div className="inventory-section-heading">
            <div>
              <p className="eyebrow">Disponibilidade</p>
              <h4>Depósitos e saldo</h4>
            </div>
            <span>{formatNumber(detail.deposits.length)}</span>
          </div>
          {detail.deposits.length ? (
            <div className="inventory-detail-list">
              {detail.deposits.map((deposit) => (
                <article key={`${deposit.name}-${deposit.companyName ?? ""}`} className="inventory-detail-list-row">
                  <div>
                    <strong>{deposit.name}</strong>
                    <span>{deposit.companyName ?? "Sem empresa informada"}</span>
                  </div>
                  <div className="inventory-row-numbers">
                    <strong>{formatNumber(deposit.balance)}</strong>
                    <span>{formatNumber(deposit.reservedBalance)} reservadas</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Sem leitura de depósito no cache agora.</div>
          )}
        </section>

        <section className="sku-detail-card">
          <div className="inventory-section-heading">
            <div>
              <p className="eyebrow">Demanda</p>
              <h4>Clientes que mais compram</h4>
            </div>
            <span>{formatNumber(detail.topCustomers.length)}</span>
          </div>
          {detail.topCustomers.length ? (
            <div className="inventory-detail-list">
              {detail.topCustomers.map((customer) => (
                <article key={customer.customerId} className="inventory-detail-list-row">
                  <div>
                    <strong>{customer.customerDisplayName}</strong>
                    <span>
                      {customer.customerCode} · {formatNumber(customer.totalQuantity)} peças em {formatNumber(customer.totalOrders)} pedidos
                    </span>
                  </div>
                  <Link className="ghost-button small-button" to={`/clientes/${customer.customerId}`}>
                    Ver cliente
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Sem clientes com histórico deste SKU.</div>
          )}
        </section>

        <section className="sku-detail-card">
          <div className="inventory-section-heading">
            <div>
              <p className="eyebrow">Composição</p>
              <h4>Variações do SKU</h4>
            </div>
            <span>{formatNumber(detail.skus.length)}</span>
          </div>
          {detail.skus.length ? (
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
                    <strong>{formatNumber(sku.stockCurrent)} em estoque</strong>
                    <span>{formatNumber(sku.sales90)} vendas em 90d</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Sem variações vinculadas a este SKU.</div>
          )}
        </section>
      </div>
    </section>
  );
}

function staleFilterFileLabel(filter: StaleFilter) {
  if (filter === "30_60") {
    return "30_a_60_dias";
  }

  if (filter === "60_90") {
    return "60_a_90_dias";
  }

  if (filter === "90_120") {
    return "90_a_120_dias";
  }

  return "120_dias_ou_mais";
}

function exportStaleItemsToExcel(items: InventoryStaleListItem[], filter: StaleFilter) {
  const headers = [
    "SKU",
    "Modelo",
    "Marca",
    "Cor",
    "Qualidade",
    "Tipo",
    "Dias sem vender",
    "Pecas",
    "Ultima venda",
    "Preco unitario",
    "Valor parado",
    "Valor estimado",
    "Ultima reposicao",
    "Acao sugerida",
  ];

  const csvLines = [
    "﻿" + headers.join(";"),
    ...items.map((item) =>
      [
        item.sku ?? "",
        item.modelLabel ?? "",
        item.brand ?? "",
        item.color ?? "",
        item.quality ?? "",
        productKindLabel(item.productKind),
        item.daysSinceLastSale === null ? "Sem venda" : item.daysSinceLastSale,
        item.stockUnits ?? 0,
        toDateOnly(item.lastSaleAt) ?? "",
        item.unitPrice ?? 0,
        item.trappedValue ?? 0,
        item.trappedValueEstimated ? "Sim" : "Nao",
        toDateOnly(item.lastRestockAt) ?? "",
        staleActionLabel(item.suggestedAction),
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(";"),
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `estoque_parado_${staleFilterFileLabel(filter)}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function InventoryPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<InventoryView>("overview");
  const [overviewKindFilter, setOverviewKindFilter] = useState<InventoryKindFilter>("all");
  const [buyingFilter, setBuyingFilter] = useState<BuyingFilter>("all");
  const [restockWindow, setRestockWindow] = useState<RestockWindow>("all");
  const [staleFilter, setStaleFilter] = useState<StaleFilter>("30_60");
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [modelKindFilter, setModelKindFilter] = useState<InventoryKindFilter>("all");
  const [modelRecommendationFilter, setModelRecommendationFilter] = useState<ModelRecommendationFilter>("all");
  const [modelSort, setModelSort] = useState<ModelSort>("priority");
  const [brandFilter, setBrandFilter] = useState("");
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
    enabled: Boolean(token && (activeView === "models" || activeView === "screens")),
  });

  const detailQuery = useQuery({
    queryKey: ["inventory-model-detail", selectedModelKey],
    queryFn: () => api.inventoryModelDetail(token!, selectedModelKey!),
    enabled: Boolean(token && (activeView === "models" || activeView === "screens") && selectedModelKey),
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

  const staleBucketValues = useMemo(() => {
    const result = {
      stale30_60: 0,
      stale60_90: 0,
      stale90_120: 0,
      stale120plus: 0,
    };
    if (!staleQuery.data?.items) return result;

    for (const item of staleQuery.data.items) {
      const days = item.daysSinceLastSale;
      const val = item.trappedValue ?? 0;
      if (days !== null && days >= 30 && days < 60) {
        result.stale30_60 += val;
      } else if (days !== null && days >= 60 && days < 90) {
        result.stale60_90 += val;
      } else if (days !== null && days >= 90 && days < 120) {
        result.stale90_120 += val;
      } else if (days === null || days >= 120) {
        result.stale120plus += val;
      }
    }
    return result;
  }, [staleQuery.data?.items]);

  const visibleModels = useMemo(() => {
    const filtered = (modelsQuery.data?.items ?? []).filter((item) => {
      if (deferredSearch) {
        const haystack = [item.sku, item.modelLabel, item.brand, item.qualityLabels.join(" ")]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(deferredSearch)) {
          return false;
        }
      }

      if (modelKindFilter !== "all" && item.productKind !== modelKindFilter) {
        return false;
      }

      if (modelRecommendationFilter !== "all" && item.buyRecommendation !== modelRecommendationFilter) {
        return false;
      }

      if (brandFilter && item.brand !== brandFilter) {
        return false;
      }

      if (qualityFilter && !item.qualityLabels.includes(qualityFilter)) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((left, right) => {
      if (modelSort === "stock") return right.stockUnits - left.stockUnits || right.sales30 - left.sales30;
      if (modelSort === "sales30") return right.sales30 - left.sales30 || right.stockUnits - left.stockUnits;
      if (modelSort === "sales90") return right.sales90 - left.sales90 || right.stockUnits - left.stockUnits;
      if (modelSort === "lastSale") return (right.lastSaleAt ?? "").localeCompare(left.lastSaleAt ?? "");

      const priority = { BUY_NOW: 0, WATCH: 1, DO_NOT_BUY: 2 };
      return (
        priority[left.buyRecommendation] - priority[right.buyRecommendation]
        || right.sales30 - left.sales30
        || left.modelLabel.localeCompare(right.modelLabel, "pt-BR")
      );
    });
  }, [
    brandFilter,
    deferredSearch,
    modelKindFilter,
    modelRecommendationFilter,
    modelSort,
    modelsQuery.data?.items,
    qualityFilter,
  ]);

  const modelSummary = useMemo(
    () => ({
      stockUnits: visibleModels.reduce((total, item) => total + Math.max(0, item.stockUnits), 0),
      sales30: visibleModels.reduce((total, item) => total + Math.max(0, item.sales30), 0),
      buyNow: visibleModels.filter((item) => item.buyRecommendation === "BUY_NOW").length,
      stale: visibleModels.filter((item) => item.daysSinceLastSale === null || item.daysSinceLastSale >= 60).length,
    }),
    [visibleModels],
  );

  const modelFilterCrumbs = [
    modelKindFilter !== "all"
      ? { label: `Tipo: ${productKindLabel(modelKindFilter)}`, clear: () => setModelKindFilter("all") }
      : null,
    modelRecommendationFilter !== "all"
      ? {
          label: `Decisão: ${buyRecommendationLabel(modelRecommendationFilter)}`,
          clear: () => setModelRecommendationFilter("all"),
        }
      : null,
    brandFilter ? { label: `Marca: ${brandFilter}`, clear: () => setBrandFilter("") } : null,
    qualityFilter ? { label: `Qualidade: ${qualityFilter}`, clear: () => setQualityFilter("") } : null,
    modelSearch ? { label: `Busca: ${modelSearch}`, clear: () => setModelSearch("") } : null,
  ].filter((crumb): crumb is { label: string; clear: () => void } => Boolean(crumb));

  function clearModelFilters() {
    setModelSearch("");
    setModelKindFilter("all");
    setModelRecommendationFilter("all");
    setBrandFilter("");
    setQualityFilter("");
    setModelSort("priority");
  }

  useEffect(() => {
    if (activeView !== "models" || !visibleModels.length) return;
    if (!selectedModelKey || !visibleModels.some((item) => item.modelKey === selectedModelKey)) {
      setSelectedModelKey(visibleModels[0]!.modelKey);
    }
  }, [activeView, selectedModelKey, visibleModels]);

  function openModel(modelKey: string) {
    clearModelFilters();
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
    setStaleFilter(card.targetFilter === "90_plus" ? "90_120" : "30_60");
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
              <div className="inventory-overview-totals">
                <div className="inventory-row-numbers">
                  <strong>{formatNumber(overviewQuery.data?.totals.totalStockUnitsTela ?? 0)}</strong>
                  <span>Telas em estoque</span>
                </div>
                <div className="inventory-row-numbers">
                  <strong>{formatNumber(overviewQuery.data?.totals.totalStockUnitsBattery ?? 0)}</strong>
                  <span>Baterias em estoque</span>
                </div>
                <div className="inventory-row-numbers">
                  <strong>{formatNumber(overviewQuery.data?.totals.totalStockUnitsDoc ?? 0)}</strong>
                  <span>DOCs em estoque</span>
                </div>
                <div className="inventory-row-numbers">
                  <strong>{formatNumber(overviewQuery.data?.totals.totalStockUnits ?? 0)}</strong>
                  <span>Pecas totais agora</span>
                </div>
              </div>
            </div>

            <div className="inventory-overview-kind-filter" aria-label="Filtrar gráficos por tipo de produto">
              <span>Exibir nos gráficos</span>
              <div className="inventory-chip-row">
                {[
                  { value: "all" as const, label: "Todos" },
                  { value: "TELA" as const, label: "Telas" },
                  { value: "BATERIA" as const, label: "Baterias" },
                  { value: "DOC_DE_CARGA" as const, label: "DOCs de carga" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`inventory-filter-chip ${overviewKindFilter === option.value ? "active" : ""}`}
                    aria-pressed={overviewKindFilter === option.value}
                    onClick={() => setOverviewKindFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <InventoryTrendChart series={overviewQuery.data?.dailySeries ?? []} kindFilter={overviewKindFilter} />

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
                  <span>SKUs ativos totais</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.activeSkuCount ?? 0)}</strong>
                </div>
                <div>
                  <span>SKUs Telas</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.activeSkuCountTela ?? 0)}</strong>
                </div>
                <div>
                  <span>SKUs Baterias</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.activeSkuCountBattery ?? 0)}</strong>
                </div>
                <div>
                  <span>SKUs DOCs</span>
                  <strong>{formatNumber(overviewQuery.data?.totals.activeSkuCountDoc ?? 0)}</strong>
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

      {activeView === "sales" ? <InventorySalesTab onOpenModel={openModel} /> : null}

      {activeView === "screens" ? (
        <InventoryStockTab
          data={modelsQuery.data}
          detail={detailQuery.data}
          isDetailError={detailQuery.isError}
          isDetailLoading={detailQuery.isLoading}
          isError={modelsQuery.isError}
          isLoading={modelsQuery.isLoading}
          selectedModelKey={selectedModelKey}
          onSelectModel={(modelKey) => setSelectedModelKey(modelKey)}
        />
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
            {visibleBuyingItems.length ? (
              <section className="panel inventory-stale-table-panel">
                <div className="inventory-section-heading">
                  <div>
                    <p className="eyebrow">Compras</p>
                    <h3>Tabela de compras</h3>
                  </div>
                  <span>{formatNumber(visibleBuyingItems.length)} SKUs</span>
                </div>

                <div className="inventory-stale-table-wrap">
                  <table className="data-table inventory-stale-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Tipo</th>
                        <th>Em estoque</th>
                        <th>Status SKU</th>
                        <th>Venda 30/90</th>
                        <th>Cobertura</th>
                        <th>Ultima venda</th>
                        <th>Ultima reposicao</th>
                        <th>Valor em estoque</th>
                        <th>Recomendacao</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBuyingItems.map((item) => (
                        <tr key={item.modelKey}>
                          <td>
                            <div className="inventory-stale-model-cell">
                              <strong>{item.sku}</strong>
                              <span>
                                {item.modelLabel} · {item.brand} · {item.family}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`inventory-status-pill tone-${productKindTone(item.productKind)}`}>
                              {productKindLabel(item.productKind)}
                            </span>
                          </td>
                          <td>
                            <strong>{formatNumber(item.stockUnits)}</strong>
                          </td>
                          <td>
                            <strong>{item.activeSkuCount > 0 ? "Ativo" : "Sem saldo"}</strong>
                            <span className="inventory-table-secondary-text">{formatNumber(item.totalSkuCount)} linha(s)</span>
                          </td>
                          <td>
                            <strong>
                              {formatNumber(item.sales30)} / {formatNumber(item.sales90)}
                            </strong>
                          </td>
                          <td>{formatCoverage(item.coverageDays)}</td>
                          <td>{formatDate(item.lastSaleAt)}</td>
                          <td>{formatDate(item.lastRestockAt)}</td>
                          <td>
                            <div className="inventory-stale-value-cell">
                              <strong>{formatCurrency(item.trappedValue)}</strong>
                              {item.trappedValueEstimated ? <span className="inventory-note-pill tone-warning">Estimado</span> : null}
                            </div>
                          </td>
                          <td>
                            <div className="inventory-stale-value-cell">
                              <span className={`inventory-status-pill tone-${buyRecommendationTone(item.buyRecommendation)}`}>
                                {buyRecommendationLabel(item.buyRecommendation)}
                              </span>
                              {item.holdSales ? <span className="inventory-note-pill tone-danger">Segurar venda</span> : null}
                            </div>
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
              <div className="empty-state">Nenhum SKU entrou nesse filtro agora.</div>
            )}
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
            {visibleRestockItems.length ? (
              <section className="panel inventory-stale-table-panel">
                <div className="inventory-section-heading">
                  <div>
                    <p className="eyebrow">Reposicao</p>
                    <h3>Tabela de reposicao</h3>
                  </div>
                  <span>{formatNumber(visibleRestockItems.length)} SKUs</span>
                </div>

                <div className="inventory-stale-table-wrap">
                  <table className="data-table inventory-stale-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Tipo</th>
                        <th>Ultima entrada</th>
                        <th>Entrou</th>
                        <th>Antes / Depois</th>
                        <th>Venda 7d antes</th>
                        <th>Venda 7d depois</th>
                        <th>Em estoque</th>
                        <th>Cobertura</th>
                        <th>Recomendacao</th>
                        <th>Status</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRestockItems.map((item) => (
                        <tr key={`${item.modelKey}-${item.lastRestockAt ?? "no-restock"}`}>
                          <td>
                            <div className="inventory-stale-model-cell">
                              <strong>{item.sku}</strong>
                              <span>
                                {item.modelLabel} · {item.brand} · {item.family}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`inventory-status-pill tone-${productKindTone(item.productKind)}`}>
                              {productKindLabel(item.productKind)}
                            </span>
                          </td>
                          <td>{formatDate(item.lastRestockAt)}</td>
                          <td>
                            <strong>{formatNumber(item.restockUnits)}</strong>
                          </td>
                          <td>
                            <strong>
                              {formatNumber(item.stockBefore)} / {formatNumber(item.stockAfter)}
                            </strong>
                          </td>
                          <td>{formatNumber(item.sales7Before)}</td>
                          <td>{formatNumber(item.sales7After)}</td>
                          <td>
                            <div className="inventory-stale-value-cell">
                              <strong>{formatNumber(item.stockUnits)}</strong>
                              <span className="inventory-table-secondary-text">{item.activeSkuCount > 0 ? "SKU ativo" : "Sem saldo"}</span>
                            </div>
                          </td>
                          <td>{formatCoverage(item.coverageDays)}</td>
                          <td>
                            <span className={`inventory-status-pill tone-${buyRecommendationTone(item.buyRecommendation)}`}>
                              {buyRecommendationLabel(item.buyRecommendation)}
                            </span>
                          </td>
                          <td>
                            <span className={`inventory-status-pill tone-${restockStatusTone(item.status)}`}>
                              {restockStatusLabel(item.status)}
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
              <div className="empty-state">Nenhum SKU entrou nesse periodo agora.</div>
            )}
          </section>
        </>
      ) : null}

      {activeView === "stale" ? (
        <>
          <section className="inventory-summary-grid">
            {[
              { value: "30_60" as const, label: "30 a 60 dias sem vender", count: staleQuery.data?.counts.stale30_60 ?? 0 },
              { value: "60_90" as const, label: "60 a 90 dias sem vender", count: staleQuery.data?.counts.stale60_90 ?? 0 },
              { value: "90_120" as const, label: "90 a 120 dias sem vender", count: staleQuery.data?.counts.stale90_120 ?? 0 },
              { value: "120plus" as const, label: "120+ dias sem vender", count: staleQuery.data?.counts.stale120plus ?? 0 },
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
                <div style={{ marginTop: "0.4rem" }}>
                  <strong style={{ fontSize: "1.55rem", display: "block", color: "#0f172a", marginBottom: "0.15rem" }}>
                    {formatNumber(card.count)} SKUs
                  </strong>
                  <span style={{ fontSize: "0.95rem", color: "#475569", display: "block", fontWeight: 600 }}>
                    {formatCurrency(
                      card.value === "30_60" ? staleBucketValues.stale30_60 :
                      card.value === "60_90" ? staleBucketValues.stale60_90 :
                      card.value === "90_120" ? staleBucketValues.stale90_120 :
                      staleBucketValues.stale120plus
                    )} parados
                  </span>
                </div>
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
                  <div className="inventory-stale-heading-actions">
                    <span>{formatNumber(visibleStaleItems.length)} SKUs</span>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => exportStaleItemsToExcel(visibleStaleItems, staleFilter)}
                    >
                      <Download size={16} />
                      Baixar Excel
                    </button>
                  </div>
                </div>

                <div className="inventory-stale-table-wrap">
                  <table className="data-table inventory-stale-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Modelo</th>
                        <th>Tipo</th>
                        <th>Dias sem vender</th>
                        <th>Pecas</th>
                        <th>Ultima venda</th>
                        <th>Preco unitario</th>
                        <th>Valor parado</th>
                        <th>Ultima reposicao</th>
                        <th>Acao sugerida</th>
                        <th>Abrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStaleItems.map((item) => (
                        <tr key={item.sku}>
                          <td><code>{item.sku}</code></td>
                          <td>
                            <div className="inventory-stale-model-cell">
                              <strong>{item.modelLabel}</strong>
                              <span>
                                {item.brand} · {item.family}
                                {item.color ? ` · ${item.color}` : ""}
                                {item.quality ? ` · ${item.quality}` : ""}
                              </span>
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
                          <td>{formatDate(item.lastSaleAt)}</td>
                          <td>{formatCurrency(item.unitPrice)}</td>
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
              <div className="empty-state">Nenhum SKU entrou nessa faixa agora.</div>
            )}
          </section>
        </>
      ) : null}

      {activeView === "models" ? (
        <div className="invsales-stack sku-analysis-stack">
          <section className="panel invsales-filterbar">
            <div className="invsales-filterbar-row">
              <div className="invsales-control">
                <span className="invsales-control-label">Tipo de produto</span>
                <div className="invsales-seg" role="group" aria-label="Tipo de produto">
                  {(
                    [
                      { value: "all", label: "Todos" },
                      { value: "TELA", label: "Telas" },
                      { value: "BATERIA", label: "Baterias" },
                      { value: "DOC_DE_CARGA", label: "DOCs" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={modelKindFilter === option.value ? "active" : ""}
                      onClick={() => setModelKindFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="invsales-control">
                <span className="invsales-control-label">Decisão</span>
                <select
                  value={modelRecommendationFilter}
                  onChange={(event) => setModelRecommendationFilter(event.target.value as ModelRecommendationFilter)}
                >
                  <option value="all">Todas</option>
                  <option value="BUY_NOW">Comprar agora</option>
                  <option value="WATCH">Acompanhar</option>
                  <option value="DO_NOT_BUY">Não comprar</option>
                </select>
              </div>

              <div className="invsales-control">
                <span className="invsales-control-label">Marca</span>
                <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {(modelsQuery.data?.filters.brands ?? []).map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>

              <div className="invsales-control">
                <span className="invsales-control-label">Qualidade</span>
                <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {(modelsQuery.data?.filters.qualities ?? []).map((quality) => (
                    <option key={quality} value={quality}>
                      {quality}
                    </option>
                  ))}
                </select>
              </div>

              <div className="invsales-control sku-analysis-search">
                <span className="invsales-control-label">Buscar</span>
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="SKU, modelo, marca ou qualidade"
                />
              </div>
            </div>

            {modelFilterCrumbs.length ? (
              <div className="invsales-crumbs">
                <span className="invsales-crumbs-label">Filtrando por:</span>
                {modelFilterCrumbs.map((crumb) => (
                  <button key={crumb.label} type="button" className="invsales-crumb" onClick={crumb.clear}>
                    {crumb.label} <X size={12} />
                  </button>
                ))}
                <button type="button" className="invsales-crumb-clear" onClick={clearModelFilters}>
                  limpar tudo
                </button>
              </div>
            ) : null}
          </section>

          <section className="invsales-kpi-grid">
            <article className="invsales-kpi">
              <span className="invsales-kpi-label">
                <Boxes size={14} /> Peças nos filtros
              </span>
              <strong className="invsales-kpi-value">{formatNumber(modelSummary.stockUnits)}</strong>
              <div className="invsales-kpi-foot">
                <span className="invsales-kpi-hint">{formatNumber(visibleModels.length)} SKUs encontrados</span>
              </div>
            </article>
            <article className="invsales-kpi">
              <span className="invsales-kpi-label">
                <ShoppingCart size={14} /> Vendas em 30 dias
              </span>
              <strong className="invsales-kpi-value">{formatNumber(modelSummary.sales30)}</strong>
              <div className="invsales-kpi-foot">
                <span className="invsales-kpi-hint">Somente os SKUs exibidos</span>
              </div>
            </article>
            <article className="invsales-kpi">
              <span className="invsales-kpi-label">
                <TrendingUp size={14} /> Comprar agora
              </span>
              <strong className="invsales-kpi-value">{formatNumber(modelSummary.buyNow)}</strong>
              <div className="invsales-kpi-foot">
                <span className="invsales-kpi-hint">Prioridade de reposição</span>
              </div>
            </article>
            <article className="invsales-kpi">
              <span className="invsales-kpi-label">
                <CalendarClock size={14} /> Sem venda há 60+ dias
              </span>
              <strong className="invsales-kpi-value">{formatNumber(modelSummary.stale)}</strong>
              <div className="invsales-kpi-foot">
                <span className="invsales-kpi-hint">Inclui SKUs sem venda registrada</span>
              </div>
            </article>
          </section>

          <section className="panel sku-analysis-catalog">
            <div className="invsales-section-head">
              <div>
                <p className="eyebrow">Visão para decisão</p>
                <h3>SKUs para analisar</h3>
                <p className="panel-subcopy">Compare estoque, giro e última venda; clique em uma linha para ver o diagnóstico.</p>
              </div>
              <div className="sku-analysis-sort">
                <label htmlFor="sku-analysis-sort">Ordenar por</label>
                <select
                  id="sku-analysis-sort"
                  value={modelSort}
                  onChange={(event) => setModelSort(event.target.value as ModelSort)}
                >
                  <option value="priority">Prioridade de compra</option>
                  <option value="stock">Maior estoque</option>
                  <option value="sales30">Mais vendidos em 30 dias</option>
                  <option value="sales90">Mais vendidos em 90 dias</option>
                  <option value="lastSale">Venda mais recente</option>
                </select>
              </div>
            </div>

            {modelsQuery.isLoading ? (
              <div className="empty-state">Carregando análise dos SKUs...</div>
            ) : visibleModels.length ? (
              <div className="invsales-table-wrap">
                <table className="invsales-table sku-analysis-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>SKU / modelo</th>
                      <th>Tipo</th>
                      <th className="num">Estoque</th>
                      <th className="num">Venda 30d</th>
                      <th className="num">Venda 90d</th>
                      <th>Última venda</th>
                      <th>Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleModels.map((item, index) => (
                      <tr
                        key={item.modelKey}
                        className={`group-row sku-analysis-row ${selectedModelKey === item.modelKey ? "active" : ""}`}
                        tabIndex={0}
                        aria-label={`Abrir análise de ${item.sku}`}
                        onClick={() => setSelectedModelKey(item.modelKey)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedModelKey(item.modelKey);
                          }
                        }}
                      >
                        <td className="sku-analysis-rank">{index + 1}</td>
                        <td>
                          <div className="sku-analysis-identity">
                            <div>
                              <strong>{item.modelLabel}</strong>
                              <span>
                                {item.sku} · {item.brand} · {item.qualityLabels.slice(0, 2).join(", ") || "Sem qualidade"}
                              </span>
                            </div>
                            <ChevronRight size={16} aria-hidden="true" />
                          </div>
                        </td>
                        <td>
                          <span className={`inventory-status-pill tone-${productKindTone(item.productKind)}`}>
                            {productKindLabel(item.productKind)}
                          </span>
                        </td>
                        <td className="num">
                          <strong>{formatNumber(item.stockUnits)}</strong>
                        </td>
                        <td className="num">{formatNumber(item.sales30)}</td>
                        <td className="num">{formatNumber(item.sales90)}</td>
                        <td>
                          <div className="sku-analysis-last-sale">
                            <strong>{item.lastSaleAt ? formatDate(item.lastSaleAt) : "Sem venda"}</strong>
                            <span>{formatDaysSince(item.daysSinceLastSale)}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`inventory-status-pill tone-${buyRecommendationTone(item.buyRecommendation)}`}>
                            {buyRecommendationLabel(item.buyRecommendation)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">Nenhum SKU corresponde aos filtros selecionados.</div>
            )}
          </section>

          <ModelDetailPanel detail={detailQuery.data} isLoading={detailQuery.isLoading} />
        </div>
      ) : null}
    </div>
  );
}

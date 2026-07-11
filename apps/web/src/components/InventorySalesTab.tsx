import type { InventorySalesCategory, InventorySalesReportItem, InventorySalesReportResponse } from "@olist-crm/shared";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Coins,
  Download,
  Lightbulb,
  Minus,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import "./inventorySales.css";

type SalesPeriod = 1 | 3 | 6 | 12;
type SalesMetric = "units" | "revenue";
type SalesGroupBy = "modelo" | "marca" | "fabrica" | "qualidade" | "tipo" | "familia";
type SalesCategoryFilter = "all" | InventorySalesCategory;
type SalesSortKey = "units" | "revenue" | "avgPrice" | "stock" | "lastSale";

/* Paleta categorica validada (dataviz): azul, dourado, verde, roxo, telha + cinza p/ "Outros" */
const CHART_COLORS = ["#2956d7", "#d09a29", "#2f9d67", "#7c3aed", "#c2410c"];
const OTHERS_COLOR = "#94a3b8";
const GRID_STROKE = "rgba(23, 50, 96, 0.08)";
const TABLE_PAGE_SIZE = 40;

/* Cor fixa por tipo (a cor segue a entidade, nao o rank) */
const CATEGORY_COLORS: Record<InventorySalesCategory, string> = {
  TELA: "#2956d7",
  DOC_DE_CARGA: "#d09a29",
  BATERIA: "#2f9d67",
  OUTROS: "#94a3b8",
};

const groupByOptions: { value: SalesGroupBy; label: string }[] = [
  { value: "modelo", label: "Modelo" },
  { value: "marca", label: "Marca" },
  { value: "fabrica", label: "Fábrica" },
  { value: "qualidade", label: "Qualidade" },
  { value: "tipo", label: "Tipo" },
  { value: "familia", label: "Familia" },
];

function categoryLabel(category: InventorySalesCategory) {
  if (category === "DOC_DE_CARGA") {
    return "DOC de Carga";
  }
  if (category === "BATERIA") {
    return "Bateria";
  }
  if (category === "OUTROS") {
    return "Outros";
  }
  return "Tela";
}

const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const index = Number(monthPart) - 1;
  return `${MONTH_NAMES[index] ?? monthPart}/${(year ?? "").slice(2)}`;
}

function sumRange(values: number[], start: number, end?: number) {
  const stop = end ?? values.length;
  let total = 0;
  for (let index = start; index < stop; index += 1) {
    total += values[index] ?? 0;
  }
  return total;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;
}

interface SalesGroup {
  key: string;
  label: string;
  sublabel: string;
  category: InventorySalesCategory | null;
  units: number;
  revenue: number;
  stockUnits: number;
  skuCount: number;
  lastSaleAt: string | null;
  monthlyUnits: number[];
  monthlyRevenue: number[];
  items: InventorySalesReportItem[];
}

function Sparkline({ values, color = "#2956d7" }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1);

  return (
    <div className="invsales-spark" aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className={value > 0 ? "" : "zero"}
          style={{
            height: `${value > 0 ? Math.max((value / max) * 100, 10) : 6}%`,
            backgroundColor: value > 0 ? color : undefined,
          }}
        />
      ))}
    </div>
  );
}

function DeltaPill({ current, previous, periodLabel }: { current: number; previous: number | null; periodLabel: string }) {
  if (previous === null || previous <= 0) {
    return <span className="invsales-kpi-hint">sem base de comparacao</span>;
  }

  const delta = ((current - previous) / previous) * 100;

  if (Math.abs(delta) < 0.5) {
    return (
      <span className="invsales-delta flat">
        <Minus size={12} /> estavel vs {periodLabel}
      </span>
    );
  }

  return (
    <span className={`invsales-delta ${delta > 0 ? "up" : "down"}`}>
      {delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {formatPercent(Math.abs(delta))} vs {periodLabel}
    </span>
  );
}

function exportGroupsCsv(groups: SalesGroup[], groupLabel: string, period: SalesPeriod) {
  const headers = [groupLabel, "Pecas vendidas", "Faturamento", "Preco medio", "Estoque hoje", "Ultima venda", "SKUs"];
  const lines = [
    "﻿" + headers.join(";"),
    ...groups.map((group) =>
      [
        group.label,
        group.units,
        group.revenue.toFixed(2).replace(".", ","),
        group.units > 0 ? (group.revenue / group.units).toFixed(2).replace(".", ",") : "",
        group.stockUnits,
        group.lastSaleAt ?? "",
        group.skuCount,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(";"),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendas_por_${groupLabel.toLowerCase()}_${period}m_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function InventorySalesTab({ onOpenModel }: { onOpenModel: (modelKey: string) => void }) {
  const { token } = useAuth();
  const [period, setPeriod] = useState<SalesPeriod>(6);
  const [metric, setMetric] = useState<SalesMetric>("units");
  const [groupBy, setGroupBy] = useState<SalesGroupBy>("marca");
  const [categoryFilter, setCategoryFilter] = useState<SalesCategoryFilter>("all");
  const [brandFilter, setBrandFilter] = useState("");
  const [factoryFilter, setFactoryFilter] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SalesSortKey>("units");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(TABLE_PAGE_SIZE);

  const reportQuery = useQuery({
    queryKey: ["inventory-sales-report"],
    queryFn: () => api.inventorySalesReport(token!),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  const report: InventorySalesReportResponse | undefined = reportQuery.data;
  const months = useMemo(() => report?.months ?? [], [report?.months]);
  const windowStart = Math.max(months.length - period, 0);
  const windowMonths = useMemo(() => months.slice(windowStart), [months, windowStart]);
  /* janela anterior de mesmo tamanho, quando os 12m buscados comportam */
  const previousStart = windowStart - period;
  const hasPreviousWindow = previousStart >= 0;

  const metricLabel = metric === "revenue" ? "faturamento" : "pecas vendidas";
  const groupLabel = groupByOptions.find((option) => option.value === groupBy)?.label ?? "Grupo";

  function resetPagination() {
    setVisibleCount(TABLE_PAGE_SIZE);
    setExpandedGroup(null);
  }

  const categoryTotals = useMemo(() => {
    const totals = new Map<InventorySalesCategory, number>();
    for (const item of report?.items ?? []) {
      totals.set(item.category, (totals.get(item.category) ?? 0) + sumRange(item.monthlyUnits, windowStart));
    }
    return totals;
  }, [report?.items, windowStart]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return (report?.items ?? []).filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }
      if (brandFilter && item.brand !== brandFilter) {
        return false;
      }
      if (factoryFilter && item.factory !== factoryFilter) {
        return false;
      }
      if (qualityFilter && (item.quality ?? "SEM QUALIDADE") !== qualityFilter) {
        return false;
      }
      if (familyFilter && item.family !== familyFilter) {
        return false;
      }
      if (term) {
        const haystack = `${item.sku} ${item.modelLabel} ${item.brand} ${item.factory} ${item.family} ${item.quality ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) {
          return false;
        }
      }
      return true;
    });
  }, [brandFilter, categoryFilter, factoryFilter, familyFilter, qualityFilter, report?.items, search]);

  const groups = useMemo(() => {
    const map = new Map<string, SalesGroup>();

    for (const item of filteredItems) {
      let key: string;
      let label: string;
      let sublabel: string;
      let category: InventorySalesCategory | null = null;

      if (groupBy === "modelo") {
        key = `${item.category}::${item.modelLabel}`;
        label = item.modelLabel;
        sublabel = `${categoryLabel(item.category)} · ${item.brand}`;
        category = item.category;
      } else if (groupBy === "marca") {
        key = item.brand;
        label = item.brand;
        sublabel = "Marca";
      } else if (groupBy === "fabrica") {
        key = item.factory;
        label = item.factory;
        sublabel = "Fábrica";
      } else if (groupBy === "qualidade") {
        key = item.quality ?? "SEM QUALIDADE";
        label = item.quality ?? "Sem qualidade";
        sublabel = "Qualidade";
      } else if (groupBy === "tipo") {
        key = item.category;
        label = categoryLabel(item.category);
        sublabel = "Tipo de produto";
        category = item.category;
      } else {
        key = item.family;
        label = item.family;
        sublabel = "Familia";
      }

      const current = map.get(key) ?? {
        key,
        label,
        sublabel,
        category,
        units: 0,
        revenue: 0,
        stockUnits: 0,
        skuCount: 0,
        lastSaleAt: null,
        monthlyUnits: months.map(() => 0),
        monthlyRevenue: months.map(() => 0),
        items: [],
      };

      current.units += sumRange(item.monthlyUnits, windowStart);
      current.revenue += sumRange(item.monthlyRevenue, windowStart);
      current.stockUnits += item.stockUnits;
      current.skuCount += 1;
      current.items.push(item);

      for (let index = 0; index < months.length; index += 1) {
        current.monthlyUnits[index] = (current.monthlyUnits[index] ?? 0) + (item.monthlyUnits[index] ?? 0);
        current.monthlyRevenue[index] = (current.monthlyRevenue[index] ?? 0) + (item.monthlyRevenue[index] ?? 0);
      }

      if (item.lastSaleAt && (!current.lastSaleAt || item.lastSaleAt > current.lastSaleAt)) {
        current.lastSaleAt = item.lastSaleAt;
      }

      map.set(key, current);
    }

    return [...map.values()];
  }, [filteredItems, groupBy, months, windowStart]);

  const totals = useMemo(() => {
    let units = 0;
    let revenue = 0;
    let previousUnits = 0;
    let previousRevenue = 0;
    let withSales = 0;
    let stockedNoSales = 0;
    const monthlyTotals = windowMonths.map(() => 0);

    for (const group of groups) {
      units += group.units;
      revenue += group.revenue;
      if (hasPreviousWindow) {
        previousUnits += sumRange(group.monthlyUnits, previousStart, windowStart);
        previousRevenue += sumRange(group.monthlyRevenue, previousStart, windowStart);
      }
      if (group.units > 0) {
        withSales += 1;
      } else if (group.stockUnits > 0) {
        stockedNoSales += 1;
      }
      for (let index = 0; index < windowMonths.length; index += 1) {
        monthlyTotals[index] = (monthlyTotals[index] ?? 0) + (group.monthlyUnits[windowStart + index] ?? 0);
      }
    }

    return {
      units,
      revenue,
      previousUnits: hasPreviousWindow ? previousUnits : null,
      previousRevenue: hasPreviousWindow ? previousRevenue : null,
      withSales,
      stockedNoSales,
      monthlyTotals,
      avgPrice: units > 0 ? revenue / units : 0,
      previousAvgPrice: hasPreviousWindow && previousUnits > 0 ? previousRevenue / previousUnits : null,
    };
  }, [groups, hasPreviousWindow, previousStart, windowMonths, windowStart]);

  const rankedGroups = useMemo(() => {
    return [...groups].sort((left, right) =>
      metric === "revenue" ? right.revenue - left.revenue : right.units - left.units,
    );
  }, [groups, metric]);

  /* top 5 do agrupamento p/ o empilhado; cor fixa por entidade dentro da visao */
  const topSeries = useMemo(() => {
    const top = rankedGroups.filter((group) => group.units > 0).slice(0, 5);

    return top.map((group, index) => ({
      key: group.key,
      label: group.label,
      color: group.category ? CATEGORY_COLORS[group.category] : CHART_COLORS[index % CHART_COLORS.length]!,
    }));
  }, [rankedGroups]);

  const rankingData = useMemo(() => {
    return rankedGroups
      .filter((group) => (metric === "revenue" ? group.revenue > 0 : group.units > 0))
      .slice(0, 10)
      .map((group) => ({
        key: group.key,
        name: group.label.length > 30 ? `${group.label.slice(0, 29)}…` : group.label,
        fullName: group.label,
        value: metric === "revenue" ? group.revenue : group.units,
        units: group.units,
        revenue: group.revenue,
        share: totals.units > 0 ? (group.units / totals.units) * 100 : 0,
      }));
  }, [metric, rankedGroups, totals.units]);

  const { temporalData, showOthersSeries } = useMemo(() => {
    const topKeys = new Set(topSeries.map((series) => series.key));
    let othersTotal = 0;

    const data = windowMonths.map((month, index) => {
      const point: Record<string, number | string> = { month: formatMonthLabel(month) };
      let others = 0;

      for (const group of groups) {
        const value =
          metric === "revenue" ? group.monthlyRevenue[windowStart + index] ?? 0 : group.monthlyUnits[windowStart + index] ?? 0;
        if (topKeys.has(group.key)) {
          point[group.label] = Math.round(value * 100) / 100;
        } else {
          others += value;
        }
      }

      othersTotal += others;
      point["Demais"] = Math.round(others * 100) / 100;
      return point;
    });

    return { temporalData: data, showOthersSeries: othersTotal > 0 };
  }, [groups, metric, topSeries, windowMonths, windowStart]);

  const insights = useMemo(() => {
    const result: { icon: "top" | "trend" | "month" | "idle"; text: ReactNode }[] = [];
    const top = rankedGroups[0];

    if (top && top.units > 0 && totals.units > 0) {
      const share = (top.units / totals.units) * 100;
      result.push({
        icon: "top",
        text: (
          <>
            <strong>{top.label}</strong> concentra <strong>{formatPercent(share)}</strong> das pecas vendidas no periodo
            ({formatNumber(top.units)} de {formatNumber(totals.units)}).
          </>
        ),
      });
    }

    if (totals.previousUnits !== null && totals.previousUnits > 0) {
      const delta = ((totals.units - totals.previousUnits) / totals.previousUnits) * 100;
      result.push({
        icon: "trend",
        text: (
          <>
            As vendas {delta >= 0 ? "cresceram" : "cairam"} <strong>{formatPercent(Math.abs(delta))}</strong> em relacao
            aos {period} meses anteriores ({formatNumber(totals.previousUnits)} → {formatNumber(totals.units)} pecas).
          </>
        ),
      });
    }

    if (totals.monthlyTotals.length > 1) {
      let bestIndex = 0;
      for (let index = 1; index < totals.monthlyTotals.length; index += 1) {
        if ((totals.monthlyTotals[index] ?? 0) > (totals.monthlyTotals[bestIndex] ?? 0)) {
          bestIndex = index;
        }
      }
      const bestMonth = windowMonths[bestIndex];
      if (bestMonth && (totals.monthlyTotals[bestIndex] ?? 0) > 0) {
        result.push({
          icon: "month",
          text: (
            <>
              Melhor mes do recorte: <strong>{formatMonthLabel(bestMonth)}</strong>, com{" "}
              <strong>{formatNumber(totals.monthlyTotals[bestIndex] ?? 0)}</strong> pecas.
            </>
          ),
        });
      }
    }

    if (totals.stockedNoSales > 0) {
      result.push({
        icon: "idle",
        text: (
          <>
            <strong>{formatNumber(totals.stockedNoSales)}</strong> {groupLabel.toLowerCase()}s tem estoque hoje mas{" "}
            <strong>nao venderam</strong> no periodo — candidatos a promocao ou revisao de compra.
          </>
        ),
      });
    }

    return result;
  }, [groupLabel, period, rankedGroups, totals, windowMonths]);

  const sortedGroups = useMemo(() => {
    const sorted = [...groups];
    sorted.sort((left, right) => {
      if (sortKey === "revenue") {
        return right.revenue - left.revenue;
      }
      if (sortKey === "avgPrice") {
        const leftAvg = left.units > 0 ? left.revenue / left.units : 0;
        const rightAvg = right.units > 0 ? right.revenue / right.units : 0;
        return rightAvg - leftAvg;
      }
      if (sortKey === "stock") {
        return right.stockUnits - left.stockUnits;
      }
      if (sortKey === "lastSale") {
        return (right.lastSaleAt ?? "").localeCompare(left.lastSaleAt ?? "");
      }
      return right.units - left.units;
    });
    return sorted;
  }, [groups, sortKey]);

  function drillInto(key: string) {
    const group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      return;
    }

    if (groupBy === "marca") {
      setBrandFilter(group.label);
      setGroupBy("modelo");
    } else if (groupBy === "fabrica") {
      setFactoryFilter(group.key);
      setGroupBy("modelo");
    } else if (groupBy === "qualidade") {
      setQualityFilter(group.key);
      setGroupBy("modelo");
    } else if (groupBy === "tipo") {
      setCategoryFilter(group.key as InventorySalesCategory);
      setGroupBy("modelo");
    } else if (groupBy === "familia") {
      setFamilyFilter(group.key);
      setGroupBy("modelo");
    } else {
      setExpandedGroup((current) => (current === key ? null : key));
      return;
    }
    resetPagination();
  }

  const activeCrumbs = [
    categoryFilter !== "all" ? { label: `Tipo: ${categoryLabel(categoryFilter)}`, clear: () => setCategoryFilter("all") } : null,
    brandFilter ? { label: `Marca: ${brandFilter}`, clear: () => setBrandFilter("") } : null,
    factoryFilter ? { label: `Fábrica: ${factoryFilter}`, clear: () => setFactoryFilter("") } : null,
    qualityFilter ? { label: `Qualidade: ${qualityFilter}`, clear: () => setQualityFilter("") } : null,
    familyFilter ? { label: `Familia: ${familyFilter}`, clear: () => setFamilyFilter("") } : null,
  ].filter((crumb): crumb is { label: string; clear: () => void } => Boolean(crumb));

  function clearAllFilters() {
    setCategoryFilter("all");
    setBrandFilter("");
    setFactoryFilter("");
    setQualityFilter("");
    setFamilyFilter("");
    setSearch("");
    resetPagination();
  }

  const formatMetricValue = (value: number) =>
    metric === "revenue" ? formatCurrency(value) : `${formatNumber(value)} pecas`;

  if (reportQuery.isLoading) {
    return <section className="panel invsales-empty">Carregando vendas por modelo...</section>;
  }

  if (!report) {
    return <section className="panel invsales-empty">Nao consegui carregar o relatorio de vendas agora.</section>;
  }

  const visibleGroups = sortedGroups.slice(0, visibleCount);
  const periodCompareLabel = `${period}m anteriores`;
  const windowRangeLabel = windowMonths.length
    ? `${formatMonthLabel(windowMonths[0]!)} a ${formatMonthLabel(windowMonths[windowMonths.length - 1]!)}`
    : "";

  const insightIcons = {
    top: <Sparkles size={15} />,
    trend: <ArrowUpRight size={15} />,
    month: <CalendarClock size={15} />,
    idle: <Lightbulb size={15} />,
  };

  return (
    <div className="invsales-stack">
      {/* ── filtros: uma barra que governa tudo abaixo ── */}
      <section className="panel invsales-filterbar">
        <div className="invsales-filterbar-row">
          <div className="invsales-control">
            <span className="invsales-control-label">Periodo</span>
            <div className="invsales-seg" role="group" aria-label="Periodo">
              {([1, 3, 6, 12] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={period === value ? "active" : ""}
                  onClick={() => {
                    setPeriod(value);
                    resetPagination();
                  }}
                >
                  {value} meses
                </button>
              ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Medir por</span>
            <div className="invsales-seg" role="group" aria-label="Metrica">
              {(
                [
                  { value: "units", label: "Pecas" },
                  { value: "revenue", label: "Faturamento" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={metric === option.value ? "active" : ""}
                  onClick={() => setMetric(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Tipo de produto</span>
            <div className="invsales-seg" role="group" aria-label="Tipo de produto">
              {(
                [
                  { value: "all", label: "Todos" },
                  { value: "TELA", label: "Telas" },
                  { value: "DOC_DE_CARGA", label: "DOCs" },
                  { value: "BATERIA", label: "Baterias" },
                  { value: "OUTROS", label: "Outros" },
                ] satisfies { value: SalesCategoryFilter; label: string }[]
              )
                .filter(
                  (chip) =>
                    chip.value === "all" || (categoryTotals.get(chip.value) ?? 0) > 0 || categoryFilter === chip.value,
                )
                .map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    className={categoryFilter === chip.value ? "active" : ""}
                    onClick={() => {
                      setCategoryFilter(chip.value);
                      resetPagination();
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Marca</span>
            <select
              value={brandFilter}
              onChange={(event) => {
                setBrandFilter(event.target.value);
                resetPagination();
              }}
            >
              <option value="">Todas</option>
              {report.filters.brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Qualidade</span>
            <select
              value={qualityFilter}
              onChange={(event) => {
                setQualityFilter(event.target.value);
                resetPagination();
              }}
            >
              <option value="">Todas</option>
              {report.filters.qualities.map((quality) => (
                <option key={quality} value={quality}>
                  {quality}
                </option>
              ))}
            </select>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Fábrica</span>
            <select
              value={factoryFilter}
              onChange={(event) => {
                setFactoryFilter(event.target.value);
                resetPagination();
              }}
            >
              <option value="">Todas</option>
              {report.filters.factories.map((factory) => (
                <option key={factory} value={factory}>
                  {factory}
                </option>
              ))}
            </select>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Buscar</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPagination();
              }}
              placeholder="Modelo, SKU, marca, fábrica ou qualidade"
            />
          </div>
        </div>

        {activeCrumbs.length ? (
          <div className="invsales-crumbs">
            <span className="invsales-crumbs-label">Filtrando por:</span>
            {activeCrumbs.map((crumb) => (
              <button key={crumb.label} type="button" className="invsales-crumb" onClick={crumb.clear}>
                {crumb.label} <X size={12} />
              </button>
            ))}
            <button type="button" className="invsales-crumb-clear" onClick={clearAllFilters}>
              limpar tudo
            </button>
          </div>
        ) : null}
      </section>

      {/* ── 1 · o retrato do periodo ── */}
      <section className="invsales-kpi-grid">
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <ShoppingCart size={14} /> Pecas vendidas · {windowRangeLabel}
          </span>
          <strong className="invsales-kpi-value">{formatNumber(totals.units)}</strong>
          <div className="invsales-kpi-foot">
            <DeltaPill current={totals.units} previous={totals.previousUnits} periodLabel={periodCompareLabel} />
            <Sparkline values={totals.monthlyTotals} />
          </div>
        </article>

        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Coins size={14} /> Faturamento
          </span>
          <strong className="invsales-kpi-value">{formatCurrency(totals.revenue)}</strong>
          <div className="invsales-kpi-foot">
            <DeltaPill current={totals.revenue} previous={totals.previousRevenue} periodLabel={periodCompareLabel} />
          </div>
        </article>

        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Sparkles size={14} /> Preco medio por peca
          </span>
          <strong className="invsales-kpi-value">{formatCurrency(totals.avgPrice)}</strong>
          <div className="invsales-kpi-foot">
            <DeltaPill current={totals.avgPrice} previous={totals.previousAvgPrice} periodLabel={periodCompareLabel} />
          </div>
        </article>

        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Boxes size={14} /> {groupLabel}s com venda
          </span>
          <strong className="invsales-kpi-value">{formatNumber(totals.withSales)}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">
              {formatNumber(totals.stockedNoSales)} com estoque e sem venda no periodo
            </span>
          </div>
        </article>
      </section>

      {/* ── 2 · leitura pronta ── */}
      {insights.length ? (
        <section className="invsales-insights">
          {insights.map((insight, index) => (
            <article key={index} className="invsales-insight">
              {insightIcons[insight.icon]}
              <span>{insight.text}</span>
            </article>
          ))}
        </section>
      ) : null}

      {/* ── 3 · quem puxa a venda + evolucao ── */}
      <section className="panel">
        <div className="invsales-section-head">
          <div>
            <p className="eyebrow">Quem puxa a venda</p>
            <h3>Ranking e evolucao por {groupLabel.toLowerCase()}</h3>
            <p className="invsales-section-sub">
              Troque a visao para mudar os dois graficos e a tabela. Clique numa barra do ranking para mergulhar
              {groupBy === "modelo" ? " nos SKUs do modelo (abre na tabela)" : " nos modelos desse grupo"}.
            </p>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Ver por</span>
            <div className="invsales-seg" role="group" aria-label="Agrupar por">
              {groupByOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={groupBy === option.value ? "active" : ""}
                  onClick={() => {
                    setGroupBy(option.value);
                    resetPagination();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="invsales-chart-duo">
          <article className="invsales-chart-card">
            <h4>Top {rankingData.length} por {metricLabel}</h4>
            <p>Participacao sobre o total filtrado do periodo.</p>

            {rankingData.length ? (
              <ResponsiveContainer width="100%" height={Math.max(rankingData.length * 38 + 16, 140)}>
                <BarChart data={rankingData} layout="vertical" margin={{ left: 0, right: 64, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={200}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#334155" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(41, 86, 215, 0.05)" }}
                    formatter={(_value, _name, entry) => {
                      const row = entry?.payload as (typeof rankingData)[number] | undefined;
                      if (!row) {
                        return ["", ""];
                      }
                      return [
                        `${formatNumber(row.units)} pecas · ${formatCurrency(row.revenue)} · ${formatPercent(row.share)} do total`,
                        row.fullName,
                      ];
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="#2956d7"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    cursor="pointer"
                    onClick={(entry) => {
                      const key = (entry as unknown as { key?: string })?.key;
                      if (key) {
                        drillInto(key);
                      }
                    }}
                  >
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(value: number) =>
                        metric === "revenue" ? formatCurrency(value) : formatNumber(value)
                      }
                      style={{ fontSize: 11, fill: "#475569", fontVariantNumeric: "tabular-nums" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="invsales-empty">Nenhuma venda nesse recorte.</div>
            )}
          </article>

          <article className="invsales-chart-card">
            <h4>Mes a mes · {windowRangeLabel}</h4>
            <p>Top 5 {groupLabel.toLowerCase()}s empilhados; o restante vira "Demais".</p>

            {temporalData.length && topSeries.length ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={temporalData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis
                      tickFormatter={(value) => formatNumber(Number(value))}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#64748b" }}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(41, 86, 215, 0.05)" }}
                      formatter={(value, name) => [formatMetricValue(Number(value ?? 0)), String(name)]}
                    />
                    {topSeries.map((series) => (
                      <Bar
                        key={series.key}
                        dataKey={series.label}
                        stackId="sales"
                        fill={series.color}
                        stroke="#fff"
                        strokeWidth={2}
                        maxBarSize={38}
                      />
                    ))}
                    {showOthersSeries ? (
                      <Bar dataKey="Demais" stackId="sales" fill={OTHERS_COLOR} stroke="#fff" strokeWidth={2} maxBarSize={38} />
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>
                <div className="invsales-legend">
                  {topSeries.map((series) => (
                    <span key={series.key}>
                      <i style={{ backgroundColor: series.color }} /> {series.label}
                    </span>
                  ))}
                  {showOthersSeries ? (
                    <span>
                      <i style={{ backgroundColor: OTHERS_COLOR }} /> Demais
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="invsales-empty">Sem meses com venda nesse recorte.</div>
            )}
          </article>
        </div>
      </section>

      {/* ── 4 · a lista completa ── */}
      <section className="panel">
        <div className="invsales-section-head">
          <div>
            <p className="eyebrow">A lista completa</p>
            <h3>Todos os {groupLabel.toLowerCase()}s do recorte</h3>
            <p className="invsales-section-sub">
              {groupBy === "modelo"
                ? "Clique numa linha para abrir os SKUs do modelo (cor e qualidade) com atalho para a analise completa."
                : "Clique numa linha para mergulhar nos modelos desse grupo."}{" "}
              Clique nos titulos das colunas para reordenar.
            </p>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => exportGroupsCsv(sortedGroups, groupLabel, period)}
          >
            <Download size={16} /> Baixar CSV
          </button>
        </div>

        <div className="invsales-table-wrap">
          <table className="invsales-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{groupLabel}</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "units" ? "active" : ""}`}
                    onClick={() => setSortKey("units")}
                  >
                    Pecas
                  </button>
                </th>
                <th className="num">% do total</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "revenue" ? "active" : ""}`}
                    onClick={() => setSortKey("revenue")}
                  >
                    Faturamento
                  </button>
                </th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "avgPrice" ? "active" : ""}`}
                    onClick={() => setSortKey("avgPrice")}
                  >
                    Preco medio
                  </button>
                </th>
                <th>Mes a mes</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "stock" ? "active" : ""}`}
                    onClick={() => setSortKey("stock")}
                  >
                    Estoque hoje
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "lastSale" ? "active" : ""}`}
                    onClick={() => setSortKey("lastSale")}
                  >
                    Ultima venda
                  </button>
                </th>
                <th className="num">SKUs</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((group, index) => (
                <SalesGroupRows
                  key={group.key}
                  group={group}
                  rank={index + 1}
                  share={totals.units > 0 ? (group.units / totals.units) * 100 : 0}
                  isExpanded={expandedGroup === group.key}
                  groupBy={groupBy}
                  windowStart={windowStart}
                  onToggle={() => drillInto(group.key)}
                  onOpenModel={onOpenModel}
                />
              ))}
            </tbody>
          </table>
        </div>

        {sortedGroups.length > visibleCount ? (
          <div className="invsales-table-foot">
            <button
              type="button"
              className="ghost-button"
              onClick={() => setVisibleCount((current) => current + TABLE_PAGE_SIZE)}
            >
              Mostrar mais {formatNumber(Math.min(TABLE_PAGE_SIZE, sortedGroups.length - visibleCount))} de{" "}
              {formatNumber(sortedGroups.length - visibleCount)} restantes
            </button>
          </div>
        ) : null}

        {!sortedGroups.length ? <div className="invsales-empty">Nada bateu com esse filtro.</div> : null}
      </section>
    </div>
  );
}

function SalesGroupRows({
  group,
  rank,
  share,
  isExpanded,
  groupBy,
  windowStart,
  onToggle,
  onOpenModel,
}: {
  group: SalesGroup;
  rank: number;
  share: number;
  isExpanded: boolean;
  groupBy: SalesGroupBy;
  windowStart: number;
  onToggle: () => void;
  onOpenModel: (modelKey: string) => void;
}) {
  const expandable = groupBy === "modelo";
  const avgPrice = group.units > 0 ? group.revenue / group.units : null;
  const sortedItems = expandable
    ? [...group.items].sort((left, right) => sumRange(right.monthlyUnits, windowStart) - sumRange(left.monthlyUnits, windowStart))
    : [];

  return (
    <>
      <tr className={`group-row ${isExpanded ? "open" : ""}`} onClick={onToggle}>
        <td className="invsales-rank">{rank}</td>
        <td>
          <div className="invsales-cell-main">
            <strong>
              {expandable ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
              {group.label}
            </strong>
            <small>{group.sublabel}</small>
          </div>
        </td>
        <td className="num">
          <strong>{formatNumber(group.units)}</strong>
        </td>
        <td className="num">
          <div className="invsales-share">
            <span className="invsales-share-track">
              <i style={{ width: `${Math.min(share, 100)}%` }} />
            </span>
            {share >= 0.1 ? formatPercent(share) : "<0,1%"}
          </div>
        </td>
        <td className="num">{formatCurrency(group.revenue)}</td>
        <td className="num">{avgPrice === null ? "—" : formatCurrency(avgPrice)}</td>
        <td>
          <Sparkline values={group.monthlyUnits.slice(windowStart)} />
        </td>
        <td className="num">{formatNumber(group.stockUnits)}</td>
        <td>
          {group.units === 0 && group.stockUnits > 0 ? (
            <span className="invsales-pill warn">Parado no periodo</span>
          ) : group.lastSaleAt ? (
            formatDate(group.lastSaleAt)
          ) : (
            <span className="invsales-pill muted">Sem venda</span>
          )}
        </td>
        <td className="num">{formatNumber(group.skuCount)}</td>
      </tr>

      {expandable && isExpanded
        ? sortedItems.map((item) => {
            const itemUnits = sumRange(item.monthlyUnits, windowStart);

            return (
              <tr key={item.sku} className="sku-row">
                <td />
                <td>
                  <div className="invsales-cell-main">
                    <strong>
                      <code>{item.sku}</code>
                    </strong>
                    <small>
                      {item.quality ?? "Sem qualidade"}
                      {item.color ? ` · ${item.color}` : ""}
                      {!item.inCatalog ? " · fora da planilha atual" : ""}
                    </small>
                  </div>
                </td>
                <td className="num">{formatNumber(itemUnits)}</td>
                <td />
                <td className="num">{formatCurrency(sumRange(item.monthlyRevenue, windowStart))}</td>
                <td className="num">{itemUnits > 0 ? formatCurrency(sumRange(item.monthlyRevenue, windowStart) / itemUnits) : "—"}</td>
                <td>
                  <Sparkline values={item.monthlyUnits.slice(windowStart)} color="#d09a29" />
                </td>
                <td className="num">{formatNumber(item.stockUnits)}</td>
                <td>{item.lastSaleAt ? formatDate(item.lastSaleAt) : <span className="invsales-pill muted">Sem venda</span>}</td>
                <td className="num">
                  {item.modelKey ? (
                    <button
                      type="button"
                      className="invsales-open-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenModel(item.modelKey!);
                      }}
                    >
                      Abrir analise
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}

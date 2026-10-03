import type { CustomerGrowthMetric, CustomerGrowthResponse } from "./api";
import { summarizeGrowth } from "./customerGrowth";
import type { GrowthSummary } from "./customerGrowth";

type GrowthCustomer = CustomerGrowthResponse["customers"][number];

export interface InsightCustomer {
  customerId: string;
  customerCode: string;
  displayName: string;
  // Numero principal mostrado ao lado do cliente (ex.: pecas/mes perdidas).
  value: number;
  // Texto curto de apoio (ex.: "40 -> 12 pecas/mes").
  detail: string;
  // Serie mes a mes usada no mini grafico da linha.
  values: number[];
  // Segunda serie opcional (ex.: tela DE ao lado da tela XP).
  compareValues?: number[];
}

export interface InsightList {
  total: number;
  // Lista completa; a tela mostra os primeiros e expande o resto.
  customers: InsightCustomer[];
}

export interface ProductInsight {
  metric: CustomerGrowthMetric;
  monthlyTotals: number[];
  summary: GrowthSummary;
  // Clientes distintos que compraram o produto em cada mes (mesma conta do relatorio executivo).
  monthlyBuyers: number[];
  // Media de clientes por mes na metade anterior e na metade recente (a partir do primeiro mes com venda).
  previousBuyers: number;
  recentBuyers: number;
  growingCount: number;
  fallingCount: number;
  topGrower: InsightCustomer | null;
  topLoser: InsightCustomer | null;
}

export interface GrowthInsights {
  products: ProductInsight[];
  bigFalling: InsightList & { lostPerMonth: number };
  wentQuiet: InsightList;
  screensWithoutBattery: InsightList;
  screensWithoutDock: InsightList;
  xpToDe: InsightList;
  top10Share: number;
  activeCustomers: number;
}

export const INSIGHT_PRODUCTS: CustomerGrowthMetric[] = ["pieces", "screenXp", "screenDe", "screenVv", "battery", "dock"];

// Quantos maiores clientes (por pecas no periodo) entram em "clientes grandes".
const BIG_CUSTOMER_COUNT = 50;
// Media minima de telas por mes para sugerir bateria/dock.
const CROSS_SELL_MIN_SCREENS = 10;
// Meses finais sem compra para considerar que o cliente sumiu.
const QUIET_MONTHS = 2;
// Troca XP -> DE: a tela DE precisa cobrir pelo menos essa parte da queda de XP
// e o cliente precisa levar um minimo de DE por mes; senao e so queda de XP.
const XP_TO_DE_MIN_COVERAGE = 0.2;
const XP_TO_DE_MIN_DE_PER_MONTH = 5;

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

function toInsightCustomer(
  customer: GrowthCustomer,
  value: number,
  detail: string,
  values: number[] = customer.series.pieces,
  compareValues?: number[],
): InsightCustomer {
  return {
    customerId: customer.customerId,
    customerCode: customer.customerCode,
    displayName: customer.displayName,
    value,
    detail,
    values,
    compareValues,
  };
}

function toList(entries: InsightCustomer[]): InsightList {
  return { total: entries.length, customers: entries };
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function screens(customer: GrowthCustomer) {
  return customer.series.screenXp.map(
    (value, index) => value + (customer.series.screenDe[index] ?? 0) + (customer.series.screenVv[index] ?? 0),
  );
}

export function computeGrowthInsights(data: CustomerGrowthResponse): GrowthInsights {
  const monthCount = data.months.length;
  const half = Math.floor(monthCount / 2);
  const customers = data.customers.filter((customer) => sum(customer.series.pieces) > 0);

  const products = INSIGHT_PRODUCTS.map<ProductInsight>((metric) => {
    const monthlyTotals = data.months.map((_, index) => sum(customers.map((customer) => customer.series[metric][index] ?? 0)));
    const monthlyBuyers = data.months.map(
      (_, index) => customers.filter((customer) => (customer.series[metric][index] ?? 0) > 0).length,
    );
    // Mesma divisao da media de pecas: comeca no primeiro mes com venda do produto.
    const buyersSummary = summarizeGrowth(monthlyBuyers);

    const perCustomer = customers
      .filter((customer) => customer.series[metric].some((value) => value > 0))
      .map((customer) => ({ customer, summary: summarizeGrowth(customer.series[metric]) }));
    const growing = perCustomer.filter((entry) => entry.summary.trend === "up" || entry.summary.trend === "new");
    const falling = perCustomer.filter((entry) => entry.summary.trend === "down" || entry.summary.trend === "stopped");
    const best = [...growing].sort((left, right) => right.summary.delta - left.summary.delta)[0];
    const worst = [...falling].sort((left, right) => left.summary.delta - right.summary.delta)[0];

    return {
      metric,
      monthlyTotals,
      summary: summarizeGrowth(monthlyTotals),
      monthlyBuyers,
      previousBuyers: Math.round(buyersSummary.previousAvg),
      recentBuyers: Math.round(buyersSummary.recentAvg),
      growingCount: growing.length,
      fallingCount: falling.length,
      topGrower: best
        ? toInsightCustomer(best.customer, best.summary.delta, `${round(best.summary.previousAvg)} → ${round(best.summary.recentAvg)}`)
        : null,
      topLoser: worst
        ? toInsightCustomer(worst.customer, worst.summary.delta, `${round(worst.summary.previousAvg)} → ${round(worst.summary.recentAvg)}`)
        : null,
    };
  });

  // Clientes grandes (mais pecas no periodo) que estao caindo.
  const byVolume = [...customers].sort((left, right) => sum(right.series.pieces) - sum(left.series.pieces));
  const bigFallingEntries = byVolume
    .slice(0, BIG_CUSTOMER_COUNT)
    .map((customer) => ({ customer, summary: summarizeGrowth(customer.series.pieces) }))
    .filter((entry) => entry.summary.trend === "down" || entry.summary.trend === "stopped")
    .sort((left, right) => left.summary.delta - right.summary.delta);

  // Compravam antes e nao compram nada nos ultimos meses.
  const wentQuietEntries = customers
    .filter((customer) => {
      const values = customer.series.pieces;
      return values.slice(-QUIET_MONTHS).every((value) => value === 0) && values.slice(0, -QUIET_MONTHS).some((value) => value > 0);
    })
    .map((customer) => {
      const before = customer.series.pieces.slice(0, -QUIET_MONTHS);
      const activeMonths = before.filter((value) => value > 0).length;
      return { customer, avg: activeMonths ? sum(before) / activeMonths : 0 };
    })
    .sort((left, right) => right.avg - left.avg);

  // Compram telas com frequencia mas nao levaram bateria/dock no periodo.
  const crossSell = (metric: "battery" | "dock") =>
    customers
      .map((customer) => ({ customer, screensAvg: sum(screens(customer).slice(-half)) / Math.max(half, 1) }))
      .filter((entry) => entry.screensAvg >= CROSS_SELL_MIN_SCREENS && sum(entry.customer.series[metric]) === 0)
      .sort((left, right) => right.screensAvg - left.screensAvg)
      .map((entry) => toInsightCustomer(entry.customer, entry.screensAvg, `${round(entry.screensAvg)} telas/mes`, screens(entry.customer)));

  // Trocando XP por DE: XP caiu e a DE subiu o suficiente para cobrir parte real
  // da queda. Compara as mesmas metades do calendario para as duas telas.
  const xpToDeEntries = customers
    .map((customer) => {
      const xp = customer.series.screenXp;
      const de = customer.series.screenDe;
      const split = monthCount - half;
      const xpBefore = average(xp.slice(0, split));
      const xpAfter = average(xp.slice(split));
      const deBefore = average(de.slice(0, split));
      const deAfter = average(de.slice(split));
      const xpLoss = xpBefore - xpAfter;
      const deGain = deAfter - deBefore;
      return { customer, xpBefore, xpAfter, deBefore, deAfter, xpLoss, deGain, coverage: xpLoss > 0 ? deGain / xpLoss : 0 };
    })
    .filter(
      (entry) =>
        entry.xpLoss > 0 &&
        entry.xpAfter < entry.xpBefore * (1 - 0.15) &&
        entry.deGain > 0 &&
        entry.deAfter >= XP_TO_DE_MIN_DE_PER_MONTH &&
        entry.coverage >= XP_TO_DE_MIN_COVERAGE,
    )
    .sort((left, right) => right.deGain - left.deGain);

  const totalPieces = sum(customers.map((customer) => sum(customer.series.pieces)));
  const top10Pieces = sum(byVolume.slice(0, 10).map((customer) => sum(customer.series.pieces)));

  return {
    products,
    bigFalling: {
      ...toList(
        bigFallingEntries.map((entry) =>
          toInsightCustomer(entry.customer, entry.summary.delta, `${round(entry.summary.previousAvg)} → ${round(entry.summary.recentAvg)} pecas/mes`),
        ),
      ),
      lostPerMonth: sum(bigFallingEntries.map((entry) => entry.summary.delta)),
    },
    wentQuiet: toList(
      wentQuietEntries.map((entry) =>
        toInsightCustomer(entry.customer, entry.avg, `comprava ${round(entry.avg)} pecas/mes`),
      ),
    ),
    screensWithoutBattery: toList(crossSell("battery")),
    screensWithoutDock: toList(crossSell("dock")),
    xpToDe: toList(
      xpToDeEntries.map((entry) =>
        toInsightCustomer(
          entry.customer,
          entry.deGain,
          `XP ${round(entry.xpBefore)} → ${round(entry.xpAfter)} · DE ${round(entry.deBefore)} → ${round(entry.deAfter)} · DE cobre ${Math.round(Math.min(entry.coverage, 1) * 100)}% da queda`,
          entry.customer.series.screenXp,
          entry.customer.series.screenDe,
        ),
      ),
    ),
    top10Share: totalPieces > 0 ? (top10Pieces / totalPieces) * 100 : 0,
    activeCustomers: customers.length,
  };
}

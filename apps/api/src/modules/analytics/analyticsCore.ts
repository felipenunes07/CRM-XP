import type { InsightTag } from "@olist-crm/shared";
import { addDays, daysBetween } from "../../lib/dates.js";

export function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeAverageGap(orderDates: Date[]) {
  if (orderDates.length < 2) {
    return null;
  }

  const gaps: number[] = [];
  for (let index = 1; index < orderDates.length; index += 1) {
    gaps.push(daysBetween(orderDates[index]!, orderDates[index - 1]!));
  }
  return average(gaps);
}

export function computeFrequencyDrop(orderDates: Date[], now = new Date()) {
  const recentWindowStart = addDays(now, -90);
  const previousWindowStart = addDays(now, -180);
  const recent = orderDates.filter((date) => date >= recentWindowStart).length;
  const previous = orderDates.filter((date) => date >= previousWindowStart && date < recentWindowStart).length;
  if (previous <= 0) {
    return 0;
  }
  return clampScore(((previous - recent) / previous) * 100, 0, 100) / 100;
}

export function deriveInsights(input: {
  status: "ACTIVE" | "ATTENTION" | "INACTIVE";
  totalSpent: number;
  avgGap: number | null;
  lastPurchaseAt: Date | null;
  predictedNextPurchaseAt: Date | null;
  frequencyDropRatio: number;
  totalOrders: number;
  highValueThreshold: number;
  now?: Date;
}) {
  const tags: InsightTag[] = [];
  const now = input.now ?? new Date();

  if (input.totalSpent >= input.highValueThreshold && input.totalSpent > 0) {
    tags.push("alto_valor");
  }
  if (input.status === "INACTIVE" && input.totalSpent > 0) {
    tags.push("reativacao");
  }
  if (input.status === "ACTIVE" && input.avgGap !== null && input.avgGap <= 45 && input.frequencyDropRatio < 0.2) {
    tags.push("recorrente");
  }
  if (input.frequencyDropRatio >= 0.5) {
    tags.push("queda_frequencia");
    if (input.status !== "ACTIVE") {
      tags.push("risco_churn");
    }
  }
  if (input.predictedNextPurchaseAt && input.predictedNextPurchaseAt < now) {
    tags.push("compra_prevista_vencida");
  }
  if (input.totalOrders <= 2 && input.lastPurchaseAt && daysBetween(now, input.lastPurchaseAt) <= 30) {
    tags.push("novo_cliente");
  }

  const primaryInsight =
    tags.find((tag) => tag === "risco_churn") ??
    tags.find((tag) => tag === "reativacao") ??
    tags.find((tag) => tag === "alto_valor") ??
    tags.find((tag) => tag === "compra_prevista_vencida") ??
    tags[0] ??
    null;

  return { primaryInsight, insightTags: Array.from(new Set(tags)) };
}

export function computeCustomerSnapshot(input: {
  orderDates: Date[];
  orderTotals: number[];
  maxSpent: number;
  maxOrders: number;
  highValueThreshold: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const lastPurchaseAt = input.orderDates.at(-1) ?? null;
  const totalOrders = input.orderDates.length;
  const totalSpent = input.orderTotals.reduce((sum, value) => sum + value, 0);
  const avgTicket = totalOrders ? totalSpent / totalOrders : 0;
  const avgGap = computeAverageGap(input.orderDates);
  const daysSinceLastPurchase = lastPurchaseAt ? daysBetween(now, lastPurchaseAt) : null;
  const purchaseFrequency90d = input.orderDates.filter((date) => daysBetween(now, date) <= 90).length;
  const frequencyDropRatio = computeFrequencyDrop(input.orderDates, now);
  const status =
    daysSinceLastPurchase !== null && daysSinceLastPurchase <= 30
      ? "ACTIVE"
      : daysSinceLastPurchase !== null && daysSinceLastPurchase <= 89
        ? "ATTENTION"
        : "INACTIVE";

  const valueRecency = daysSinceLastPurchase === null ? 0 : clampScore(100 - daysSinceLastPurchase * 0.556);
  const valueFrequency = clampScore((totalOrders / Math.max(1, input.maxOrders)) * 100);
  const valueMonetary = clampScore((totalSpent / Math.max(1, input.maxSpent)) * 100);
  const valueScore = valueRecency * 0.3 + valueFrequency * 0.3 + valueMonetary * 0.4;

  const predictedNextPurchaseAt =
    totalOrders >= 3 && avgGap !== null && lastPurchaseAt ? addDays(lastPurchaseAt, Math.round(avgGap)) : null;
  const overdueScore = predictedNextPurchaseAt && predictedNextPurchaseAt < now ? 100 : 0;
  const priorityScore = valueRecency * 0.4 + valueScore * 0.25 + frequencyDropRatio * 100 * 0.2 + overdueScore * 0.15;

  const insights = deriveInsights({
    status,
    totalSpent,
    avgGap,
    lastPurchaseAt,
    predictedNextPurchaseAt,
    frequencyDropRatio,
    totalOrders,
    highValueThreshold: input.highValueThreshold,
    now,
  });

  return {
    lastPurchaseAt,
    totalOrders,
    totalSpent,
    avgTicket,
    avgGap,
    daysSinceLastPurchase,
    purchaseFrequency90d,
    frequencyDropRatio,
    status,
    valueScore,
    priorityScore,
    predictedNextPurchaseAt,
    ...insights,
  };
}

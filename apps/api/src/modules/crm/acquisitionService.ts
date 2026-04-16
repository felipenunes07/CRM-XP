import type { AcquisitionMetrics, NewCustomerListItem } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { getMetaAdsMonthlySpend, type MetaAdsMonthlySpendPoint } from "./metaAdsService.js";

const DEFAULT_DAILY_WINDOW_DAYS = 30;

interface FirstPurchaseRow {
  customerId: string;
  customerCode: string;
  displayName: string;
  firstOrderDate: string;
  firstOrderAmount: number;
  firstAttendant: string | null;
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatMonthKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(value: Date, months: number) {
  const result = new Date(value);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function getFirstHistoryMonth(rows: FirstPurchaseRow[], fallbackMonth: Date) {
  return rows.reduce((currentMin, row) => {
    const rowMonth = startOfMonth(parseDateOnly(row.firstOrderDate));
    return rowMonth < currentMin ? rowMonth : currentMin;
  }, fallbackMonth);
}

function getFirstSpendMonth(points: MetaAdsMonthlySpendPoint[], fallbackMonth: Date) {
  return points.reduce((currentMin, point) => {
    const pointMonth = startOfMonth(parseDateOnly(`${point.month}-01`));
    return pointMonth < currentMin ? pointMonth : currentMin;
  }, fallbackMonth);
}

export function buildAcquisitionMetrics(
  rows: FirstPurchaseRow[],
  referenceDate: string,
  dailyWindowDays = DEFAULT_DAILY_WINDOW_DAYS,
  spendPoints: MetaAdsMonthlySpendPoint[] = [],
): AcquisitionMetrics {
  const safeWindow = Math.max(1, Math.floor(dailyWindowDays));
  const today = parseDateOnly(referenceDate);
  const yesterday = addDays(today, -1);
  const currentMonth = startOfMonth(today);
  const previousMonth = addMonths(currentMonth, -1);
  const firstHistoryMonth = getFirstHistoryMonth(rows, currentMonth);
  const firstSpendMonth = getFirstSpendMonth(spendPoints, currentMonth);
  const seriesStartMonth = firstSpendMonth < firstHistoryMonth ? firstSpendMonth : firstHistoryMonth;

  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const spendByMonth = new Map<string, number>();

  for (const row of rows) {
    byDay.set(row.firstOrderDate, (byDay.get(row.firstOrderDate) ?? 0) + 1);
    const monthKey = row.firstOrderDate.slice(0, 7);
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + 1);
  }

  for (const point of spendPoints) {
    spendByMonth.set(point.month, (spendByMonth.get(point.month) ?? 0) + point.spend);
  }

  const dailySeries = Array.from({ length: safeWindow }, (_, index) => {
    const date = formatDateOnly(addDays(today, -(safeWindow - index - 1)));
    return {
      date,
      newCustomers: byDay.get(date) ?? 0,
    };
  });

  const monthlySeries: AcquisitionMetrics["monthlySeries"] = [];
  let cursor = seriesStartMonth;
  while (cursor <= currentMonth) {
    const month = formatMonthKey(cursor);
    const newCustomers = byMonth.get(month) ?? 0;
    const spend = spendByMonth.get(month) ?? 0;
    monthlySeries.push({
      month,
      newCustomers,
      spend,
      cac: newCustomers > 0 ? spend / newCustomers : null,
    });
    cursor = addMonths(cursor, 1);
  }

  const recentCustomers = rows
    .filter((row) => row.firstOrderDate >= formatDateOnly(currentMonth) && row.firstOrderDate <= referenceDate)
    .sort((left, right) => {
      if (right.firstOrderDate !== left.firstOrderDate) {
        return right.firstOrderDate.localeCompare(left.firstOrderDate);
      }

      return left.displayName.localeCompare(right.displayName, "pt-BR");
    })
    .map(
      (row) =>
        ({
          customerId: row.customerId,
          customerCode: row.customerCode,
          displayName: row.displayName,
          firstOrderDate: row.firstOrderDate,
          firstOrderAmount: row.firstOrderAmount,
          firstAttendant: row.firstAttendant,
        }) satisfies NewCustomerListItem,
    );

  const currentMonthKey = formatMonthKey(currentMonth);
  const previousMonthKey = formatMonthKey(previousMonth);
  const currentMonthEntry = monthlySeries.find((entry) => entry.month === currentMonthKey);
  const previousMonthEntry = monthlySeries.find((entry) => entry.month === previousMonthKey);

  return {
    summary: {
      today: byDay.get(referenceDate) ?? 0,
      yesterday: byDay.get(formatDateOnly(yesterday)) ?? 0,
      currentMonth: currentMonthEntry?.newCustomers ?? 0,
      previousMonth: previousMonthEntry?.newCustomers ?? 0,
      historicalTotal: rows.length,
      currentMonthSpend: currentMonthEntry?.spend ?? 0,
      previousMonthSpend: previousMonthEntry?.spend ?? 0,
      currentMonthCac: currentMonthEntry?.cac ?? null,
      previousMonthCac: previousMonthEntry?.cac ?? null,
    },
    dailySeries,
    monthlySeries,
    recentCustomers,
  };
}

export async function getAcquisitionMetrics(dailyWindowDays = DEFAULT_DAILY_WINDOW_DAYS): Promise<AcquisitionMetrics> {
  const [todayResult, rowsResult] = await Promise.all([
    pool.query<{ today: string }>("SELECT CURRENT_DATE::text AS today"),
    pool.query<{
      customerId: string;
      customerCode: string | null;
      displayName: string | null;
      firstOrderDate: string;
      firstOrderAmount: string | number | null;
      firstAttendant: string | null;
    }>(
      `
        WITH ranked_orders AS (
          SELECT
            o.customer_id AS "customerId",
            c.customer_code AS "customerCode",
            c.display_name AS "displayName",
            o.order_date::date::text AS "firstOrderDate",
            o.total_amount AS "firstOrderAmount",
            NULLIF(o.last_attendant, '') AS "firstAttendant",
            ROW_NUMBER() OVER (
              PARTITION BY o.customer_id
              ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
            ) AS order_rank
          FROM orders o
          JOIN customers c ON c.id = o.customer_id
        )
        SELECT
          "customerId",
          "customerCode",
          "displayName",
          "firstOrderDate",
          "firstOrderAmount",
          "firstAttendant"
        FROM ranked_orders
        WHERE order_rank = 1
        ORDER BY "firstOrderDate" ASC, "displayName" ASC
      `,
    ),
  ]);

  const today = todayResult.rows[0]?.today ?? new Date().toISOString().slice(0, 10);
  const rows = rowsResult.rows.map((row) => ({
    customerId: String(row.customerId),
    customerCode: String(row.customerCode ?? ""),
    displayName: String(row.displayName ?? "Cliente sem nome"),
    firstOrderDate: String(row.firstOrderDate),
    firstOrderAmount: Number(row.firstOrderAmount ?? 0),
    firstAttendant: row.firstAttendant ? String(row.firstAttendant) : null,
  }));
  const firstHistoryMonth = formatDateOnly(startOfMonth(getFirstHistoryMonth(rows, parseDateOnly(today))));

  let spendPoints: MetaAdsMonthlySpendPoint[] = [];
  try {
    spendPoints = await getMetaAdsMonthlySpend(firstHistoryMonth, today);
  } catch (error) {
    logger.warn("meta ads monthly spend unavailable", {
      error: error instanceof Error ? error.message : String(error),
      since: firstHistoryMonth,
      until: today,
    });
  }

  return buildAcquisitionMetrics(rows, today, dailyWindowDays, spendPoints);
}

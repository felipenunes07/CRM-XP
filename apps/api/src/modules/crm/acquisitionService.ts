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
  firstItemCount: number;
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
  dailyWindowDays: number,
  spendPoints: MetaAdsMonthlySpendPoint[],
  ltvRow: { avg_lifespan_months: number | null; churn_rate: number | null } | null,
  globalStats: { avg_ticket: number; avg_freq_days: number } | null,
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
  const piecesByMonth = new Map<string, number>();
  const amountByMonth = new Map<string, number>();
  const spendByMonthSource = new Map<string, "api" | "fallback">();

  for (const row of rows) {
    byDay.set(row.firstOrderDate, (byDay.get(row.firstOrderDate) ?? 0) + 1);
    const monthKey = row.firstOrderDate.slice(0, 7);
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + 1);
    piecesByMonth.set(monthKey, (piecesByMonth.get(monthKey) ?? 0) + row.firstItemCount);
    amountByMonth.set(monthKey, (amountByMonth.get(monthKey) ?? 0) + row.firstOrderAmount);
  }

  for (const point of spendPoints) {
    spendByMonth.set(point.month, (spendByMonth.get(point.month) ?? 0) + point.spend);
    if (point.source) {
      spendByMonthSource.set(point.month, point.source);
    }
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
      spendSource: spendByMonthSource.get(month),
    });
    cursor = addMonths(cursor, 1);
  }

  const recentCustomers = rows
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
          firstItemCount: row.firstItemCount,
          firstAttendant: row.firstAttendant,
        }) satisfies NewCustomerListItem,
    );

  const currentMonthKey = formatMonthKey(currentMonth);
  const previousMonthKey = formatMonthKey(previousMonth);
  const currentMonthEntry = monthlySeries.find((entry) => entry.month === currentMonthKey);
  const previousMonthEntry = monthlySeries.find((entry) => entry.month === previousMonthKey);

  const currentMonthNewCustomers = currentMonthEntry?.newCustomers ?? 0;
  const previousMonthNewCustomers = previousMonthEntry?.newCustomers ?? 0;

  const currentMonthAmount = amountByMonth.get(currentMonthKey) ?? 0;
  const previousMonthAmount = amountByMonth.get(previousMonthKey) ?? 0;

  return {
    summary: {
      today: byDay.get(referenceDate) ?? 0,
      yesterday: byDay.get(formatDateOnly(yesterday)) ?? 0,
      currentMonth: currentMonthNewCustomers,
      previousMonth: previousMonthNewCustomers,
      historicalTotal: rows.length,
      currentMonthSpend: currentMonthEntry?.spend ?? 0,
      previousMonthSpend: previousMonthEntry?.spend ?? 0,
      currentMonthCac: currentMonthEntry?.cac ?? null,
      previousMonthCac: previousMonthEntry?.cac ?? null,
      currentMonthPieces: piecesByMonth.get(currentMonthKey) ?? 0,
      previousMonthPieces: piecesByMonth.get(previousMonthKey) ?? 0,
      currentMonthAvgTicket: currentMonthNewCustomers > 0 ? currentMonthAmount / currentMonthNewCustomers : null,
      previousMonthAvgTicket: previousMonthNewCustomers > 0 ? previousMonthAmount / previousMonthNewCustomers : null,
      currentMonthSpendSource: currentMonthEntry?.spendSource,
      previousMonthSpendSource: previousMonthEntry?.spendSource,
      ...calculateLtvFields(currentMonthEntry?.cac, previousMonthEntry?.cac, ltvRow, globalStats),
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
      firstItemCount: string | number | null;
      firstAttendant: string | null;
    }>(
      `
        WITH old_codes AS (
          SELECT customer_code
          FROM customers
          WHERE source_system_first = 'history_xls'
            AND customer_code ~ '^(CL|KH|OEM)[0-9]+$'
        ),
        ranked_orders AS (
          SELECT
            o.customer_id AS "customerId",
            c.customer_code AS "customerCode",
            c.display_name AS "displayName",
            o.order_date::date::text AS "firstOrderDate",
            o.total_amount AS "firstOrderAmount",
            o.item_count AS "firstItemCount",
            NULLIF(o.last_attendant, '') AS "firstAttendant",
            ROW_NUMBER() OVER (
              PARTITION BY o.customer_id
              ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
            ) AS order_rank
          FROM orders o
          JOIN customers c ON c.id = o.customer_id
          WHERE NOT (
            c.source_system_first = 'supabase_2026'
            AND EXISTS (
              SELECT 1 FROM old_codes oc
              WHERE c.display_name LIKE oc.customer_code || ' %'
                 OR c.display_name LIKE oc.customer_code || '-%'
                 OR c.display_name LIKE oc.customer_code || ' -%'
            )
          )
          AND c.customer_code != 'OEM417'
          AND c.display_name NOT ILIKE '%MARX%'
        )
        SELECT
          "customerId",
          "customerCode",
          "displayName",
          "firstOrderDate",
          "firstOrderAmount",
          "firstItemCount",
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
    firstItemCount: Number(row.firstItemCount ?? 0),
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

  const [ltvResult, globalStatsResult] = await Promise.all([
    pool.query<{ avg_lifespan_months: number | null; churn_rate: number | null }>(`
      WITH customer_lifespan AS (
        SELECT 
          s.customer_id,
          (s.last_purchase_at::date - fp.first_purchase_date) as tenure_days
        FROM customer_snapshot s
        JOIN (
          SELECT customer_id, MIN(order_date) as first_purchase_date
          FROM orders
          GROUP BY customer_id
        ) fp ON fp.customer_id = s.customer_id
        WHERE s.total_orders > 1
      )
      SELECT 
        AVG(tenure_days / 30.44)::numeric(14,2) as avg_lifespan_months,
        (
          SELECT (COUNT(*) FILTER (WHERE status = 'INACTIVE'))::float / NULLIF(COUNT(*), 0)
          FROM customer_snapshot
        ) as churn_rate
      FROM customer_lifespan
    `),
    pool.query<{ avg_ticket: number; avg_freq_days: number }>(`
      SELECT 
        AVG(avg_ticket)::numeric(14,2) as avg_ticket,
        AVG(avg_days_between_orders)::numeric(14,2) as avg_freq_days
      FROM customer_snapshot
    `)
  ]);

  return buildAcquisitionMetrics(
    rows, 
    today, 
    dailyWindowDays, 
    spendPoints, 
    ltvResult.rows[0] || null,
    globalStatsResult.rows[0] || null
  );
}

function calculateLtvFields(
  currentCac: number | null | undefined,
  previousCac: number | null | undefined,
  ltvRow: { avg_lifespan_months: number | null; churn_rate: number | null } | null,
  globalStats: { avg_ticket: number; avg_freq_days: number } | null
) {
  const avgTicket = Number(globalStats?.avg_ticket ?? 0);
  const avgFreqDays = Number(globalStats?.avg_freq_days ?? 0);
  const lifespanMonths = Math.max(12, Number(ltvRow?.avg_lifespan_months ?? 24)); // Default to 24 months for stable LTV
  const avgCac = currentCac || previousCac || null;

  // LTV = Ticket * AnnualFrequency * LifespanYears
  // Or simply: Ticket * (MonthlyFrequency * LifespanMonths)
  const annualFreq = avgFreqDays > 0 ? 365 / avgFreqDays : (365 / 60); // Fallback to 6 purchases per year if data missing
  const estimatedLtv = avgTicket * annualFreq * (lifespanMonths / 12);
  
  return {
    estimatedLtv: estimatedLtv || 0,
    ltvCacRatio: (avgCac && avgCac > 0) ? estimatedLtv / avgCac : null,
    estimatedLifespanMonths: lifespanMonths,
    monthlyChurnRate: ltvRow?.churn_rate ?? null,
  };
}

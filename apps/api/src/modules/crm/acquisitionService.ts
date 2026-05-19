import type { AcquisitionMetrics, NewCustomerListItem } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
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
  todayMetrics: { amount: number; items: number; orders: number; performance: any[] },
  groupsCreatedByDay: Map<string, number>,
  convertedGroupsByDay: Map<string, number>,
  unconvertedGroupsList: Array<{ name: string; date: string }>,
  allGroupsList: Array<{ name: string; date: string; isConverted: boolean }>
): AcquisitionMetrics {
  const safeWindow = Math.max(1, Math.floor(dailyWindowDays));
  const today = parseDateOnly(referenceDate);
  const yesterday = addDays(today, -1);
  const currentMonth = startOfMonth(today);
  const previousMonth = addMonths(currentMonth, -1);
  const firstHistoryMonth = getFirstHistoryMonth(rows, currentMonth);
  const firstSpendMonth = getFirstSpendMonth(spendPoints, currentMonth);
  
  // Find first month with group data
  let firstGroupMonth = currentMonth;
  for (const date of groupsCreatedByDay.keys()) {
    const month = startOfMonth(parseDateOnly(date));
    if (month < firstGroupMonth) firstGroupMonth = month;
  }

  let seriesStartMonth = firstHistoryMonth;
  if (firstSpendMonth < seriesStartMonth) seriesStartMonth = firstSpendMonth;
  if (firstGroupMonth < seriesStartMonth) seriesStartMonth = firstGroupMonth;

  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const spendByMonth = new Map<string, number>();
  const piecesByMonth = new Map<string, number>();
  const amountByMonth = new Map<string, number>();
  const spendByMonthSource = new Map<string, "api" | "fallback">();
  const groupsByMonth = new Map<string, number>();
  const convertedByMonth = new Map<string, number>();

  for (const [date, count] of groupsCreatedByDay.entries()) {
    const monthKey = date.slice(0, 7);
    groupsByMonth.set(monthKey, (groupsByMonth.get(monthKey) ?? 0) + count);
  }

  for (const [date, count] of convertedGroupsByDay.entries()) {
    const monthKey = date.slice(0, 7);
    convertedByMonth.set(monthKey, (convertedByMonth.get(monthKey) ?? 0) + count);
  }

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

  const dailySeries: Array<{ date: string; newCustomers: number; groupsCreated: number; convertedGroups: number }> = [];
  let dayCursor = new Date(seriesStartMonth);
  const todayStr = formatDateOnly(today);
  while (formatDateOnly(dayCursor) <= todayStr) {
    const date = formatDateOnly(dayCursor);
    dailySeries.push({
      date,
      newCustomers: byDay.get(date) ?? 0,
      groupsCreated: groupsCreatedByDay.get(date) ?? 0,
      convertedGroups: convertedGroupsByDay.get(date) ?? 0,
    });
    dayCursor = addDays(dayCursor, 1);
  }

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
      groupsCreated: groupsByMonth.get(month) ?? 0,
      convertedGroups: convertedByMonth.get(month) ?? 0,
      conversionRate: (groupsByMonth.get(month) ?? 0) > 0 
        ? (convertedByMonth.get(month) ?? 0) / (groupsByMonth.get(month) ?? 1)
        : null,
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
      todaySalesAmount: todayMetrics.amount,
      todayItemsSold: todayMetrics.items,
      todayOrdersCount: todayMetrics.orders,
      todaySalesPerformance: todayMetrics.performance,
      currentMonthGroupsCreated: groupsByMonth.get(currentMonthKey) ?? 0,
      previousMonthGroupsCreated: groupsByMonth.get(previousMonthKey) ?? 0,
      currentMonthConvertedGroups: convertedByMonth.get(currentMonthKey) ?? 0,
      previousMonthConvertedGroups: convertedByMonth.get(previousMonthKey) ?? 0,
      ...calculateLtvFields(currentMonthEntry?.cac, previousMonthEntry?.cac, ltvRow, globalStats),
    },
    dailySeries,
    monthlySeries,
    recentCustomers,
    unconvertedGroups: unconvertedGroupsList,
    allGroups: allGroupsList,
  };
}

export async function getAcquisitionMetrics(dailyWindowDays = DEFAULT_DAILY_WINDOW_DAYS): Promise<AcquisitionMetrics> {
  const [todayResult, rowsResult, todaySalesResult, todayPerformanceResult, groupsCreatedHistoryResult] = await Promise.all([
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
            AND customer_code ~ '^(CL|KH|LJ)[0-9]+$'
        ),
        all_eligible_orders AS (
          SELECT
            o.customer_id,
            o.order_date,
            o.total_amount,
            (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS item_count,
            NULLIF(o.last_attendant, '') AS attendant,
            o.created_at,
            o.id,
            MIN(o.order_date) OVER (PARTITION BY o.customer_id) as first_date
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
        ),
        first_order_attribution AS (
          SELECT
            customer_id,
            attendant,
            first_date,
            ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date ASC, created_at ASC, id ASC) as rn
          FROM all_eligible_orders
        ),
        first_month_aggregates AS (
          SELECT
            customer_id,
            SUM(total_amount) as total_amount,
            SUM(item_count) as total_items
          FROM all_eligible_orders
          WHERE TO_CHAR(order_date, 'YYYY-MM') = TO_CHAR(first_date, 'YYYY-MM')
          GROUP BY customer_id
        )
        SELECT
          fma.customer_id AS "customerId",
          c.customer_code AS "customerCode",
          c.display_name AS "displayName",
          foa.first_date::text AS "firstOrderDate",
          fma.total_amount AS "firstOrderAmount",
          fma.total_items AS "firstItemCount",
          foa.attendant AS "firstAttendant"
        FROM first_month_aggregates fma
        JOIN first_order_attribution foa ON foa.customer_id = fma.customer_id AND foa.rn = 1
        JOIN customers c ON c.id = fma.customer_id
        ORDER BY "firstOrderDate" ASC, "displayName" ASC
      `,
    ),
    pool.query(`
      SELECT 
        COALESCE(SUM(o.total_amount), 0)::numeric(14,2) as total_amount,
        COALESCE(SUM(oi.quantity), 0)::int as total_items,
        COUNT(DISTINCT o.id)::int as total_orders
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.order_date::date = CURRENT_DATE
    `),
    pool.query(`
      WITH order_item_totals AS (
        SELECT
          oi.order_id,
          COALESCE(SUM(oi.quantity), 0)::int AS total_items
        FROM order_items oi
        GROUP BY oi.order_id
      ),
      scoped_orders AS (
        SELECT
          o.id,
          o.customer_id,
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          COALESCE(o.total_amount, 0)::numeric(14,2) AS total_revenue,
          COALESCE(oit.total_items, 0)::int AS total_items
        FROM orders o
        LEFT JOIN order_item_totals oit ON oit.order_id = o.id
        WHERE o.order_date::date = CURRENT_DATE
      )
      SELECT
        so.attendant,
        COUNT(*)::int AS total_orders,
        COUNT(DISTINCT so.customer_id)::int AS unique_customers,
        COALESCE(SUM(so.total_revenue), 0)::numeric(14,2) AS total_revenue,
        COALESCE(SUM(so.total_items), 0)::int AS total_items
      FROM scoped_orders so
      GROUP BY so.attendant
      ORDER BY total_items DESC, total_orders DESC, total_revenue DESC, attendant ASC
      LIMIT 10
    `),
    getWhatsAppGroupsCreatedHistory()
  ]);

  const { 
    createdByDay: groupsCreatedByDay, 
    convertedByDay: convertedGroupsByDay,
    unconvertedList: unconvertedGroupsList,
    allList: allGroupsList
  } = groupsCreatedHistoryResult;

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
    globalStatsResult.rows[0] || null,
    {
      amount: Number(todaySalesResult.rows[0]?.total_amount ?? 0),
      items: Number(todaySalesResult.rows[0]?.total_items ?? 0),
      orders: Number(todaySalesResult.rows[0]?.total_orders ?? 0),
      performance: todayPerformanceResult.rows.map(row => ({
        attendant: String(row.attendant ?? "Sem atendente"),
        totalOrders: Number(row.total_orders ?? 0),
        uniqueCustomers: Number(row.unique_customers ?? 0),
        totalRevenue: Number(row.total_revenue ?? 0),
        totalItems: Number(row.total_items ?? 0),
      }))
    },
    groupsCreatedByDay,
    convertedGroupsByDay,
    unconvertedGroupsList,
    allGroupsList
  );
}

async function getWhatsAppGroupsCreatedHistory(): Promise<{ 
  createdByDay: Map<string, number>; 
  convertedByDay: Map<string, number>;
  unconvertedList: Array<{ name: string; date: string }>;
  allList: Array<{ name: string; date: string; isConverted: boolean }>;
}> {
  const createdByDay = new Map<string, number>();
  const convertedByDay = new Map<string, number>();
  const unconvertedList: Array<{ name: string; date: string }> = [];
  const allList: Array<{ name: string; date: string; isConverted: boolean }> = [];
  const csvUrl = env.WHATSAPP_GROUPS_SHEET_CSV_URL;
  if (!csvUrl) return { createdByDay, convertedByDay, unconvertedList, allList };

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) return { createdByDay, convertedByDay, unconvertedList, allList };

    const csvText = await response.text();
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return { createdByDay, convertedByDay, unconvertedList, allList };

    const headers = lines[0]!.split(",").map(h => h.trim().toLowerCase());
    const nameIndex = headers.findIndex(h => h === "name" || h === "nome");
    const dateIndex = headers.findIndex(h => h === "data criao" || h === "data criacao" || h.includes("data"));
    
    if (dateIndex === -1) return { createdByDay, convertedByDay, unconvertedList, allList };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;

      const cols = line.split(",");
      const sourceName = nameIndex !== -1 ? cols[nameIndex]?.trim() ?? "" : "";
      const dateStr = cols[dateIndex]?.trim();
      if (!dateStr) continue;

      // Format: DD/MM/YYYY
      const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const isoDate = `${match[3]}-${match[2]}-${match[1]}`;
        createdByDay.set(isoDate, (createdByDay.get(isoDate) ?? 0) + 1);

        // Check for conversion (CL, KH, LJ prefixes)
        const isConverted = /^(CL|KH|LJ)\d+/i.test(sourceName);
        allList.push({ name: sourceName, date: isoDate, isConverted });
        if (isConverted) {
          convertedByDay.set(isoDate, (convertedByDay.get(isoDate) ?? 0) + 1);
        } else {
          unconvertedList.push({ name: sourceName, date: isoDate });
        }
      }
    }
  } catch (error) {
    logger.warn("Failed to fetch whatsapp groups history for dashboard", { error });
  }

  // Sort lists
  unconvertedList.sort((a, b) => b.date.localeCompare(a.date));
  allList.sort((a, b) => b.date.localeCompare(a.date));

  return { createdByDay, convertedByDay, unconvertedList, allList };
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

import type { AcquisitionMetrics, NewCustomerListItem } from "@olist-crm/shared";
import { pool } from "../../db/client.js";

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

export function buildAcquisitionMetrics(
  rows: FirstPurchaseRow[],
  referenceDate: string,
  dailyWindowDays = DEFAULT_DAILY_WINDOW_DAYS,
): AcquisitionMetrics {
  const safeWindow = Math.max(1, Math.floor(dailyWindowDays));
  const today = parseDateOnly(referenceDate);
  const yesterday = addDays(today, -1);
  const currentMonth = startOfMonth(today);
  const previousMonth = addMonths(currentMonth, -1);
  const firstHistoryMonth = getFirstHistoryMonth(rows, currentMonth);

  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();

  for (const row of rows) {
    byDay.set(row.firstOrderDate, (byDay.get(row.firstOrderDate) ?? 0) + 1);
    const monthKey = row.firstOrderDate.slice(0, 7);
    byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + 1);
  }

  const dailySeries = Array.from({ length: safeWindow }, (_, index) => {
    const date = formatDateOnly(addDays(today, -(safeWindow - index - 1)));
    return {
      date,
      newCustomers: byDay.get(date) ?? 0,
    };
  });

  const monthlySeries: AcquisitionMetrics["monthlySeries"] = [];
  let cursor = firstHistoryMonth;
  while (cursor <= currentMonth) {
    const month = formatMonthKey(cursor);
    monthlySeries.push({
      month,
      newCustomers: byMonth.get(month) ?? 0,
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

  return {
    summary: {
      today: byDay.get(referenceDate) ?? 0,
      yesterday: byDay.get(formatDateOnly(yesterday)) ?? 0,
      currentMonth:
        monthlySeries.find((entry) => entry.month === formatMonthKey(currentMonth))?.newCustomers ?? 0,
      previousMonth:
        monthlySeries.find((entry) => entry.month === formatMonthKey(previousMonth))?.newCustomers ?? 0,
      historicalTotal: rows.length,
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

  return buildAcquisitionMetrics(rows, today, dailyWindowDays);
}

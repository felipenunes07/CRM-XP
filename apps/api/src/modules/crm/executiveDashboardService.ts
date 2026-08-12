import type { ExecutiveDashboardMetrics } from "@olist-crm/shared";
import { pool } from "../../db/client.js";

const DAILY_TARGET_DIVISOR = 20;
const EXECUTIVE_DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const SAO_PAULO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface ExecutiveDashboardSelectionInput {
  year?: number;
  month?: number;
  day?: number;
}

export interface ExecutiveDashboardResolvedPeriod {
  year: number;
  month: number;
  day: number | null;
  startDate: string;
  endDate: string;
  endDateExclusive: string;
  monthStart: string;
  monthEndExclusive: string;
  previousMonthStart: string;
  previousMonthEndExclusive: string;
  previousYearStart: string;
  previousYearEndExclusive: string;
}

export function fillExecutiveMonthlyCustomers(
  selectedMonth: number,
  rows: Array<{ month: number; unique_customers: string | number | null }>,
) {
  const customersByMonth = new Map(
    rows.map((row) => [Number(row.month), Number(row.unique_customers ?? 0)]),
  );
  return Array.from({ length: selectedMonth }, (_, index) => ({
    month: index + 1,
    uniqueCustomers: customersByMonth.get(index + 1) ?? 0,
  }));
}

function getSaoPauloDateParts(now: Date) {
  const parts = SAO_PAULO_DATE_FORMATTER.formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toDateOnly(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextDay(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day + 1));
  return toDateOnly(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function shiftMonth(year: number, month: number, offset: number) {
  const value = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
  };
}

function comparisonRange(year: number, month: number, day: number | null, monthOffset: number, yearOffset = 0) {
  const shifted = shiftMonth(year + yearOffset, month, monthOffset);
  const startDay = day === null ? 1 : Math.min(day, daysInMonth(shifted.year, shifted.month));
  const start = toDateOnly(shifted.year, shifted.month, startDay);
  const followingMonth = shiftMonth(shifted.year, shifted.month, 1);
  const endExclusive = day === null
    ? toDateOnly(followingMonth.year, followingMonth.month, 1)
    : nextDay(shifted.year, shifted.month, startDay);

  return { start, endExclusive };
}

export function resolveExecutiveDashboardPeriod(
  input: ExecutiveDashboardSelectionInput,
  now = new Date(),
): ExecutiveDashboardResolvedPeriod {
  const today = getSaoPauloDateParts(now);
  const year = input.year ?? today.year;
  const month = input.month ?? today.month;
  const day = input.day ?? null;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new RangeError("Ano inválido");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Mês inválido");
  }
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month))) {
    throw new RangeError("Dia inválido para o mês selecionado");
  }

  const nextMonth = shiftMonth(year, month, 1);
  const monthStart = toDateOnly(year, month, 1);
  const monthEndExclusive = toDateOnly(nextMonth.year, nextMonth.month, 1);
  const startDate = day === null ? monthStart : toDateOnly(year, month, day);
  const endDateExclusive = day === null ? monthEndExclusive : nextDay(year, month, day);
  const previousMonth = comparisonRange(year, month, day, -1);
  const previousYear = comparisonRange(year, month, day, 0, -1);

  return {
    year,
    month,
    day,
    startDate,
    endDate: day === null ? toDateOnly(year, month, daysInMonth(year, month)) : startDate,
    endDateExclusive,
    monthStart,
    monthEndExclusive,
    previousMonthStart: previousMonth.start,
    previousMonthEndExclusive: previousMonth.endExclusive,
    previousYearStart: previousYear.start,
    previousYearEndExclusive: previousYear.endExclusive,
  };
}

export function resolveExecutiveDashboardDailyPeriod(
  period: ExecutiveDashboardResolvedPeriod,
  latestSaleDate: string | null,
) {
  if (period.day !== null) return period;

  const candidate = String(latestSaleDate ?? "").slice(0, 10);
  const isInsideSelectedMonth = candidate >= period.monthStart && candidate < period.monthEndExclusive;
  const effectiveDate = isInsideSelectedMonth ? candidate : period.monthStart;
  const day = Number(effectiveDate.slice(8, 10));

  return resolveExecutiveDashboardPeriod({
    year: period.year,
    month: period.month,
    day,
  });
}

interface SummaryRow {
  total_items: string | number | null;
  total_screen_items: string | number | null;
  screen_xp_items: string | number | null;
  screen_vv_items: string | number | null;
  screen_de_items: string | number | null;
  battery_items: string | number | null;
  charging_dock_items: string | number | null;
  other_items: string | number | null;
  total_orders: string | number | null;
  unique_customers: string | number | null;
  total_revenue: string | number | null;
  previous_month_items: string | number | null;
  previous_year_items: string | number | null;
  previous_month_screen_items: string | number | null;
  previous_year_screen_items: string | number | null;
  month_items: string | number | null;
  month_screen_items: string | number | null;
  month_battery_items: string | number | null;
  month_orders: string | number | null;
  month_unique_customers: string | number | null;
  last_sale_date: string | null;
}

const executiveDashboardCache = new Map<
  string,
  { value: ExecutiveDashboardMetrics; expiresAt: number }
>();
const executiveDashboardRequests = new Map<string, Promise<ExecutiveDashboardMetrics>>();

function executiveDashboardCacheKey(period: ExecutiveDashboardResolvedPeriod) {
  return `${period.year}-${period.month}-${period.day ?? "latest"}`;
}

async function loadExecutiveDashboardMetrics(
  period: ExecutiveDashboardResolvedPeriod,
): Promise<ExecutiveDashboardMetrics> {
  const yearStart = toDateOnly(period.year, 1, 1);
  const latestSaleDate = period.day === null
    ? (
        await pool.query<{ focus_date: string | null }>(
          `
            SELECT MAX(order_date)::text AS focus_date
            FROM orders
            WHERE order_date >= $1::date AND order_date < $2::date
          `,
          [period.monthStart, period.monthEndExclusive],
        )
      ).rows[0]?.focus_date ?? null
    : period.startDate;
  const dailyPeriod = resolveExecutiveDashboardDailyPeriod(
    period,
    latestSaleDate,
  );
  const rangeParams = [
    dailyPeriod.startDate,
    dailyPeriod.endDateExclusive,
    dailyPeriod.previousMonthStart,
    dailyPeriod.previousMonthEndExclusive,
    dailyPeriod.previousYearStart,
    dailyPeriod.previousYearEndExclusive,
    period.monthStart,
    period.monthEndExclusive,
  ];

  const [availabilityResult, summaryResult, targetResult, sellersResult, dailyResult, monthlyCustomersResult, inventoryResult, syncResult] =
    await Promise.all([
      pool.query<{
        year: number;
        month: number;
        days: number[];
      }>(`
        SELECT
          EXTRACT(YEAR FROM order_date)::int AS year,
          EXTRACT(MONTH FROM order_date)::int AS month,
          ARRAY_AGG(
            DISTINCT EXTRACT(DAY FROM order_date)::int
            ORDER BY EXTRACT(DAY FROM order_date)::int
          ) AS days
        FROM orders
        GROUP BY EXTRACT(YEAR FROM order_date), EXTRACT(MONTH FROM order_date)
        ORDER BY year DESC, month DESC
      `),
      pool.query<SummaryRow>(
        `
          WITH active_catalog AS (
            SELECT DISTINCT isi.sku
            FROM inventory_snapshot_items isi
            JOIN inventory_snapshots inventory ON inventory.id = isi.snapshot_id
            WHERE inventory.is_active = TRUE
              AND NULLIF(BTRIM(isi.sku), '') IS NOT NULL
          ),
          selected_orders AS MATERIALIZED (
            SELECT id, customer_id, order_date::date AS order_date, total_amount
            FROM orders
            WHERE (order_date >= $3::date AND order_date < $4::date)
               OR (order_date >= $5::date AND order_date < $6::date)
               OR (order_date >= $7::date AND order_date < $8::date)
          ),
          raw_order_items AS (
            SELECT
              oi.order_id,
              COALESCE(oi.quantity, 0)::numeric(14,2) AS quantity,
              UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) AS product_text,
              active_catalog.sku IS NOT NULL AS in_catalog
            FROM order_items oi
            JOIN selected_orders selected ON selected.id = oi.order_id
            LEFT JOIN active_catalog ON active_catalog.sku = oi.sku
          ),
          classified_order_items AS (
            SELECT
              order_id,
              quantity,
              CASE
                WHEN product_text ~ '(^|[^A-Z])(DOC|DOCK)[[:space:]]+DE[[:space:]]+CARGA([^A-Z]|$)' THEN 'DOCK'
                WHEN product_text ~ '(^|[^A-Z])(BAT|BATTERY|BATERIA|BATERIAS)([^A-Z]|$)' THEN 'BATTERY'
                WHEN in_catalog
                  OR product_text ~ '(^|[^A-Z])(TELA|FRONTAL|DISPLAY|LCD|OLED|AMOLED|INCELL|ONCELL|TOUCH)([^A-Z]|$)'
                  THEN 'SCREEN'
                ELSE 'OTHER'
              END AS category,
              CASE
                WHEN product_text ~ '(^|[[:space:]\\[])VV([[:space:]\\]]|$)' THEN 'VV'
                WHEN product_text ~ '(^|[[:space:]\\[])DE([[:space:]\\]]|$)' THEN 'DE'
                ELSE 'XP'
              END AS factory
            FROM raw_order_items
          ),
          order_item_totals AS (
            SELECT
              order_id,
              COALESCE(SUM(quantity), 0)::numeric(14,2) AS total_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN'), 0)::numeric(14,2) AS screen_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN' AND factory = 'XP'), 0)::numeric(14,2) AS screen_xp_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN' AND factory = 'VV'), 0)::numeric(14,2) AS screen_vv_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN' AND factory = 'DE'), 0)::numeric(14,2) AS screen_de_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'BATTERY'), 0)::numeric(14,2) AS battery_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'DOCK'), 0)::numeric(14,2) AS charging_dock_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'OTHER'), 0)::numeric(14,2) AS other_items
            FROM classified_order_items
            GROUP BY order_id
          ),
          order_metrics AS (
            SELECT
              o.id,
              o.customer_id,
              o.order_date::date AS order_date,
              COALESCE(o.total_amount, 0)::numeric(14,2) AS total_revenue,
              COALESCE(oit.total_items, 0)::numeric(14,2) AS total_items,
              COALESCE(oit.screen_items, 0)::numeric(14,2) AS screen_items,
              COALESCE(oit.screen_xp_items, 0)::numeric(14,2) AS screen_xp_items,
              COALESCE(oit.screen_vv_items, 0)::numeric(14,2) AS screen_vv_items,
              COALESCE(oit.screen_de_items, 0)::numeric(14,2) AS screen_de_items,
              COALESCE(oit.battery_items, 0)::numeric(14,2) AS battery_items,
              COALESCE(oit.charging_dock_items, 0)::numeric(14,2) AS charging_dock_items,
              COALESCE(oit.other_items, 0)::numeric(14,2) AS other_items
            FROM selected_orders o
            LEFT JOIN order_item_totals oit ON oit.order_id = o.id
          )
          SELECT
            COALESCE(SUM(total_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS total_items,
            COALESCE(SUM(screen_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS total_screen_items,
            COALESCE(SUM(screen_xp_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS screen_xp_items,
            COALESCE(SUM(screen_vv_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS screen_vv_items,
            COALESCE(SUM(screen_de_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS screen_de_items,
            COALESCE(SUM(battery_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS battery_items,
            COALESCE(SUM(charging_dock_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS charging_dock_items,
            COALESCE(SUM(other_items) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS other_items,
            COUNT(*) FILTER (WHERE order_date >= $1::date AND order_date < $2::date)::int AS total_orders,
            COUNT(DISTINCT customer_id) FILTER (WHERE order_date >= $1::date AND order_date < $2::date)::int AS unique_customers,
            COALESCE(SUM(total_revenue) FILTER (WHERE order_date >= $1::date AND order_date < $2::date), 0) AS total_revenue,
            COALESCE(SUM(total_items) FILTER (WHERE order_date >= $3::date AND order_date < $4::date), 0) AS previous_month_items,
            COALESCE(SUM(total_items) FILTER (WHERE order_date >= $5::date AND order_date < $6::date), 0) AS previous_year_items,
            COALESCE(SUM(screen_items) FILTER (WHERE order_date >= $3::date AND order_date < $4::date), 0) AS previous_month_screen_items,
            COALESCE(SUM(screen_items) FILTER (WHERE order_date >= $5::date AND order_date < $6::date), 0) AS previous_year_screen_items,
            COALESCE(SUM(total_items) FILTER (WHERE order_date >= $7::date AND order_date < $8::date), 0) AS month_items,
            COALESCE(SUM(screen_items) FILTER (WHERE order_date >= $7::date AND order_date < $8::date), 0) AS month_screen_items,
            COALESCE(SUM(battery_items) FILTER (WHERE order_date >= $7::date AND order_date < $8::date), 0) AS month_battery_items,
            COUNT(*) FILTER (WHERE order_date >= $7::date AND order_date < $8::date)::int AS month_orders,
            COUNT(DISTINCT customer_id) FILTER (WHERE order_date >= $7::date AND order_date < $8::date)::int AS month_unique_customers,
            (MAX(order_date) FILTER (WHERE order_date >= $7::date AND order_date < $8::date))::text AS last_sale_date
          FROM order_metrics
        `,
        rangeParams,
      ),
      pool.query<{
        target_amount: string | number | null;
        target_batteries: string | number | null;
      }>(
        `
          SELECT
            COALESCE(
              MAX(target_amount) FILTER (WHERE attendant = 'TOTAL'),
              SUM(target_amount) FILTER (WHERE attendant <> 'TOTAL'),
              0
            ) AS target_amount,
            COALESCE(
              MAX(target_batteries) FILTER (WHERE attendant = 'TOTAL'),
              SUM(target_batteries) FILTER (WHERE attendant <> 'TOTAL'),
              0
            ) AS target_batteries
          FROM monthly_targets
          WHERE year = $1 AND month = $2
        `,
        [period.year, period.month],
      ),
      pool.query<{
        attendant: string | null;
        profile_picture_url: string | null;
        total_orders: string | number | null;
        unique_customers: string | number | null;
        total_revenue: string | number | null;
        total_items: string | number | null;
        screen_items: string | number | null;
        battery_items: string | number | null;
        charging_dock_items: string | number | null;
      }>(
        `
          WITH active_catalog AS (
            SELECT DISTINCT isi.sku
            FROM inventory_snapshot_items isi
            JOIN inventory_snapshots inventory ON inventory.id = isi.snapshot_id
            WHERE inventory.is_active = TRUE
              AND NULLIF(BTRIM(isi.sku), '') IS NOT NULL
          ),
          selected_orders AS MATERIALIZED (
            SELECT id, customer_id, last_attendant, total_amount
            FROM orders
            WHERE order_date >= $1::date AND order_date < $2::date
              AND NULLIF(BTRIM(last_attendant), '') IS NOT NULL
          ),
          classified_order_items AS (
            SELECT
              oi.order_id,
              COALESCE(oi.quantity, 0)::numeric(14,2) AS quantity,
              CASE
                WHEN UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) ~ '(^|[^A-Z])(DOC|DOCK)[[:space:]]+DE[[:space:]]+CARGA([^A-Z]|$)' THEN 'DOCK'
                WHEN UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) ~ '(^|[^A-Z])(BAT|BATTERY|BATERIA|BATERIAS)([^A-Z]|$)' THEN 'BATTERY'
                WHEN active_catalog.sku IS NOT NULL
                  OR UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) ~ '(^|[^A-Z])(TELA|FRONTAL|DISPLAY|LCD|OLED|AMOLED|INCELL|ONCELL|TOUCH)([^A-Z]|$)'
                  THEN 'SCREEN'
                ELSE 'OTHER'
              END AS category
            FROM order_items oi
            JOIN selected_orders selected ON selected.id = oi.order_id
            LEFT JOIN active_catalog ON active_catalog.sku = oi.sku
          ),
          order_item_totals AS (
            SELECT
              order_id,
              COALESCE(SUM(quantity), 0)::numeric(14,2) AS total_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN'), 0)::numeric(14,2) AS screen_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'BATTERY'), 0)::numeric(14,2) AS battery_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'DOCK'), 0)::numeric(14,2) AS charging_dock_items
            FROM classified_order_items
            GROUP BY order_id
          ),
          seller_totals AS (
            SELECT
              BTRIM(o.last_attendant) AS attendant,
              COUNT(*)::int AS total_orders,
              COUNT(DISTINCT o.customer_id)::int AS unique_customers,
              COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS total_revenue,
              COALESCE(SUM(oit.total_items), 0)::numeric(14,2) AS total_items,
              COALESCE(SUM(oit.screen_items), 0)::numeric(14,2) AS screen_items,
              COALESCE(SUM(oit.battery_items), 0)::numeric(14,2) AS battery_items,
              COALESCE(SUM(oit.charging_dock_items), 0)::numeric(14,2) AS charging_dock_items
            FROM selected_orders o
            LEFT JOIN order_item_totals oit ON oit.order_id = o.id
            GROUP BY BTRIM(o.last_attendant)
          )
          SELECT
            seller_totals.*,
            seller_identity.profile_picture_url
          FROM seller_totals
          LEFT JOIN LATERAL (
            SELECT NULLIF(wi.profile_picture_url, '') AS profile_picture_url
            FROM whatsapp_instances wi
            WHERE UPPER(COALESCE(wi.status, 'ACTIVE')) = 'ACTIVE'
              AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
              AND (
                LOWER(BTRIM(COALESCE(wi.assigned_user_name, ''))) = LOWER(seller_totals.attendant)
                OR LOWER(BTRIM(COALESCE(wi.display_label, ''))) = LOWER(seller_totals.attendant)
                OR LOWER(BTRIM(COALESCE(wi.instance_name, ''))) = LOWER(seller_totals.attendant)
                OR LOWER(COALESCE(wi.assigned_user_name, wi.display_label, wi.instance_name, ''))
                  LIKE '%' || LOWER(SPLIT_PART(seller_totals.attendant, ' ', 1)) || '%'
              )
            ORDER BY
              (LOWER(BTRIM(COALESCE(wi.assigned_user_name, ''))) = LOWER(seller_totals.attendant)) DESC,
              wi.updated_at DESC
            LIMIT 1
          ) seller_identity ON true
          ORDER BY screen_items DESC, total_orders DESC, total_revenue DESC, attendant ASC
          LIMIT 10
        `,
        [dailyPeriod.startDate, dailyPeriod.endDateExclusive],
      ),
      pool.query<{
        date: string;
        day: number;
        total_items: string | number | null;
        screen_items: string | number | null;
        total_orders: string | number | null;
        unique_customers: string | number | null;
      }>(
        `
          WITH active_catalog AS (
            SELECT DISTINCT isi.sku
            FROM inventory_snapshot_items isi
            JOIN inventory_snapshots inventory ON inventory.id = isi.snapshot_id
            WHERE inventory.is_active = TRUE
              AND NULLIF(BTRIM(isi.sku), '') IS NOT NULL
          ),
          selected_orders AS MATERIALIZED (
            SELECT id, customer_id, order_date::date AS order_date
            FROM orders
            WHERE order_date >= $1::date AND order_date < $2::date
          ),
          classified_order_items AS (
            SELECT
              oi.order_id,
              COALESCE(oi.quantity, 0)::numeric(14,2) AS quantity,
              CASE
                WHEN UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) ~ '(^|[^A-Z])(DOC|DOCK)[[:space:]]+DE[[:space:]]+CARGA([^A-Z]|$)' THEN 'DOCK'
                WHEN UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) ~ '(^|[^A-Z])(BAT|BATTERY|BATERIA|BATERIAS)([^A-Z]|$)' THEN 'BATTERY'
                WHEN active_catalog.sku IS NOT NULL
                  OR UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) ~ '(^|[^A-Z])(TELA|FRONTAL|DISPLAY|LCD|OLED|AMOLED|INCELL|ONCELL|TOUCH)([^A-Z]|$)'
                  THEN 'SCREEN'
                ELSE 'OTHER'
              END AS category
            FROM order_items oi
            JOIN selected_orders selected ON selected.id = oi.order_id
            LEFT JOIN active_catalog ON active_catalog.sku = oi.sku
          ),
          order_item_totals AS (
            SELECT
              order_id,
              COALESCE(SUM(quantity), 0)::numeric(14,2) AS total_items,
              COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN'), 0)::numeric(14,2) AS screen_items
            FROM classified_order_items
            GROUP BY order_id
          )
          SELECT
            o.order_date::text AS date,
            EXTRACT(DAY FROM o.order_date)::int AS day,
            COALESCE(SUM(oit.total_items), 0)::numeric(14,2) AS total_items,
            COALESCE(SUM(oit.screen_items), 0)::numeric(14,2) AS screen_items,
            COUNT(*)::int AS total_orders,
            COUNT(DISTINCT o.customer_id)::int AS unique_customers
          FROM selected_orders o
          LEFT JOIN order_item_totals oit ON oit.order_id = o.id
          GROUP BY o.order_date
          ORDER BY o.order_date
        `,
        [period.monthStart, period.monthEndExclusive],
      ),
      pool.query<{
        month: number;
        unique_customers: string | number | null;
      }>(
        `
          WITH months AS (
            SELECT generate_series(1, $3::int)::int AS month
          ),
          customer_counts AS (
            SELECT
              EXTRACT(MONTH FROM order_date)::int AS month,
              COUNT(DISTINCT customer_id)::int AS unique_customers
            FROM orders
            WHERE order_date >= $1::date AND order_date < $2::date
            GROUP BY EXTRACT(MONTH FROM order_date)
          )
          SELECT
            months.month,
            COALESCE(customer_counts.unique_customers, 0)::int AS unique_customers
          FROM months
          LEFT JOIN customer_counts ON customer_counts.month = months.month
          ORDER BY months.month
        `,
        [yearStart, period.monthEndExclusive, period.month],
      ),
      pool.query<{
        product_count: string | number | null;
        stock_pieces: string | number | null;
        updated_at: string | null;
      }>(`
        SELECT
          COUNT(*)::int AS product_count,
          COALESCE(SUM(items.stock_quantity), 0)::int AS stock_pieces,
          MAX(snapshots.imported_at)::text AS updated_at
        FROM inventory_snapshot_items items
        JOIN inventory_snapshots snapshots ON snapshots.id = items.snapshot_id
        WHERE snapshots.is_active = TRUE
      `),
      pool.query<{ last_sync_at: string | null }>(`
        SELECT MAX(finished_at)::text AS last_sync_at
        FROM (
          SELECT finished_at FROM import_runs WHERE status = 'COMPLETED'
          UNION ALL
          SELECT finished_at FROM sync_runs WHERE status = 'COMPLETED'
        ) sync_history
      `),
    ]);

  const summaryRow = summaryResult.rows[0];
  const inventoryRow = inventoryResult.rows[0];
  const monthlyTarget = Number(targetResult.rows[0]?.target_amount ?? 0);
  const monthlyBatteryTarget = Number(targetResult.rows[0]?.target_batteries ?? 0);
  const monthItems = Number(summaryRow?.month_items ?? 0);
  const monthScreenItems = Number(summaryRow?.month_screen_items ?? 0);
  const dailyTarget = monthlyTarget > 0 ? monthlyTarget / DAILY_TARGET_DIVISOR : 0;

  return {
    selection: {
      year: period.year,
      month: period.month,
      day: period.day,
      dailyDate: dailyPeriod.startDate,
      startDate: period.startDate,
      endDate: period.endDate,
    },
    availablePeriods: availabilityResult.rows.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      days: (row.days ?? []).map(Number),
    })),
    summary: {
      totalItems: Number(summaryRow?.total_items ?? 0),
      totalOrders: Number(summaryRow?.total_orders ?? 0),
      uniqueCustomers: Number(summaryRow?.unique_customers ?? 0),
      totalRevenue: Number(summaryRow?.total_revenue ?? 0),
      previousMonthItems: Number(summaryRow?.previous_month_items ?? 0),
      previousYearItems: Number(summaryRow?.previous_year_items ?? 0),
      previousMonthScreenItems: Number(summaryRow?.previous_month_screen_items ?? 0),
      previousYearScreenItems: Number(summaryRow?.previous_year_screen_items ?? 0),
      monthItems,
      monthScreenItems,
      monthBatteryItems: Number(summaryRow?.month_battery_items ?? 0),
      monthOrders: Number(summaryRow?.month_orders ?? 0),
      monthUniqueCustomers: Number(summaryRow?.month_unique_customers ?? 0),
      monthlyTarget,
      monthlyBatteryTarget,
      dailyTarget,
      targetProgress: monthlyTarget > 0 ? Math.min(monthScreenItems / monthlyTarget, 1) : 0,
      targetRemaining: Math.max(monthlyTarget - monthScreenItems, 0),
    },
    productBreakdown: {
      screenItems: Number(summaryRow?.total_screen_items ?? 0),
      screenXpItems: Number(summaryRow?.screen_xp_items ?? 0),
      screenVvItems: Number(summaryRow?.screen_vv_items ?? 0),
      screenDeItems: Number(summaryRow?.screen_de_items ?? 0),
      batteryItems: Number(summaryRow?.battery_items ?? 0),
      chargingDockItems: Number(summaryRow?.charging_dock_items ?? 0),
      otherItems: Number(summaryRow?.other_items ?? 0),
    },
    inventory: {
      productCount: Number(inventoryRow?.product_count ?? 0),
      stockPieces: Number(inventoryRow?.stock_pieces ?? 0),
      updatedAt: inventoryRow?.updated_at ? String(inventoryRow.updated_at) : null,
    },
    sellers: sellersResult.rows.map((row) => ({
      attendant: String(row.attendant ?? "Sem atendente"),
      profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
      totalOrders: Number(row.total_orders ?? 0),
      uniqueCustomers: Number(row.unique_customers ?? 0),
      totalRevenue: Number(row.total_revenue ?? 0),
      totalItems: Number(row.total_items ?? 0),
      screenItems: Number(row.screen_items ?? 0),
      batteryItems: Number(row.battery_items ?? 0),
      chargingDockItems: Number(row.charging_dock_items ?? 0),
    })),
    dailySeries: dailyResult.rows.map((row) => ({
      date: String(row.date),
      day: Number(row.day),
      totalItems: Number(row.total_items ?? 0),
      screenItems: Number(row.screen_items ?? 0),
      totalOrders: Number(row.total_orders ?? 0),
      uniqueCustomers: Number(row.unique_customers ?? 0),
    })),
    monthlyCustomers: fillExecutiveMonthlyCustomers(period.month, monthlyCustomersResult.rows),
    generatedAt: new Date().toISOString(),
    lastSyncAt: syncResult.rows[0]?.last_sync_at ? String(syncResult.rows[0].last_sync_at) : null,
    lastSaleDate: latestSaleDate ? String(latestSaleDate) : null,
  };
}

export async function getExecutiveDashboardMetrics(
  input: ExecutiveDashboardSelectionInput = {},
): Promise<ExecutiveDashboardMetrics> {
  const period = resolveExecutiveDashboardPeriod(input);
  const cacheKey = executiveDashboardCacheKey(period);
  const cached = executiveDashboardCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const activeRequest = executiveDashboardRequests.get(cacheKey);
  if (activeRequest) {
    return activeRequest;
  }

  const request = loadExecutiveDashboardMetrics(period)
    .then((value) => {
      executiveDashboardCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + EXECUTIVE_DASHBOARD_CACHE_TTL_MS,
      });
      return value;
    })
    .catch((error) => {
      if (cached) return cached.value;
      throw error;
    })
    .finally(() => {
      executiveDashboardRequests.delete(cacheKey);
    });

  executiveDashboardRequests.set(cacheKey, request);
  return request;
}

import type {
  AttendantGrowthRatios,
  AttendantListItem,
  AttendantMetricSnapshot,
  AttendantPortfolioSnapshot,
  AttendantSummary,
  AttendantTopCustomer,
  AttendantTrendPoint,
  AttendantsResponse,
  CustomerStatus,
  TopProduct,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";

export const FOCUSED_ATTENDANTS = ["Suelen", "Thais", "Amanda", "Lucas", "Tamires"] as const;
export type AttendantWindowMonths = 3 | 6 | 12 | 24;

export interface AttendantComparisonWindows {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  trendStartMonth: string;
  trendEndMonth: string;
}

interface RawMetricSnapshot {
  revenue: number;
  orders: number;
  pieces: number;
  uniqueCustomers: number;
  lastOrderAt: string | null;
}

interface AttendantAggregateRow {
  attendant: string;
  currentRevenue: number;
  currentOrders: number;
  currentPieces: number;
  currentUniqueCustomers: number;
  currentLastOrderAt: string | null;
  previousRevenue: number;
  previousOrders: number;
  previousPieces: number;
  previousUniqueCustomers: number;
  previousLastOrderAt: string | null;
}

interface SummaryRow {
  currentRevenue: number;
  currentOrders: number;
  currentPieces: number;
  currentUniqueCustomers: number;
  previousRevenue: number;
}

interface PortfolioRow {
  attendant: string;
  totalCustomers: number;
  activeCount: number;
  attentionCount: number;
  inactiveCount: number;
}

interface TrendRow {
  attendant: string;
  month: string;
  revenue: number;
  orders: number;
  pieces: number;
  uniqueCustomers: number;
}

const EMPTY_RAW_SNAPSHOT: RawMetricSnapshot = {
  revenue: 0,
  orders: 0,
  pieces: 0,
  uniqueCustomers: 0,
  lastOrderAt: null,
};

const EMPTY_PORTFOLIO: AttendantPortfolioSnapshot = {
  totalCustomers: 0,
  statusCounts: {
    ACTIVE: 0,
    ATTENTION: 0,
    INACTIVE: 0,
  },
};

function toUtcCalendarDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcMonths(value: Date, delta: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, value.getUTCDate()));
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function toSqlDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildAttendantComparisonWindows(referenceDate = new Date(), windowMonths: AttendantWindowMonths = 12): AttendantComparisonWindows {
  const today = toUtcCalendarDate(referenceDate);
  const currentPeriodStart = startOfUtcMonth(today);
  const previousPeriodStart = startOfUtcMonth(addUtcMonths(currentPeriodStart, -1));
  const previousPeriodLastDay = endOfUtcMonth(previousPeriodStart);
  const previousPeriodEndDay = Math.min(today.getUTCDate(), previousPeriodLastDay.getUTCDate());
  const previousPeriodEnd = new Date(
    Date.UTC(previousPeriodStart.getUTCFullYear(), previousPeriodStart.getUTCMonth(), previousPeriodEndDay),
  );
  const lastClosedMonth = addUtcMonths(currentPeriodStart, -1);
  const trendStartMonth = addUtcMonths(currentPeriodStart, -windowMonths);

  return {
    currentPeriodStart: toSqlDate(currentPeriodStart),
    currentPeriodEnd: toSqlDate(today),
    previousPeriodStart: toSqlDate(previousPeriodStart),
    previousPeriodEnd: toSqlDate(previousPeriodEnd),
    trendStartMonth: toSqlDate(trendStartMonth),
    trendEndMonth: toSqlDate(lastClosedMonth),
  };
}

export function buildGrowthRatio(currentValue: number, previousValue: number) {
  if (!Number.isFinite(previousValue) || previousValue <= 0) {
    return null;
  }

  return (currentValue - previousValue) / previousValue;
}

export function buildMetricSnapshot(snapshot: RawMetricSnapshot): AttendantMetricSnapshot {
  const avgTicket = snapshot.orders > 0 ? snapshot.revenue / snapshot.orders : 0;
  const piecesPerOrder = snapshot.orders > 0 ? snapshot.pieces / snapshot.orders : 0;
  const revenuePerCustomer = snapshot.uniqueCustomers > 0 ? snapshot.revenue / snapshot.uniqueCustomers : 0;

  return {
    revenue: snapshot.revenue,
    orders: snapshot.orders,
    pieces: snapshot.pieces,
    uniqueCustomers: snapshot.uniqueCustomers,
    avgTicket,
    piecesPerOrder,
    revenuePerCustomer,
    lastOrderAt: snapshot.lastOrderAt,
  };
}

export function buildGrowthRatios(
  currentPeriod: AttendantMetricSnapshot,
  previousPeriod: AttendantMetricSnapshot,
): AttendantGrowthRatios {
  return {
    revenue: buildGrowthRatio(currentPeriod.revenue, previousPeriod.revenue),
    orders: buildGrowthRatio(currentPeriod.orders, previousPeriod.orders),
    pieces: buildGrowthRatio(currentPeriod.pieces, previousPeriod.pieces),
    uniqueCustomers: buildGrowthRatio(currentPeriod.uniqueCustomers, previousPeriod.uniqueCustomers),
    avgTicket: buildGrowthRatio(currentPeriod.avgTicket, previousPeriod.avgTicket),
    piecesPerOrder: buildGrowthRatio(currentPeriod.piecesPerOrder, previousPeriod.piecesPerOrder),
    revenuePerCustomer: buildGrowthRatio(currentPeriod.revenuePerCustomer, previousPeriod.revenuePerCustomer),
  };
}

export function sortAttendants(items: AttendantListItem[]) {
  return [...items].sort((left, right) => {
    const revenueDiff = right.currentPeriod.revenue - left.currentPeriod.revenue;
    if (revenueDiff !== 0) {
      return revenueDiff;
    }

    const ordersDiff = right.currentPeriod.orders - left.currentPeriod.orders;
    if (ordersDiff !== 0) {
      return ordersDiff;
    }

    return left.attendant.localeCompare(right.attendant, "pt-BR");
  });
}

function mapTopProducts(value: unknown): TopProduct[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const product = entry as Record<string, unknown>;
      return {
        sku: product.sku ? String(product.sku) : null,
        itemDescription: String(product.itemDescription ?? ""),
        totalQuantity: Number(product.totalQuantity ?? 0),
        orderCount: Number(product.orderCount ?? 0),
        lastBoughtAt: product.lastBoughtAt ? String(product.lastBoughtAt) : null,
      } satisfies TopProduct;
    })
    .filter((entry): entry is TopProduct => Boolean(entry?.itemDescription));
}

function mapTopCustomers(value: unknown): AttendantTopCustomer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const customer = entry as Record<string, unknown>;
      return {
        customerId: String(customer.customerId ?? ""),
        customerCode: String(customer.customerCode ?? ""),
        displayName: String(customer.displayName ?? "Cliente sem nome"),
        revenue: Number(customer.revenue ?? 0),
        orders: Number(customer.orders ?? 0),
        pieces: Number(customer.pieces ?? 0),
        lastOrderAt: customer.lastOrderAt ? String(customer.lastOrderAt) : null,
        status: String(customer.status ?? "INACTIVE") as CustomerStatus,
        priorityScore: Number(customer.priorityScore ?? 0),
      } satisfies AttendantTopCustomer;
    })
    .filter((entry): entry is AttendantTopCustomer => Boolean(entry?.customerId));
}

async function listAttendantNames() {
  return [...FOCUSED_ATTENDANTS];
}

async function getSummaryRow(windows: AttendantComparisonWindows, attendants: readonly string[]): Promise<SummaryRow> {
  const result = await pool.query(
    `
      WITH order_item_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
        FROM order_items
        GROUP BY order_id
      )
      SELECT
        COALESCE(SUM(CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN o.total_amount ELSE 0 END), 0)::numeric(14,2) AS current_revenue,
        COUNT(*) FILTER (WHERE o.order_date BETWEEN $1::date AND $2::date)::int AS current_orders,
        COALESCE(
          SUM(CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN COALESCE(order_item_totals.pieces, 0) ELSE 0 END),
          0
        )::numeric(14,2) AS current_pieces,
        COUNT(DISTINCT CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN o.customer_id END)::int AS current_unique_customers,
        COALESCE(SUM(CASE WHEN o.order_date BETWEEN $3::date AND $4::date THEN o.total_amount ELSE 0 END), 0)::numeric(14,2) AS previous_revenue
      FROM orders o
      LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
      WHERE COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') = ANY($5::text[])
    `,
    [
      windows.currentPeriodStart,
      windows.currentPeriodEnd,
      windows.previousPeriodStart,
      windows.previousPeriodEnd,
      attendants,
    ],
  );

  const row = result.rows[0] ?? {};
  return {
    currentRevenue: Number(row.current_revenue ?? 0),
    currentOrders: Number(row.current_orders ?? 0),
    currentPieces: Number(row.current_pieces ?? 0),
    currentUniqueCustomers: Number(row.current_unique_customers ?? 0),
    previousRevenue: Number(row.previous_revenue ?? 0),
  };
}

async function getAttendantPerformanceRows(windows: AttendantComparisonWindows, attendants: readonly string[]): Promise<AttendantAggregateRow[]> {
  const result = await pool.query(
    `
      WITH order_item_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
        FROM order_items
        GROUP BY order_id
      )
      SELECT
        COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
        COALESCE(SUM(CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN o.total_amount ELSE 0 END), 0)::numeric(14,2) AS current_revenue,
        COUNT(*) FILTER (WHERE o.order_date BETWEEN $1::date AND $2::date)::int AS current_orders,
        COALESCE(
          SUM(CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN COALESCE(order_item_totals.pieces, 0) ELSE 0 END),
          0
        )::numeric(14,2) AS current_pieces,
        COUNT(DISTINCT CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN o.customer_id END)::int AS current_unique_customers,
        MAX(CASE WHEN o.order_date BETWEEN $1::date AND $2::date THEN o.order_date END)::text AS current_last_order_at,
        COALESCE(SUM(CASE WHEN o.order_date BETWEEN $3::date AND $4::date THEN o.total_amount ELSE 0 END), 0)::numeric(14,2) AS previous_revenue,
        COUNT(*) FILTER (WHERE o.order_date BETWEEN $3::date AND $4::date)::int AS previous_orders,
        COALESCE(
          SUM(CASE WHEN o.order_date BETWEEN $3::date AND $4::date THEN COALESCE(order_item_totals.pieces, 0) ELSE 0 END),
          0
        )::numeric(14,2) AS previous_pieces,
        COUNT(DISTINCT CASE WHEN o.order_date BETWEEN $3::date AND $4::date THEN o.customer_id END)::int AS previous_unique_customers,
        MAX(CASE WHEN o.order_date BETWEEN $3::date AND $4::date THEN o.order_date END)::text AS previous_last_order_at
      FROM orders o
      LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
      WHERE COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') = ANY($5::text[])
      GROUP BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente')
    `,
    [
      windows.currentPeriodStart,
      windows.currentPeriodEnd,
      windows.previousPeriodStart,
      windows.previousPeriodEnd,
      attendants,
    ],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant ?? "Sem atendente"),
    currentRevenue: Number(row.current_revenue ?? 0),
    currentOrders: Number(row.current_orders ?? 0),
    currentPieces: Number(row.current_pieces ?? 0),
    currentUniqueCustomers: Number(row.current_unique_customers ?? 0),
    currentLastOrderAt: row.current_last_order_at ? String(row.current_last_order_at) : null,
    previousRevenue: Number(row.previous_revenue ?? 0),
    previousOrders: Number(row.previous_orders ?? 0),
    previousPieces: Number(row.previous_pieces ?? 0),
    previousUniqueCustomers: Number(row.previous_unique_customers ?? 0),
    previousLastOrderAt: row.previous_last_order_at ? String(row.previous_last_order_at) : null,
  }));
}

async function getPortfolioRows(attendants: readonly string[]): Promise<PortfolioRow[]> {
  const result = await pool.query(
    `
      SELECT
        COALESCE(NULLIF(last_attendant, ''), 'Sem atendente') AS attendant,
        COUNT(*)::int AS total_customers,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_count,
        COUNT(*) FILTER (WHERE status = 'ATTENTION')::int AS attention_count,
        COUNT(*) FILTER (WHERE status = 'INACTIVE')::int AS inactive_count
      FROM customer_snapshot
      WHERE COALESCE(NULLIF(last_attendant, ''), 'Sem atendente') = ANY($1::text[])
      GROUP BY COALESCE(NULLIF(last_attendant, ''), 'Sem atendente')
    `,
    [attendants],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant ?? "Sem atendente"),
    totalCustomers: Number(row.total_customers ?? 0),
    activeCount: Number(row.active_count ?? 0),
    attentionCount: Number(row.attention_count ?? 0),
    inactiveCount: Number(row.inactive_count ?? 0),
  }));
}

async function getTrendRows(windows: AttendantComparisonWindows, attendants: readonly string[]): Promise<TrendRow[]> {
  const result = await pool.query(
    `
      WITH months AS (
        SELECT generate_series(
          $1::date,
          $2::date,
          interval '1 month'
        )::date AS month_start
      ),
      attendants AS (
        SELECT UNNEST($3::text[]) AS attendant
      ),
      order_item_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
        FROM order_items
        GROUP BY order_id
      ),
      monthly_totals AS (
        SELECT
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          date_trunc('month', o.order_date)::date AS month_start,
          COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS revenue,
          COUNT(*)::int AS orders,
          COALESCE(SUM(COALESCE(order_item_totals.pieces, 0)), 0)::numeric(14,2) AS pieces,
          COUNT(DISTINCT o.customer_id)::int AS unique_customers
        FROM orders o
        LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
        WHERE o.order_date >= $1::date
          AND o.order_date < ($2::date + interval '1 month')::date
          AND COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') = ANY($3::text[])
        GROUP BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente'), date_trunc('month', o.order_date)::date
      )
      SELECT
        attendants.attendant,
        to_char(months.month_start, 'YYYY-MM') AS month,
        COALESCE(monthly_totals.revenue, 0)::numeric(14,2) AS revenue,
        COALESCE(monthly_totals.orders, 0)::int AS orders,
        COALESCE(monthly_totals.pieces, 0)::numeric(14,2) AS pieces,
        COALESCE(monthly_totals.unique_customers, 0)::int AS unique_customers
      FROM attendants
      CROSS JOIN months
      LEFT JOIN monthly_totals
        ON monthly_totals.attendant = attendants.attendant
       AND monthly_totals.month_start = months.month_start
      ORDER BY attendants.attendant ASC, months.month_start ASC
    `,
    [windows.trendStartMonth, windows.trendEndMonth, attendants],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant ?? "Sem atendente"),
    month: String(row.month ?? ""),
    revenue: Number(row.revenue ?? 0),
    orders: Number(row.orders ?? 0),
    pieces: Number(row.pieces ?? 0),
    uniqueCustomers: Number(row.unique_customers ?? 0),
  }));
}

async function getTopCustomersByAttendant(windows: AttendantComparisonWindows, attendants: readonly string[]) {
  const result = await pool.query(
    `
      WITH order_item_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
        FROM order_items
        GROUP BY order_id
      ),
      ranked_customer_totals AS (
        SELECT
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          o.customer_id::text AS customer_id,
          COALESCE(MAX(cs.customer_code), MAX(o.customer_code), '') AS customer_code,
          COALESCE(MAX(cs.display_name), MAX(c.display_name), 'Cliente sem nome') AS display_name,
          COALESCE(MAX(cs.status), 'INACTIVE') AS status,
          COALESCE(MAX(cs.priority_score), 0)::numeric(10,2) AS priority_score,
          COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS revenue,
          COUNT(*)::int AS orders,
          COALESCE(SUM(COALESCE(order_item_totals.pieces, 0)), 0)::numeric(14,2) AS pieces,
          MAX(o.order_date)::text AS last_order_at,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente')
            ORDER BY
              COALESCE(SUM(o.total_amount), 0) DESC,
              COUNT(*) DESC,
              COALESCE(MAX(cs.display_name), MAX(c.display_name), 'Cliente sem nome') ASC
          ) AS rank
        FROM orders o
        LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
        LEFT JOIN customer_snapshot cs ON cs.customer_id = o.customer_id
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.order_date BETWEEN $1::date AND $2::date
          AND COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') = ANY($3::text[])
        GROUP BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente'), o.customer_id
      )
      SELECT
        attendant,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'customerId', customer_id,
              'customerCode', customer_code,
              'displayName', display_name,
              'revenue', revenue,
              'orders', orders,
              'pieces', pieces,
              'lastOrderAt', last_order_at,
              'status', status,
              'priorityScore', priority_score
            )
            ORDER BY revenue DESC, orders DESC, display_name ASC
          ),
          '[]'::jsonb
        ) AS top_customers
      FROM ranked_customer_totals
      WHERE rank <= 5
      GROUP BY attendant
    `,
    [windows.currentPeriodStart, windows.currentPeriodEnd, attendants],
  );

  return new Map<string, AttendantTopCustomer[]>(
    result.rows.map((row) => [String(row.attendant ?? "Sem atendente"), mapTopCustomers(row.top_customers)]),
  );
}

async function getTopProductsByAttendant(windows: AttendantComparisonWindows, attendants: readonly string[]) {
  const result = await pool.query(
    `
      WITH ranked_products AS (
        SELECT
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          MAX(NULLIF(oi.sku, '')) AS sku,
          MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descricao')) AS item_description,
          COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS total_quantity,
          COUNT(DISTINCT o.id)::int AS order_count,
          MAX(o.order_date)::text AS last_bought_at,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente')
            ORDER BY
              COALESCE(SUM(oi.quantity), 0) DESC,
              COUNT(DISTINCT o.id) DESC,
              MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descricao')) ASC
          ) AS rank
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.order_date BETWEEN $1::date AND $2::date
          AND COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') = ANY($3::text[])
        GROUP BY
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente'),
          COALESCE(
            NULLIF(oi.sku, ''),
            CONCAT('__desc__', COALESCE(NULLIF(oi.item_description, ''), 'sem-descricao'))
          )
      )
      SELECT
        attendant,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'sku', sku,
              'itemDescription', item_description,
              'totalQuantity', total_quantity,
              'orderCount', order_count,
              'lastBoughtAt', last_bought_at
            )
            ORDER BY total_quantity DESC, order_count DESC, item_description ASC
          ),
          '[]'::jsonb
        ) AS top_products
      FROM ranked_products
      WHERE rank <= 5
      GROUP BY attendant
    `,
    [windows.currentPeriodStart, windows.currentPeriodEnd, attendants],
  );

  return new Map<string, TopProduct[]>(
    result.rows.map((row) => [String(row.attendant ?? "Sem atendente"), mapTopProducts(row.top_products)]),
  );
}

export async function getAttendantsOverview(windowMonths: AttendantWindowMonths = 12, referenceDate = new Date()): Promise<AttendantsResponse> {
  const windows = buildAttendantComparisonWindows(referenceDate, windowMonths);
  const attendantNames = await listAttendantNames();

  const [summaryRow, performanceRows, portfolioRows, trendRows, topCustomersByAttendant, topProductsByAttendant] =
    await Promise.all([
      getSummaryRow(windows, attendantNames),
      getAttendantPerformanceRows(windows, attendantNames),
      getPortfolioRows(attendantNames),
      getTrendRows(windows, attendantNames),
      getTopCustomersByAttendant(windows, attendantNames),
      getTopProductsByAttendant(windows, attendantNames),
    ]);

  const performanceByAttendant = new Map<string, AttendantAggregateRow>(
    performanceRows.map((row) => [row.attendant, row]),
  );
  const portfolioByAttendant = new Map<string, AttendantPortfolioSnapshot>(
    portfolioRows.map((row) => [
      row.attendant,
      {
        totalCustomers: row.totalCustomers,
        statusCounts: {
          ACTIVE: row.activeCount,
          ATTENTION: row.attentionCount,
          INACTIVE: row.inactiveCount,
        },
      } satisfies AttendantPortfolioSnapshot,
    ]),
  );
  const trendByAttendant = new Map<string, AttendantTrendPoint[]>();

  trendRows.forEach((row) => {
    const current = trendByAttendant.get(row.attendant) ?? [];
    current.push({
      month: row.month,
      revenue: row.revenue,
      orders: row.orders,
      pieces: row.pieces,
      uniqueCustomers: row.uniqueCustomers,
    });
    trendByAttendant.set(row.attendant, current);
  });

  const attendants = sortAttendants(
    attendantNames.map((attendant) => {
      const performance = performanceByAttendant.get(attendant);
      const currentRaw: RawMetricSnapshot = performance
        ? {
            revenue: performance.currentRevenue,
            orders: performance.currentOrders,
            pieces: performance.currentPieces,
            uniqueCustomers: performance.currentUniqueCustomers,
            lastOrderAt: performance.currentLastOrderAt,
          }
        : EMPTY_RAW_SNAPSHOT;
      const previousRaw: RawMetricSnapshot = performance
        ? {
            revenue: performance.previousRevenue,
            orders: performance.previousOrders,
            pieces: performance.previousPieces,
            uniqueCustomers: performance.previousUniqueCustomers,
            lastOrderAt: performance.previousLastOrderAt,
          }
        : EMPTY_RAW_SNAPSHOT;
      const currentPeriod = buildMetricSnapshot(currentRaw);
      const previousPeriod = buildMetricSnapshot(previousRaw);

      return {
        attendant,
        currentPeriod,
        previousPeriod,
        growth: buildGrowthRatios(currentPeriod, previousPeriod),
        portfolio: portfolioByAttendant.get(attendant) ?? EMPTY_PORTFOLIO,
        monthlyTrend: trendByAttendant.get(attendant) ?? [],
        topCustomers: topCustomersByAttendant.get(attendant) ?? [],
        topProducts: topProductsByAttendant.get(attendant) ?? [],
      } satisfies AttendantListItem;
    }),
  );

  const summary: AttendantSummary = {
    totalAttendants: attendantNames.length,
    activeAttendants: attendants.filter((item) => item.currentPeriod.orders > 0).length,
    currentPeriodRevenue: summaryRow.currentRevenue,
    currentPeriodOrders: summaryRow.currentOrders,
    currentPeriodPieces: summaryRow.currentPieces,
    currentPeriodCustomers: summaryRow.currentUniqueCustomers,
    previousPeriodRevenue: summaryRow.previousRevenue,
    revenueGrowthRatio: buildGrowthRatio(summaryRow.currentRevenue, summaryRow.previousRevenue),
    currentPeriodStart: windows.currentPeriodStart,
    currentPeriodEnd: windows.currentPeriodEnd,
    previousPeriodStart: windows.previousPeriodStart,
    previousPeriodEnd: windows.previousPeriodEnd,
  };

  return {
    windowMonths,
    summary,
    attendants,
  };
}

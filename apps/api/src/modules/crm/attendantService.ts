import type {
  AttendantGrowthRatios,
  AttendantActivityHeatmapCell,
  AttendantActivitySnapshot,
  AttendantGoalSnapshot,
  AttendantListItem,
  AttendantLostCustomer,
  AttendantMetricSnapshot,
  AttendantPortfolioCustomer,
  AttendantPortfolioResponse,
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
  newCount: number;
}

interface TrendRow {
  attendant: string;
  month: string;
  revenue: number;
  orders: number;
  pieces: number;
  uniqueCustomers: number;
}

interface AttendantIdentityRow {
  attendant: string;
  instanceName: string | null;
  displayLabel: string | null;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
}

interface ActivityRow {
  attendant: string;
  month: string;
  sentMessages: number;
  receivedMessages: number;
  attendedConversations: number;
  activeDays: number;
  responseCount: number;
  responseSecondsTotal: number;
}

interface CustomerMovementRow {
  attendant: string;
  month: string;
  newCustomers: number;
  recoveredCustomers: number;
  recoveredRevenue: number;
}

interface CustomerLossRow {
  attendant: string;
  month: string;
  lostCustomers: number;
  customerDetails: AttendantLostCustomer[];
}

interface TargetRow {
  attendant: string;
  month: string;
  targetPieces: number | null;
  targetRevenue: number | null;
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
    NEW: 0,
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
  const trendStartMonth = addUtcMonths(currentPeriodStart, -(windowMonths - 1));

  return {
    currentPeriodStart: toSqlDate(currentPeriodStart),
    currentPeriodEnd: toSqlDate(today),
    previousPeriodStart: toSqlDate(previousPeriodStart),
    previousPeriodEnd: toSqlDate(previousPeriodEnd),
    trendStartMonth: toSqlDate(trendStartMonth),
    trendEndMonth: toSqlDate(currentPeriodStart),
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

async function listAttendantIdentities(): Promise<AttendantIdentityRow[]> {
  const result = await pool.query(
    `
      WITH focused_names AS (
        SELECT UNNEST($1::text[]) AS name
      ),
      candidates AS (
        SELECT
          focused.name AS attendant,
          wi.instance_name,
          wi.display_label,
          wi.phone_number,
          wi.profile_picture_url,
          wi.updated_at
        FROM whatsapp_instances wi
        LEFT JOIN LATERAL (
          SELECT name
          FROM focused_names
          WHERE LOWER(COALESCE(wi.assigned_user_name, wi.display_label, wi.instance_name, '')) LIKE '%' || LOWER(name) || '%'
             OR LOWER(COALESCE(wi.display_label, '')) LIKE '%' || LOWER(name) || '%'
             OR LOWER(COALESCE(wi.instance_name, '')) LIKE '%' || LOWER(name) || '%'
          ORDER BY LENGTH(name) DESC
          LIMIT 1
        ) focused ON true
        WHERE UPPER(COALESCE(wi.status, 'ACTIVE')) = 'ACTIVE'
          AND focused.name IS NOT NULL
      )
      SELECT DISTINCT ON (LOWER(attendant))
        attendant,
        instance_name,
        display_label,
        phone_number,
        profile_picture_url
      FROM candidates
      WHERE NULLIF(BTRIM(attendant), '') IS NOT NULL
      ORDER BY
        LOWER(attendant),
        (NULLIF(profile_picture_url, '') IS NOT NULL) DESC,
        updated_at DESC
    `,
    [[...FOCUSED_ATTENDANTS]],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant),
    instanceName: row.instance_name ? String(row.instance_name) : null,
    displayLabel: row.display_label ? String(row.display_label) : null,
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
  }));
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
        COUNT(*) FILTER (WHERE status = 'INACTIVE')::int AS inactive_count,
        COUNT(*) FILTER (WHERE status = 'NEW')::int AS new_count
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
    newCount: Number(row.new_count ?? 0),
  }));
}

export async function getAttendantPortfolio(
  attendant: string,
  windowMonths: AttendantWindowMonths = 12,
  referenceDate = new Date(),
): Promise<AttendantPortfolioResponse> {
  const windows = buildAttendantComparisonWindows(referenceDate, windowMonths);
  const identities = await listAttendantIdentities();
  const matchedAttendant = identities.find(
    (identity) => identity.attendant.toLocaleLowerCase("pt-BR") === attendant.trim().toLocaleLowerCase("pt-BR"),
  );

  if (!matchedAttendant) {
    return {
      attendant: attendant.trim(),
      windowMonths,
      periodStart: windows.trendStartMonth,
      periodEnd: windows.currentPeriodEnd,
      customers: [],
    };
  }

  const result = await pool.query(
    `
      WITH portfolio AS (
        SELECT
          cs.customer_id,
          COALESCE(cs.customer_code, '') AS customer_code,
          cs.display_name,
          cs.status,
          cs.last_purchase_at,
          cs.days_since_last_purchase,
          cs.total_orders,
          cs.total_spent,
          cs.priority_score
        FROM customer_snapshot cs
        WHERE LOWER(COALESCE(NULLIF(cs.last_attendant, ''), 'Sem atendente')) = LOWER($1)
      ),
      order_item_totals AS (
        SELECT
          order_id,
          COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
        FROM order_items
        GROUP BY order_id
      ),
      period_sales AS (
        SELECT
          o.customer_id,
          COUNT(*)::int AS period_orders,
          COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS period_revenue,
          COALESCE(SUM(COALESCE(order_item_totals.pieces, 0)), 0)::numeric(14,2) AS period_pieces,
          MAX(o.order_date)::text AS last_order_at
        FROM orders o
        LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
        WHERE o.customer_id IN (SELECT customer_id FROM portfolio)
          AND o.order_date BETWEEN $2::date AND $3::date
        GROUP BY o.customer_id
      )
      SELECT
        portfolio.customer_id::text AS customer_id,
        portfolio.customer_code,
        portfolio.display_name,
        portfolio.status,
        COALESCE(period_sales.period_pieces, 0)::numeric(14,2) AS period_pieces,
        COALESCE(period_sales.period_orders, 0)::int AS period_orders,
        COALESCE(period_sales.period_revenue, 0)::numeric(14,2) AS period_revenue,
        COALESCE(period_sales.last_order_at, portfolio.last_purchase_at::text) AS last_order_at,
        portfolio.days_since_last_purchase,
        portfolio.total_orders,
        portfolio.total_spent,
        portfolio.priority_score
      FROM portfolio
      LEFT JOIN period_sales ON period_sales.customer_id = portfolio.customer_id
      ORDER BY
        CASE portfolio.status
          WHEN 'ATTENTION' THEN 1
          WHEN 'INACTIVE' THEN 2
          WHEN 'ACTIVE' THEN 3
          WHEN 'NEW' THEN 4
          ELSE 5
        END,
        COALESCE(period_sales.period_pieces, 0) DESC,
        portfolio.priority_score DESC,
        portfolio.display_name ASC
    `,
    [matchedAttendant.attendant, windows.trendStartMonth, windows.currentPeriodEnd],
  );

  const customers: AttendantPortfolioCustomer[] = result.rows.map((row) => ({
    customerId: String(row.customer_id),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name ?? "Cliente sem nome"),
    status: String(row.status ?? "INACTIVE") as CustomerStatus,
    periodPieces: Number(row.period_pieces ?? 0),
    periodOrders: Number(row.period_orders ?? 0),
    periodRevenue: Number(row.period_revenue ?? 0),
    lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
    daysSinceLastPurchase:
      row.days_since_last_purchase === null ? null : Number(row.days_since_last_purchase),
    totalOrders: Number(row.total_orders ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    priorityScore: Number(row.priority_score ?? 0),
  }));

  return {
    attendant: matchedAttendant.attendant,
    windowMonths,
    periodStart: windows.trendStartMonth,
    periodEnd: windows.currentPeriodEnd,
    customers,
  };
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

async function getActivityRows(
  windows: AttendantComparisonWindows,
  identities: readonly AttendantIdentityRow[],
): Promise<ActivityRow[]> {
  const result = await pool.query(
    `
      WITH identities AS (
        SELECT *
        FROM UNNEST($3::text[], $4::text[]) AS identity(attendant, instance_name)
      ),
      scoped_activity AS (
        SELECT
          identity.attendant,
          TO_CHAR(DATE_TRUNC('month', war.period_date), 'YYYY-MM') AS month,
          war.period_date,
          war.remote_jid,
          war.sent_messages,
          war.received_messages,
          war.response_count,
          war.response_seconds_total
        FROM identities identity
        JOIN whatsapp_activity_rollups war
          ON LOWER(war.instance_name) = LOWER(identity.instance_name)
        WHERE war.period_date BETWEEN $1::date AND $2::date
      ),
      conversation_months AS (
        SELECT
          attendant,
          month,
          remote_jid,
          SUM(sent_messages)::int AS sent_messages,
          SUM(received_messages)::int AS received_messages
        FROM scoped_activity
        GROUP BY attendant, month, remote_jid
      ),
      activity_months AS (
        SELECT
          attendant,
          month,
          COUNT(DISTINCT period_date) FILTER (
            WHERE sent_messages > 0 OR received_messages > 0
          )::int AS active_days,
          SUM(response_count)::int AS response_count,
          SUM(response_seconds_total)::numeric AS response_seconds_total
        FROM scoped_activity
        GROUP BY attendant, month
      )
      SELECT
        conversation_months.attendant,
        conversation_months.month,
        COALESCE(SUM(conversation_months.sent_messages), 0)::int AS sent_messages,
        COALESCE(SUM(conversation_months.received_messages), 0)::int AS received_messages,
        COUNT(*) FILTER (
          WHERE conversation_months.sent_messages > 0 AND conversation_months.received_messages > 0
        )::int AS attended_conversations,
        activity_months.active_days,
        activity_months.response_count,
        activity_months.response_seconds_total
      FROM conversation_months
      JOIN activity_months USING (attendant, month)
      GROUP BY
        conversation_months.attendant,
        conversation_months.month,
        activity_months.active_days,
        activity_months.response_count,
        activity_months.response_seconds_total
      ORDER BY conversation_months.attendant, conversation_months.month
    `,
    [
      windows.trendStartMonth,
      windows.currentPeriodEnd,
      identities.map((item) => item.attendant),
      identities.map((item) => item.instanceName ?? ""),
    ],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant),
    month: String(row.month),
    sentMessages: Number(row.sent_messages ?? 0),
    receivedMessages: Number(row.received_messages ?? 0),
    attendedConversations: Number(row.attended_conversations ?? 0),
    activeDays: Number(row.active_days ?? 0),
    responseCount: Number(row.response_count ?? 0),
    responseSecondsTotal: Number(row.response_seconds_total ?? 0),
  }));
}

async function getCustomerMovementRows(
  windows: AttendantComparisonWindows,
  attendants: readonly string[],
): Promise<CustomerMovementRow[]> {
  const result = await pool.query(
    `
      WITH scoped_orders AS (
        SELECT
          o.id,
          o.customer_id,
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          o.order_date::date AS order_date,
          COALESCE(o.total_amount, 0)::numeric(14,2) AS total_amount,
          ROW_NUMBER() OVER (
            PARTITION BY o.customer_id
            ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
          ) AS lifetime_rank,
          LAG(o.order_date::date) OVER (
            PARTITION BY o.customer_id
            ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
          ) AS previous_order_date
        FROM orders o
        WHERE COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') = ANY($3::text[])
      ),
      monthly_reactivations AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id, DATE_TRUNC('month', order_date)
            ORDER BY order_date ASC, id ASC
          ) AS month_rank
        FROM scoped_orders
        WHERE previous_order_date IS NOT NULL
          AND (order_date - previous_order_date) >= 90
      ),
      movements AS (
        SELECT
          attendant,
          TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS month,
          COUNT(*) FILTER (WHERE lifetime_rank = 1)::int AS new_customers,
          0::int AS recovered_customers,
          0::numeric(14,2) AS recovered_revenue
        FROM scoped_orders
        WHERE order_date BETWEEN $1::date AND $2::date
        GROUP BY attendant, DATE_TRUNC('month', order_date)

        UNION ALL

        SELECT
          attendant,
          TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS month,
          0::int AS new_customers,
          COUNT(*)::int AS recovered_customers,
          COALESCE(SUM(total_amount), 0)::numeric(14,2) AS recovered_revenue
        FROM monthly_reactivations
        WHERE month_rank = 1
          AND order_date BETWEEN $1::date AND $2::date
        GROUP BY attendant, DATE_TRUNC('month', order_date)
      )
      SELECT
        attendant,
        month,
        SUM(new_customers)::int AS new_customers,
        SUM(recovered_customers)::int AS recovered_customers,
        SUM(recovered_revenue)::numeric(14,2) AS recovered_revenue
      FROM movements
      GROUP BY attendant, month
      ORDER BY attendant, month
    `,
    [windows.trendStartMonth, windows.currentPeriodEnd, attendants],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant),
    month: String(row.month),
    newCustomers: Number(row.new_customers ?? 0),
    recoveredCustomers: Number(row.recovered_customers ?? 0),
    recoveredRevenue: Number(row.recovered_revenue ?? 0),
  }));
}

async function getCustomerLossRows(
  windows: AttendantComparisonWindows,
  attendants: readonly string[],
): Promise<CustomerLossRow[]> {
  const result = await pool.query(
    `
      WITH lifetime_orders AS (
        SELECT
          o.id,
          o.customer_id,
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          o.order_date::date AS order_date,
          LEAD(o.order_date::date) OVER (
            PARTITION BY o.customer_id
            ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
          ) AS next_order_date
        FROM orders o
        WHERE o.order_date BETWEEN ($1::date - 90) AND $2::date
      ),
      loss_events AS (
        SELECT
          attendant,
          customer_id,
          order_date,
          (order_date + 90) AS lost_at
        FROM lifetime_orders
        WHERE attendant = ANY($3::text[])
          AND (next_order_date IS NULL OR next_order_date >= (order_date + 90))
          AND (order_date + 90) BETWEEN $1::date AND $2::date
      ),
      loss_details AS (
        SELECT
          loss.attendant,
          loss.customer_id,
          loss.lost_at,
          DATE_TRUNC('month', loss.order_date)::date AS last_purchase_month,
          COALESCE(MAX(cs.display_name), MAX(c.display_name), 'Cliente sem nome') AS display_name,
          COALESCE(SUM(COALESCE(oi.quantity, 0)), 0)::numeric(14,2) AS pieces
        FROM loss_events loss
        JOIN orders purchase_order
          ON purchase_order.customer_id = loss.customer_id
         AND DATE_TRUNC('month', purchase_order.order_date) = DATE_TRUNC('month', loss.order_date)
        LEFT JOIN order_items oi ON oi.order_id = purchase_order.id
        LEFT JOIN customer_snapshot cs ON cs.customer_id = loss.customer_id
        LEFT JOIN customers c ON c.id = loss.customer_id
        GROUP BY loss.attendant, loss.customer_id, loss.lost_at, DATE_TRUNC('month', loss.order_date)
      )
      SELECT
        attendant,
        TO_CHAR(DATE_TRUNC('month', lost_at), 'YYYY-MM') AS month,
        COUNT(DISTINCT customer_id)::int AS lost_customers,
        jsonb_agg(
          jsonb_build_object(
            'customerId', customer_id::text,
            'displayName', display_name,
            'lastPurchaseMonth', TO_CHAR(last_purchase_month, 'YYYY-MM'),
            'piecesInLastPurchaseMonth', pieces
          )
          ORDER BY pieces DESC, display_name ASC
        ) AS customer_details
      FROM loss_details
      GROUP BY attendant, DATE_TRUNC('month', lost_at)
      ORDER BY attendant, month
    `,
    [windows.trendStartMonth, windows.currentPeriodEnd, attendants],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant),
    month: String(row.month),
    lostCustomers: Number(row.lost_customers ?? 0),
    customerDetails: (Array.isArray(row.customer_details) ? row.customer_details : []).map((customer: Record<string, unknown>) => ({
      customerId: String(customer.customerId ?? ""),
      displayName: String(customer.displayName ?? "Cliente sem nome"),
      lastPurchaseMonth: String(customer.lastPurchaseMonth ?? ""),
      piecesInLastPurchaseMonth: Number(customer.piecesInLastPurchaseMonth ?? 0),
    })),
  }));
}

async function getTargetRows(windows: AttendantComparisonWindows, attendants: readonly string[]): Promise<TargetRow[]> {
  const result = await pool.query(
    `
      SELECT
        matched.attendant,
        TO_CHAR(MAKE_DATE(mt.year, mt.month, 1), 'YYYY-MM') AS month,
        mt.target_amount,
        mt.target_revenue
      FROM monthly_targets mt
      JOIN LATERAL (
        SELECT attendant
        FROM UNNEST($3::text[]) AS attendant
        WHERE LOWER(attendant) = LOWER(mt.attendant)
        LIMIT 1
      ) matched ON true
      WHERE MAKE_DATE(mt.year, mt.month, 1) BETWEEN $1::date AND DATE_TRUNC('month', $2::date)::date
      ORDER BY matched.attendant, mt.year, mt.month
    `,
    [windows.trendStartMonth, windows.currentPeriodEnd, attendants],
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant),
    month: String(row.month),
    targetPieces: row.target_amount === null ? null : Number(row.target_amount),
    targetRevenue: row.target_revenue === null ? null : Number(row.target_revenue),
  }));
}

async function getActivityHeatmap(
  windows: AttendantComparisonWindows,
  identities: readonly AttendantIdentityRow[],
): Promise<Map<string, AttendantActivityHeatmapCell[]>> {
  const result = await pool.query(
    `
      WITH identities AS (
        SELECT *
        FROM UNNEST($3::text[], $4::text[]) AS identity(attendant, instance_name)
      )
      SELECT
        identity.attendant,
        war.period_date::text AS date,
        war.hour::int AS hour,
        COALESCE(SUM(war.sent_messages), 0)::int AS sent_messages,
        COALESCE(SUM(war.received_messages), 0)::int AS received_messages
      FROM identities identity
      JOIN whatsapp_activity_rollups war
        ON LOWER(war.instance_name) = LOWER(identity.instance_name)
      WHERE war.period_date BETWEEN $1::date AND $2::date
      GROUP BY identity.attendant, war.period_date, war.hour
      ORDER BY identity.attendant, war.period_date, war.hour
    `,
    [
      windows.currentPeriodStart,
      windows.currentPeriodEnd,
      identities.map((item) => item.attendant),
      identities.map((item) => item.instanceName ?? ""),
    ],
  );

  const heatmap = new Map<string, AttendantActivityHeatmapCell[]>();
  result.rows.forEach((row) => {
    const attendant = String(row.attendant);
    const cells = heatmap.get(attendant) ?? [];
    cells.push({
      date: String(row.date),
      hour: Number(row.hour),
      sentMessages: Number(row.sent_messages ?? 0),
      receivedMessages: Number(row.received_messages ?? 0),
    });
    heatmap.set(attendant, cells);
  });
  return heatmap;
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
  const attendantIdentities = await listAttendantIdentities();
  const attendantNames = attendantIdentities.map((item) => item.attendant);

  const [
    summaryRow,
    performanceRows,
    portfolioRows,
    trendRows,
    activityRows,
    customerMovementRows,
    customerLossRows,
    targetRows,
    activityHeatmapByAttendant,
    topCustomersByAttendant,
    topProductsByAttendant,
  ] =
    await Promise.all([
      getSummaryRow(windows, attendantNames),
      getAttendantPerformanceRows(windows, attendantNames),
      getPortfolioRows(attendantNames),
      getTrendRows(windows, attendantNames),
      getActivityRows(windows, attendantIdentities),
      getCustomerMovementRows(windows, attendantNames),
      getCustomerLossRows(windows, attendantNames),
      getTargetRows(windows, [...attendantNames, "TOTAL"]),
      getActivityHeatmap(windows, attendantIdentities),
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
          NEW: row.newCount,
        },
      } satisfies AttendantPortfolioSnapshot,
    ]),
  );
  const trendByAttendant = new Map<string, AttendantTrendPoint[]>();
  const identityByAttendant = new Map(attendantIdentities.map((item) => [item.attendant, item]));
  const activityByAttendantMonth = new Map(
    activityRows.map((row) => [`${row.attendant}\u0000${row.month}`, row] as const),
  );
  const movementByAttendantMonth = new Map(
    customerMovementRows.map((row) => [`${row.attendant}\u0000${row.month}`, row] as const),
  );
  const lossByAttendantMonth = new Map(
    customerLossRows.map((row) => [`${row.attendant}\u0000${row.month}`, row] as const),
  );
  const targetByAttendantMonth = new Map(
    targetRows.map((row) => [`${row.attendant}\u0000${row.month}`, row] as const),
  );
  const teamGoals = targetRows
    .filter((row) => row.attendant.toLocaleLowerCase("pt-BR") === "total")
    .map((row) => ({
      month: row.month,
      targetPieces: row.targetPieces,
      targetRevenue: row.targetRevenue,
    }));

  trendRows.forEach((row) => {
    const current = trendByAttendant.get(row.attendant) ?? [];
    const activity = activityByAttendantMonth.get(`${row.attendant}\u0000${row.month}`);
    const movement = movementByAttendantMonth.get(`${row.attendant}\u0000${row.month}`);
    const loss = lossByAttendantMonth.get(`${row.attendant}\u0000${row.month}`);
    const target = targetByAttendantMonth.get(`${row.attendant}\u0000${row.month}`);
    current.push({
      month: row.month,
      revenue: row.revenue,
      orders: row.orders,
      pieces: row.pieces,
      uniqueCustomers: row.uniqueCustomers,
      newCustomers: movement?.newCustomers ?? 0,
      recoveredCustomers: movement?.recoveredCustomers ?? 0,
      lostCustomers: loss?.lostCustomers ?? 0,
      lostCustomerDetails: loss?.customerDetails ?? [],
      sentMessages: activity?.sentMessages ?? 0,
      receivedMessages: activity?.receivedMessages ?? 0,
      attendedConversations: activity?.attendedConversations ?? 0,
      targetPieces: target?.targetPieces ?? null,
      targetRevenue: target?.targetRevenue ?? null,
    });
    trendByAttendant.set(row.attendant, current);
  });

  const currentMonth = windows.currentPeriodStart.slice(0, 7);
  const attendants = sortAttendants(
    attendantNames.map((attendant) => {
      const identity = identityByAttendant.get(attendant);
      const performance = performanceByAttendant.get(attendant);
      const currentActivityRow = activityByAttendantMonth.get(`${attendant}\u0000${currentMonth}`);
      const currentMovement = movementByAttendantMonth.get(`${attendant}\u0000${currentMonth}`);
      const currentLoss = lossByAttendantMonth.get(`${attendant}\u0000${currentMonth}`);
      const currentTarget = targetByAttendantMonth.get(`${attendant}\u0000${currentMonth}`);
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
      const currentActivity: AttendantActivitySnapshot = {
        sentMessages: currentActivityRow?.sentMessages ?? 0,
        receivedMessages: currentActivityRow?.receivedMessages ?? 0,
        attendedConversations: currentActivityRow?.attendedConversations ?? 0,
        activeDays: currentActivityRow?.activeDays ?? 0,
        averageFirstResponseSeconds:
          currentActivityRow && currentActivityRow.responseCount > 0
            ? currentActivityRow.responseSecondsTotal / currentActivityRow.responseCount
            : null,
      };
      const goal: AttendantGoalSnapshot = {
        targetPieces: currentTarget?.targetPieces ?? null,
        targetRevenue: currentTarget?.targetRevenue ?? null,
        piecesProgressRatio:
          currentTarget?.targetPieces && currentTarget.targetPieces > 0
            ? currentPeriod.pieces / currentTarget.targetPieces
            : null,
        revenueProgressRatio:
          currentTarget?.targetRevenue && currentTarget.targetRevenue > 0
            ? currentPeriod.revenue / currentTarget.targetRevenue
            : null,
      };

      return {
        attendant,
        whatsapp: {
          instanceName: identity?.instanceName ?? null,
          displayLabel: identity?.displayLabel ?? null,
          phoneNumber: identity?.phoneNumber ?? null,
          profilePictureUrl: identity?.profilePictureUrl ?? null,
        },
        currentPeriod,
        previousPeriod,
        growth: buildGrowthRatios(currentPeriod, previousPeriod),
        portfolio: portfolioByAttendant.get(attendant) ?? EMPTY_PORTFOLIO,
        currentActivity,
        currentNewCustomers: currentMovement?.newCustomers ?? 0,
        currentRecoveredCustomers: currentMovement?.recoveredCustomers ?? 0,
        currentLostCustomers: currentLoss?.lostCustomers ?? 0,
        currentRecoveredRevenue: currentMovement?.recoveredRevenue ?? 0,
        goal,
        activityHeatmap: activityHeatmapByAttendant.get(attendant) ?? [],
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
    teamGoals,
    attendants,
  };
}

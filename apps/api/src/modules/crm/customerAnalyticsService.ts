import type {
  CustomerAnalyticsResponse,
  CustomerAnalyticsTimelinePoint,
  CustomerCreditOperationalState,
  CustomerCreditRiskLevel,
  CustomerLabel,
  CustomerStatus,
  InsightTag,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";

type SalesTimelineInput = Pick<CustomerAnalyticsTimelinePoint, "month" | "salesAmount" | "orderCount" | "pieces">;
type PaymentTimelineInput = Pick<CustomerAnalyticsTimelinePoint, "month" | "paymentAmount" | "paymentCount">;

function mapInsightTags(value: unknown): InsightTag[] {
  return Array.isArray(value) ? value.map((entry) => String(entry) as InsightTag) : [];
}

function mapCustomerLabels(value: unknown): CustomerLabel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const label = entry as Record<string, unknown>;
    if (!label.id || !label.name) return [];
    return [{
      id: String(label.id),
      name: String(label.name),
      color: String(label.color ?? "#2956d7"),
    }];
  });
}

export function mergeCustomerAnalyticsTimeline(
  sales: SalesTimelineInput[],
  payments: PaymentTimelineInput[],
): CustomerAnalyticsTimelinePoint[] {
  const byMonth = new Map<string, CustomerAnalyticsTimelinePoint>();

  for (const point of sales) {
    byMonth.set(point.month, {
      month: point.month,
      salesAmount: point.salesAmount,
      orderCount: point.orderCount,
      pieces: point.pieces,
      paymentAmount: 0,
      paymentCount: 0,
    });
  }

  for (const point of payments) {
    const current = byMonth.get(point.month) ?? {
      month: point.month,
      salesAmount: 0,
      orderCount: 0,
      pieces: 0,
      paymentAmount: 0,
      paymentCount: 0,
    };
    current.paymentAmount = point.paymentAmount;
    current.paymentCount = point.paymentCount;
    byMonth.set(point.month, current);
  }

  const populatedMonths = Array.from(byMonth.keys()).sort();
  if (!populatedMonths.length) return [];

  const firstMonth = populatedMonths[0]!;
  const lastMonth = populatedMonths[populatedMonths.length - 1]!;
  const startYear = Number(firstMonth.slice(0, 4));
  const startMonth = Number(firstMonth.slice(5, 7));
  const endYear = Number(lastMonth.slice(0, 4));
  const endMonth = Number(lastMonth.slice(5, 7));
  const timeline: CustomerAnalyticsTimelinePoint[] = [];

  for (
    let cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
    cursor <= new Date(Date.UTC(endYear, endMonth - 1, 1));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    timeline.push(byMonth.get(month) ?? {
      month,
      salesAmount: 0,
      orderCount: 0,
      pieces: 0,
      paymentAmount: 0,
      paymentCount: 0,
    });
  }

  return timeline;
}

export async function getCustomerAnalytics(customerId: string): Promise<CustomerAnalyticsResponse | null> {
  const activeSnapshotSql = `
    SELECT id
    FROM customer_credit_snapshots
    WHERE is_active = TRUE
    ORDER BY imported_at DESC
    LIMIT 1
  `;

  const [
    customerResult,
    salesResult,
    monthlySalesResult,
    sellersResult,
    productsResult,
    creditResult,
    paymentSummaryResult,
    monthlyPaymentsResult,
    paymentTypesResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT
          c.id,
          c.customer_code,
          COALESCE(NULLIF(s.display_name, ''), c.display_name) AS display_name,
          c.phone,
          c.email,
          c.created_at::text AS customer_since,
          s.state,
          s.city,
          s.last_attendant,
          COALESCE(s.status, 'INACTIVE') AS status,
          s.last_purchase_at::date::text AS last_purchase_at,
          s.days_since_last_purchase,
          s.avg_days_between_orders,
          s.purchase_frequency_90d,
          s.frequency_drop_ratio,
          s.predicted_next_purchase_at::date::text AS predicted_next_purchase_at,
          s.priority_score,
          s.value_score,
          s.primary_insight,
          s.insight_tags,
          c.internal_notes,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
              ORDER BY cl.name
            )
            FROM customer_label_assignments cla
            JOIN customer_labels cl ON cl.id = cla.label_id
            WHERE cla.customer_id = c.id
          ), '[]'::jsonb) AS labels
        FROM customers c
        LEFT JOIN customer_snapshot s ON s.customer_id = c.id
        WHERE c.id = $1
        LIMIT 1
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH order_pieces AS (
          SELECT order_id, COALESCE(SUM(quantity), 0) AS pieces
          FROM order_items
          GROUP BY order_id
        )
        SELECT
          COALESCE(SUM(o.total_amount), 0) AS total_amount,
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(order_pieces.pieces), 0) AS total_pieces,
          COALESCE(AVG(o.total_amount), 0) AS average_ticket,
          MIN(o.order_date)::text AS first_order_date,
          MAX(o.order_date)::text AS last_order_date
        FROM orders o
        LEFT JOIN order_pieces ON order_pieces.order_id = o.id
        WHERE o.customer_id = $1
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH order_pieces AS (
          SELECT order_id, COALESCE(SUM(quantity), 0) AS pieces
          FROM order_items
          GROUP BY order_id
        )
        SELECT
          to_char(date_trunc('month', o.order_date), 'YYYY-MM') AS month,
          COALESCE(SUM(o.total_amount), 0) AS sales_amount,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(order_pieces.pieces), 0) AS pieces
        FROM orders o
        LEFT JOIN order_pieces ON order_pieces.order_id = o.id
        WHERE o.customer_id = $1
        GROUP BY date_trunc('month', o.order_date)
        ORDER BY date_trunc('month', o.order_date)
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH order_pieces AS (
          SELECT order_id, COALESCE(SUM(quantity), 0) AS pieces
          FROM order_items
          GROUP BY order_id
        )
        SELECT
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem vendedora') AS seller,
          COALESCE(SUM(o.total_amount), 0) AS sales_amount,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(order_pieces.pieces), 0) AS pieces
        FROM orders o
        LEFT JOIN order_pieces ON order_pieces.order_id = o.id
        WHERE o.customer_id = $1
        GROUP BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem vendedora')
        ORDER BY sales_amount DESC, order_count DESC
      `,
      [customerId],
    ),
    pool.query(
      `
        SELECT
          MAX(NULLIF(oi.sku, '')) AS sku,
          MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descrição')) AS item_description,
          COALESCE(SUM(oi.quantity), 0) AS quantity,
          COALESCE(SUM(oi.line_total), 0) AS sales_amount,
          COUNT(DISTINCT o.id)::int AS order_count,
          MAX(o.order_date)::text AS last_order_date
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id = $1
        GROUP BY COALESCE(NULLIF(oi.sku, ''), CONCAT('__desc__', oi.item_description))
        ORDER BY quantity DESC, sales_amount DESC
        LIMIT 10
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH active_snapshot AS (${activeSnapshotSql})
        SELECT
          snapshot_row.balance_amount,
          COALESCE(override.credit_limit, snapshot_row.credit_limit) AS credit_limit,
          COALESCE(override.payment_term, snapshot_row.payment_term) AS payment_term,
          snapshot_row.risk_level,
          snapshot_row.operational_state,
          snapshot_row.flags,
          snapshot_row.observation,
          snapshot.imported_at::text AS snapshot_updated_at
        FROM active_snapshot active
        JOIN customer_credit_snapshots snapshot ON snapshot.id = active.id
        JOIN customer_credit_snapshot_rows snapshot_row
          ON snapshot_row.snapshot_id = active.id AND snapshot_row.customer_id = $1
        LEFT JOIN customer_credit_overrides override ON override.customer_id = snapshot_row.customer_id
        LIMIT 1
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH active_snapshot AS (${activeSnapshotSql})
        SELECT
          COALESCE(SUM(payment.amount), 0) AS total_amount,
          COUNT(*)::int AS total_payments,
          COALESCE(AVG(payment.amount), 0) AS average_payment,
          MIN(payment.payment_date)::text AS first_payment_date,
          MAX(payment.payment_date)::text AS last_payment_date
        FROM active_snapshot active
        JOIN customer_credit_payment_entries payment ON payment.snapshot_id = active.id
        WHERE payment.customer_id = $1
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH active_snapshot AS (${activeSnapshotSql})
        SELECT
          to_char(date_trunc('month', payment.payment_date), 'YYYY-MM') AS month,
          COALESCE(SUM(payment.amount), 0) AS payment_amount,
          COUNT(*)::int AS payment_count
        FROM active_snapshot active
        JOIN customer_credit_payment_entries payment ON payment.snapshot_id = active.id
        WHERE payment.customer_id = $1 AND payment.payment_date IS NOT NULL
        GROUP BY date_trunc('month', payment.payment_date)
        ORDER BY date_trunc('month', payment.payment_date)
      `,
      [customerId],
    ),
    pool.query(
      `
        WITH active_snapshot AS (${activeSnapshotSql})
        SELECT
          COALESCE(NULLIF(payment.payment_type, ''), 'Não informado') AS payment_type,
          COALESCE(SUM(payment.amount), 0) AS amount,
          COUNT(*)::int AS count
        FROM active_snapshot active
        JOIN customer_credit_payment_entries payment ON payment.snapshot_id = active.id
        WHERE payment.customer_id = $1
        GROUP BY COALESCE(NULLIF(payment.payment_type, ''), 'Não informado')
        ORDER BY amount DESC, count DESC
      `,
      [customerId],
    ),
  ]);

  const customer = customerResult.rows[0];
  if (!customer) return null;

  const sales = salesResult.rows[0] ?? {};
  const paymentSummary = paymentSummaryResult.rows[0] ?? {};
  const credit = creditResult.rows[0];
  const balanceAmount = Number(credit?.balance_amount ?? 0);
  const creditLimit = Number(credit?.credit_limit ?? 0);
  const debtAmount = balanceAmount < 0 ? Math.abs(balanceAmount) : 0;
  const creditBalanceAmount = balanceAmount > 0 ? balanceAmount : 0;

  const monthlySales = monthlySalesResult.rows.map((row) => ({
    month: String(row.month),
    salesAmount: Number(row.sales_amount ?? 0),
    orderCount: Number(row.order_count ?? 0),
    pieces: Number(row.pieces ?? 0),
  }));
  const monthlyPayments = monthlyPaymentsResult.rows.map((row) => ({
    month: String(row.month),
    paymentAmount: Number(row.payment_amount ?? 0),
    paymentCount: Number(row.payment_count ?? 0),
  }));

  return {
    customer: {
      id: String(customer.id),
      customerCode: String(customer.customer_code ?? ""),
      displayName: String(customer.display_name ?? ""),
      phone: customer.phone ? String(customer.phone) : null,
      email: customer.email ? String(customer.email) : null,
      customerSince: customer.customer_since ? String(customer.customer_since) : null,
      state: customer.state ? String(customer.state) : null,
      city: customer.city ? String(customer.city) : null,
      lastAttendant: customer.last_attendant ? String(customer.last_attendant) : null,
      status: String(customer.status ?? "INACTIVE") as CustomerStatus,
    },
    behavior: {
      lastPurchaseAt: customer.last_purchase_at ? String(customer.last_purchase_at) : null,
      daysSinceLastPurchase: customer.days_since_last_purchase === null || customer.days_since_last_purchase === undefined
        ? null
        : Number(customer.days_since_last_purchase),
      averageDaysBetweenOrders: customer.avg_days_between_orders === null || customer.avg_days_between_orders === undefined
        ? null
        : Number(customer.avg_days_between_orders),
      purchaseFrequency90d: Number(customer.purchase_frequency_90d ?? 0),
      frequencyDropRatio: Number(customer.frequency_drop_ratio ?? 0),
      predictedNextPurchaseAt: customer.predicted_next_purchase_at ? String(customer.predicted_next_purchase_at) : null,
      priorityScore: Number(customer.priority_score ?? 0),
      valueScore: Number(customer.value_score ?? 0),
      primaryInsight: customer.primary_insight ? String(customer.primary_insight) as InsightTag : null,
      insightTags: mapInsightTags(customer.insight_tags),
      labels: mapCustomerLabels(customer.labels),
      internalNotes: String(customer.internal_notes ?? ""),
    },
    sales: {
      totalAmount: Number(sales.total_amount ?? 0),
      totalOrders: Number(sales.total_orders ?? 0),
      totalPieces: Number(sales.total_pieces ?? 0),
      averageTicket: Number(sales.average_ticket ?? 0),
      firstOrderDate: sales.first_order_date ? String(sales.first_order_date) : null,
      lastOrderDate: sales.last_order_date ? String(sales.last_order_date) : null,
    },
    payments: {
      totalAmount: Number(paymentSummary.total_amount ?? 0),
      totalPayments: Number(paymentSummary.total_payments ?? 0),
      averagePayment: Number(paymentSummary.average_payment ?? 0),
      firstPaymentDate: paymentSummary.first_payment_date ? String(paymentSummary.first_payment_date) : null,
      lastPaymentDate: paymentSummary.last_payment_date ? String(paymentSummary.last_payment_date) : null,
    },
    credit: credit ? {
      balanceAmount,
      debtAmount,
      creditBalanceAmount,
      creditLimit,
      availableCreditAmount: creditLimit > 0 ? creditLimit - debtAmount : 0,
      paymentTerm: credit.payment_term === null || credit.payment_term === undefined ? null : Number(credit.payment_term),
      riskLevel: String(credit.risk_level ?? "OK") as CustomerCreditRiskLevel,
      operationalState: String(credit.operational_state ?? "SETTLED") as CustomerCreditOperationalState,
      flags: Array.isArray(credit.flags) ? credit.flags.map((flag: unknown) => String(flag)) : [],
      observation: String(credit.observation ?? ""),
      snapshotUpdatedAt: credit.snapshot_updated_at ? String(credit.snapshot_updated_at) : null,
    } : null,
    timeline: mergeCustomerAnalyticsTimeline(monthlySales, monthlyPayments),
    sellers: sellersResult.rows.map((row) => ({
      seller: String(row.seller ?? "Sem vendedora"),
      salesAmount: Number(row.sales_amount ?? 0),
      orderCount: Number(row.order_count ?? 0),
      pieces: Number(row.pieces ?? 0),
    })),
    paymentTypes: paymentTypesResult.rows.map((row) => ({
      paymentType: String(row.payment_type ?? "Não informado"),
      amount: Number(row.amount ?? 0),
      count: Number(row.count ?? 0),
    })),
    products: productsResult.rows.map((row) => ({
      sku: row.sku ? String(row.sku) : null,
      itemDescription: String(row.item_description ?? "Produto sem descrição"),
      quantity: Number(row.quantity ?? 0),
      salesAmount: Number(row.sales_amount ?? 0),
      orderCount: Number(row.order_count ?? 0),
      lastOrderDate: row.last_order_date ? String(row.last_order_date) : null,
    })),
  };
}

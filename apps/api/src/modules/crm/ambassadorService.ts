import type {
  AmbassadorListItem,
  AmbassadorResponse,
  AmbassadorSummary,
  AmbassadorTrendPoint,
  CustomerLabel,
  CustomerStatus,
  InsightTag,
  TopProduct,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { AMBASSADOR_LABEL_NORMALIZED_NAME, ensureAmbassadorLabel } from "./customerService.js";

const AMBASSADOR_TREND_MONTHS = 24;

const ambassadorPeriodCtes = `
  periods AS (
    SELECT
      date_trunc('month', CURRENT_DATE)::date AS current_period_start,
      CURRENT_DATE::date AS current_period_end,
      (date_trunc('month', CURRENT_DATE) - interval '1 month')::date AS previous_period_start,
      LEAST(
        ((date_trunc('month', CURRENT_DATE) - interval '1 month')::date + (EXTRACT(DAY FROM CURRENT_DATE)::int - 1)),
        (date_trunc('month', CURRENT_DATE)::date - 1)
      )::date AS previous_period_end
  ),
  cohort AS (
    SELECT
      c.id AS customer_id,
      cla.created_at::text AS ambassador_assigned_at
    FROM customers c
    JOIN customer_label_assignments cla ON cla.customer_id = c.id
    JOIN customer_labels cl ON cl.id = cla.label_id
    WHERE cl.normalized_name = $1
  ),
  order_item_totals AS (
    SELECT
      order_id,
      COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
    FROM order_items
    GROUP BY order_id
  ),
  period_metrics AS (
    SELECT
      cohort.customer_id,
      COALESCE(SUM(CASE WHEN o.order_date BETWEEN periods.current_period_start AND periods.current_period_end THEN o.total_amount ELSE 0 END), 0)::numeric(14,2) AS current_period_revenue,
      COUNT(*) FILTER (WHERE o.order_date BETWEEN periods.current_period_start AND periods.current_period_end)::int AS current_period_orders,
      COALESCE(SUM(CASE WHEN o.order_date BETWEEN periods.current_period_start AND periods.current_period_end THEN COALESCE(order_item_totals.pieces, 0) ELSE 0 END), 0)::numeric(14,2) AS current_period_pieces,
      COALESCE(SUM(CASE WHEN o.order_date BETWEEN periods.previous_period_start AND periods.previous_period_end THEN o.total_amount ELSE 0 END), 0)::numeric(14,2) AS previous_period_revenue
    FROM cohort
    CROSS JOIN periods
    LEFT JOIN orders o ON o.customer_id = cohort.customer_id
    LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
    GROUP BY cohort.customer_id
  )
`;

function mapInsightTags(value: unknown): InsightTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry) as InsightTag);
}

function mapLabels(value: unknown): CustomerLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const label = entry as Record<string, unknown>;
      return {
        id: String(label.id ?? ""),
        name: String(label.name ?? ""),
        color: String(label.color ?? "#2956d7"),
      } satisfies CustomerLabel;
    })
    .filter((entry): entry is CustomerLabel => Boolean(entry?.id && entry.name));
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

function mapAlerts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry));
}

export async function getAmbassadorOverview(): Promise<AmbassadorResponse> {
  await ensureAmbassadorLabel();

  const [summaryResult, trendResult, ambassadorTrendResult, ambassadorRows] = await Promise.all([
    pool.query(
      `
        WITH ${ambassadorPeriodCtes}
        SELECT
          COUNT(cohort.customer_id)::int AS total_ambassadors,
          COALESCE(SUM(period_metrics.current_period_revenue), 0)::numeric(14,2) AS current_period_revenue,
          COALESCE(SUM(period_metrics.current_period_orders), 0)::int AS current_period_orders,
          COALESCE(SUM(period_metrics.current_period_pieces), 0)::numeric(14,2) AS current_period_pieces,
          COALESCE(SUM(period_metrics.previous_period_revenue), 0)::numeric(14,2) AS previous_period_revenue,
          CASE
            WHEN COALESCE(SUM(period_metrics.previous_period_revenue), 0) > 0
              THEN ((SUM(period_metrics.current_period_revenue) - SUM(period_metrics.previous_period_revenue)) / SUM(period_metrics.previous_period_revenue))::numeric(14,4)
            ELSE NULL
          END AS revenue_growth_ratio,
          CASE
            WHEN COALESCE(SUM(period_metrics.current_period_orders), 0) > 0
              THEN (SUM(period_metrics.current_period_revenue) / SUM(period_metrics.current_period_orders))::numeric(14,2)
            ELSE 0
          END AS current_period_avg_ticket,
          COUNT(*) FILTER (WHERE s.status = 'ACTIVE')::int AS active_count,
          COUNT(*) FILTER (WHERE s.status = 'ATTENTION')::int AS attention_count,
          COUNT(*) FILTER (WHERE s.status = 'INACTIVE')::int AS inactive_count,
          COUNT(cohort.customer_id) FILTER (WHERE COALESCE(period_metrics.current_period_orders, 0) = 0)::int AS without_orders_this_month,
          MAX(periods.current_period_start)::text AS current_period_start,
          MAX(periods.current_period_end)::text AS current_period_end,
          MAX(periods.previous_period_start)::text AS previous_period_start,
          MAX(periods.previous_period_end)::text AS previous_period_end
        FROM periods
        LEFT JOIN cohort ON TRUE
        LEFT JOIN customer_snapshot s ON s.customer_id = cohort.customer_id
        LEFT JOIN period_metrics ON period_metrics.customer_id = cohort.customer_id
      `,
      [AMBASSADOR_LABEL_NORMALIZED_NAME],
    ),
    pool.query(
      `
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', CURRENT_DATE) - ($2::int * interval '1 month'),
            date_trunc('month', CURRENT_DATE) - interval '1 month',
            interval '1 month'
          )::date AS month_start
        ),
        cohort AS (
          SELECT c.id AS customer_id
          FROM customers c
          JOIN customer_label_assignments cla ON cla.customer_id = c.id
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cl.normalized_name = $1
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
            date_trunc('month', o.order_date)::date AS month_start,
            COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS revenue,
            COUNT(*)::int AS orders,
            COALESCE(SUM(COALESCE(order_item_totals.pieces, 0)), 0)::numeric(14,2) AS pieces
          FROM orders o
          JOIN cohort ON cohort.customer_id = o.customer_id
          LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
          WHERE o.order_date >= (SELECT MIN(month_start) FROM months)
            AND o.order_date < date_trunc('month', CURRENT_DATE)::date
          GROUP BY date_trunc('month', o.order_date)::date
        )
        SELECT
          to_char(months.month_start, 'YYYY-MM') AS month,
          COALESCE(monthly_totals.revenue, 0)::numeric(14,2) AS revenue,
          COALESCE(monthly_totals.orders, 0)::int AS orders,
          COALESCE(monthly_totals.pieces, 0)::numeric(14,2) AS pieces
        FROM months
        LEFT JOIN monthly_totals ON monthly_totals.month_start = months.month_start
        ORDER BY months.month_start
      `,
      [AMBASSADOR_LABEL_NORMALIZED_NAME, AMBASSADOR_TREND_MONTHS],
    ),
    pool.query(
      `
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', CURRENT_DATE) - ($2::int * interval '1 month'),
            date_trunc('month', CURRENT_DATE) - interval '1 month',
            interval '1 month'
          )::date AS month_start
        ),
        cohort AS (
          SELECT c.id AS customer_id
          FROM customers c
          JOIN customer_label_assignments cla ON cla.customer_id = c.id
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cl.normalized_name = $1
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
            o.customer_id,
            date_trunc('month', o.order_date)::date AS month_start,
            COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS revenue,
            COUNT(*)::int AS orders,
            COALESCE(SUM(COALESCE(order_item_totals.pieces, 0)), 0)::numeric(14,2) AS pieces
          FROM orders o
          JOIN cohort ON cohort.customer_id = o.customer_id
          LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
          WHERE o.order_date >= (SELECT MIN(month_start) FROM months)
            AND o.order_date < date_trunc('month', CURRENT_DATE)::date
          GROUP BY o.customer_id, date_trunc('month', o.order_date)::date
        )
        SELECT
          cohort.customer_id::text AS customer_id,
          to_char(months.month_start, 'YYYY-MM') AS month,
          COALESCE(monthly_totals.revenue, 0)::numeric(14,2) AS revenue,
          COALESCE(monthly_totals.orders, 0)::int AS orders,
          COALESCE(monthly_totals.pieces, 0)::numeric(14,2) AS pieces
        FROM cohort
        CROSS JOIN months
        LEFT JOIN monthly_totals
          ON monthly_totals.customer_id = cohort.customer_id
         AND monthly_totals.month_start = months.month_start
        ORDER BY cohort.customer_id, months.month_start
      `,
      [AMBASSADOR_LABEL_NORMALIZED_NAME, AMBASSADOR_TREND_MONTHS],
    ),
    pool.query(
      `
        WITH ${ambassadorPeriodCtes}
        SELECT
          s.customer_id,
          s.customer_code,
          s.display_name,
          s.last_purchase_at::date::text AS last_purchase_at,
          s.days_since_last_purchase,
          s.total_orders,
          s.total_spent,
          s.avg_ticket,
          s.status,
          s.priority_score,
          s.value_score,
          s.primary_insight,
          s.insight_tags,
          s.last_attendant,
          cohort.ambassador_assigned_at,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
              ORDER BY cl.name
            )
            FROM customer_label_assignments cla
            JOIN customer_labels cl ON cl.id = cla.label_id
            WHERE cla.customer_id = s.customer_id
          ), '[]'::jsonb) AS labels,
          COALESCE(period_metrics.current_period_revenue, 0)::numeric(14,2) AS current_period_revenue,
          COALESCE(period_metrics.current_period_orders, 0)::int AS current_period_orders,
          COALESCE(period_metrics.current_period_pieces, 0)::numeric(14,2) AS current_period_pieces,
          COALESCE(period_metrics.previous_period_revenue, 0)::numeric(14,2) AS previous_period_revenue,
          CASE
            WHEN COALESCE(period_metrics.previous_period_revenue, 0) > 0
              THEN ((period_metrics.current_period_revenue - period_metrics.previous_period_revenue) / period_metrics.previous_period_revenue)::numeric(14,4)
            ELSE NULL
          END AS revenue_growth_ratio,
          ARRAY_REMOVE(
            ARRAY[
              CASE WHEN COALESCE(period_metrics.current_period_orders, 0) = 0 THEN 'sem_pedido_no_mes' END,
              CASE WHEN COALESCE(period_metrics.previous_period_revenue, 0) > 0 AND COALESCE(period_metrics.current_period_revenue, 0) < COALESCE(period_metrics.previous_period_revenue, 0) THEN 'queda_vs_mes_anterior' END,
              CASE WHEN s.status = 'ATTENTION' THEN 'atencao' END,
              CASE WHEN s.status = 'INACTIVE' THEN 'inativo' END,
              CASE WHEN 'compra_prevista_vencida' = ANY(COALESCE(s.insight_tags, ARRAY[]::text[])) THEN 'compra_prevista_vencida' END
            ],
            NULL
          )::text[] AS alerts,
          COALESCE(top_products.top_products, '[]'::jsonb) AS top_products
        FROM cohort
        JOIN customer_snapshot s ON s.customer_id = cohort.customer_id
        LEFT JOIN period_metrics ON period_metrics.customer_id = cohort.customer_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'sku', products.sku,
                'itemDescription', products.item_description,
                'totalQuantity', products.total_quantity,
                'orderCount', products.order_count,
                'lastBoughtAt', products.last_bought_at
              )
              ORDER BY products.total_quantity DESC, products.order_count DESC, products.item_description ASC
            ),
            '[]'::jsonb
          ) AS top_products
          FROM (
            SELECT
              MAX(NULLIF(oi.sku, '')) AS sku,
              MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descricao')) AS item_description,
              COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS total_quantity,
              COUNT(DISTINCT o.id)::int AS order_count,
              MAX(o.order_date)::date::text AS last_bought_at
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.customer_id = cohort.customer_id
            GROUP BY COALESCE(
              NULLIF(oi.sku, ''),
              CONCAT('__desc__', COALESCE(NULLIF(oi.item_description, ''), 'sem-descricao'))
            )
            ORDER BY total_quantity DESC, order_count DESC, item_description ASC
            LIMIT 3
          ) products
        ) top_products ON TRUE
        ORDER BY current_period_revenue DESC, s.total_spent DESC, s.display_name ASC
      `,
      [AMBASSADOR_LABEL_NORMALIZED_NAME],
    ),
  ]);

  const summaryRow = summaryResult.rows[0] ?? {};
  const summary: AmbassadorSummary = {
    totalAmbassadors: Number(summaryRow.total_ambassadors ?? 0),
    currentPeriodRevenue: Number(summaryRow.current_period_revenue ?? 0),
    currentPeriodOrders: Number(summaryRow.current_period_orders ?? 0),
    currentPeriodPieces: Number(summaryRow.current_period_pieces ?? 0),
    currentPeriodAvgTicket: Number(summaryRow.current_period_avg_ticket ?? 0),
    previousPeriodRevenue: Number(summaryRow.previous_period_revenue ?? 0),
    revenueGrowthRatio:
      summaryRow.revenue_growth_ratio === null || summaryRow.revenue_growth_ratio === undefined
        ? null
        : Number(summaryRow.revenue_growth_ratio),
    withoutOrdersThisMonth: Number(summaryRow.without_orders_this_month ?? 0),
    statusCounts: {
      ACTIVE: Number(summaryRow.active_count ?? 0),
      ATTENTION: Number(summaryRow.attention_count ?? 0),
      INACTIVE: Number(summaryRow.inactive_count ?? 0),
    },
    currentPeriodStart: String(summaryRow.current_period_start ?? ""),
    currentPeriodEnd: String(summaryRow.current_period_end ?? ""),
    previousPeriodStart: String(summaryRow.previous_period_start ?? ""),
    previousPeriodEnd: String(summaryRow.previous_period_end ?? ""),
  };

  const monthlyTrend: AmbassadorTrendPoint[] = trendResult.rows.map((row) => ({
    month: String(row.month),
    revenue: Number(row.revenue ?? 0),
    orders: Number(row.orders ?? 0),
    pieces: Number(row.pieces ?? 0),
  }));

  const monthlyTrendByAmbassador = new Map<string, AmbassadorTrendPoint[]>();
  ambassadorTrendResult.rows.forEach((row) => {
    const customerId = String(row.customer_id ?? "");
    if (!customerId) {
      return;
    }

    const current = monthlyTrendByAmbassador.get(customerId) ?? [];
    current.push({
      month: String(row.month),
      revenue: Number(row.revenue ?? 0),
      orders: Number(row.orders ?? 0),
      pieces: Number(row.pieces ?? 0),
    });
    monthlyTrendByAmbassador.set(customerId, current);
  });

  const ambassadors: AmbassadorListItem[] = ambassadorRows.rows.map((row) => ({
    id: String(row.customer_id),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name ?? ""),
    lastPurchaseAt: row.last_purchase_at ? String(row.last_purchase_at) : null,
    daysSinceLastPurchase:
      row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
        ? null
        : Number(row.days_since_last_purchase),
    totalOrders: Number(row.total_orders ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    avgTicket: Number(row.avg_ticket ?? 0),
    status: String(row.status ?? "INACTIVE") as CustomerStatus,
    priorityScore: Number(row.priority_score ?? 0),
    valueScore: Number(row.value_score ?? 0),
    primaryInsight: row.primary_insight ? (String(row.primary_insight) as InsightTag) : null,
    insightTags: mapInsightTags(row.insight_tags),
    lastAttendant: row.last_attendant ? String(row.last_attendant) : null,
    labels: mapLabels(row.labels),
    isAmbassador: true,
    ambassadorAssignedAt: row.ambassador_assigned_at ? String(row.ambassador_assigned_at) : null,
    currentPeriodRevenue: Number(row.current_period_revenue ?? 0),
    currentPeriodOrders: Number(row.current_period_orders ?? 0),
    currentPeriodPieces: Number(row.current_period_pieces ?? 0),
    previousPeriodRevenue: Number(row.previous_period_revenue ?? 0),
    revenueGrowthRatio:
      row.revenue_growth_ratio === null || row.revenue_growth_ratio === undefined ? null : Number(row.revenue_growth_ratio),
    topProducts: mapTopProducts(row.top_products),
    alerts: mapAlerts(row.alerts),
    monthlyTrend: monthlyTrendByAmbassador.get(String(row.customer_id)) ?? [],
  }));

  return {
    summary,
    monthlyTrend,
    ambassadors,
  };
}

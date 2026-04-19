import type {
  AgendaItem,
  AgendaResponse,
  DashboardMetrics,
  InsightTag,
  ItemsSoldTrendPoint,
  ReactivationLeaderboardEntry,
  ReactivationRecoveredClient,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { refreshAllSnapshots, refreshDashboardDailyMetrics } from "../analytics/analyticsService.js";
import { AMBASSADOR_LABEL_NORMALIZED_NAME, listCustomers, buildWhere } from "./customerService.js";
import type { CustomerFilters } from "./customerService.js";

const DASHBOARD_TREND_WINDOW_DAYS = 90;
const AGENDA_ELIGIBILITY_TAGS = ["compra_prevista_vencida", "risco_churn"] as const;
const AGENDA_ELIGIBILITY_SQL = `
  s.insight_tags && ARRAY['compra_prevista_vencida', 'risco_churn']::text[]
`;

function getInsightTags(row: Record<string, unknown>) {
  return Array.isArray(row.insight_tags)
    ? row.insight_tags.map((tag: unknown) => String(tag) as InsightTag)
    : [];
}

function getLabels(row: Record<string, unknown>) {
  if (!Array.isArray(row.labels)) {
    return [];
  }

  return row.labels
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const label = entry as Record<string, unknown>;
      return {
        id: String(label.id ?? ""),
        name: String(label.name ?? ""),
        color: String(label.color ?? "#2956d7"),
      };
    })
    .filter((entry): entry is AgendaItem["labels"][number] => Boolean(entry?.id && entry.name));
}

function toDateOnly(value: unknown) {
  if (!value) {
    return null;
  }

  const stringValue = String(value);
  const matched = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched?.[1]) {
    return matched[1];
  }

  const parsed = new Date(stringValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function formatAgendaDate(value: unknown) {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) {
    return null;
  }

  const [year, month, day] = dateOnly.split("-");
  return year && month && day ? `${day}/${month}/${year}` : null;
}

function buildAgendaReason(row: Record<string, unknown>, tags: InsightTag[]) {
  const daysSince =
    row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
      ? null
      : Number(row.days_since_last_purchase);
  const predictedDate = formatAgendaDate(row.predicted_next_purchase_at);
  const avgDays =
    row.avg_days_between_orders === null || row.avg_days_between_orders === undefined
      ? null
      : Math.round(Number(row.avg_days_between_orders));

  if (tags.includes("risco_churn")) {
    return `Queda forte de frequencia e cliente fora da zona ativa${daysSince !== null ? ` ha ${daysSince} dias` : ""}.`;
  }

  if (tags.includes("reativacao")) {
    return `Cliente inativo com historico relevante${daysSince !== null ? ` e ${daysSince} dias sem comprar` : ""}.`;
  }

  if (tags.includes("compra_prevista_vencida")) {
    if (predictedDate && avgDays !== null) {
      return `Recompra media prevista para ${predictedDate}, usando media de ${avgDays} dias corridos entre pedidos.`;
    }

    if (predictedDate) {
      return `Recompra media prevista para ${predictedDate} e ainda sem novo pedido.`;
    }

    return "A recompra media ja passou e ainda nao houve novo pedido.";
  }

  if (tags.includes("alto_valor")) {
    return "Cliente de alto valor que merece acompanhamento proximo.";
  }

  if (String(row.status) === "ATTENTION") {
    return `Cliente em atencao${daysSince !== null ? ` com ${daysSince} dias desde a ultima compra` : ""}.`;
  }

  return "Cliente estrategico para contato comercial.";
}

function buildAgendaSuggestedAction(tags: InsightTag[], status: string) {
  if (tags.includes("risco_churn")) {
    return "Fazer contato de recuperacao com proposta personalizada.";
  }

  if (tags.includes("reativacao")) {
    return "Retomar conversa e investigar por que parou de comprar.";
  }

  if (tags.includes("compra_prevista_vencida")) {
    return "Fazer follow-up objetivo com proposta de recompra.";
  }

  if (status === "ATTENTION") {
    return "Fazer follow-up antes de o cliente virar inativo.";
  }

  return "Manter relacionamento e estimular nova compra.";
}

async function getAgendaEligibleCount(filters: CustomerFilters = {}) {
  const { whereSql, params } = buildWhere(filters);
  const baseCondition = AGENDA_ELIGIBILITY_SQL;
  const finalWhere = whereSql ? `${whereSql} AND ${baseCondition}` : `WHERE ${baseCondition}`;

  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM customer_snapshot s
      ${finalWhere}
    `,
    params,
  );

  return Number(result.rows[0]?.total ?? 0);
}

async function getSalesPerformance() {
  const result = await pool.query(
    `
      SELECT
        COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
        COUNT(DISTINCT o.id)::int AS total_orders,
        COUNT(DISTINCT o.customer_id)::int AS unique_customers,
        COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS total_revenue,
        COALESCE(SUM(oi.quantity), 0)::int AS total_items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE date_trunc('month', o.order_date) = date_trunc('month', CURRENT_DATE)
      GROUP BY COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente')
      ORDER BY total_orders DESC, total_revenue DESC
      LIMIT 10
    `,
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant ?? "Sem atendente"),
    totalOrders: Number(row.total_orders ?? 0),
    uniqueCustomers: Number(row.unique_customers ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    totalItems: Number(row.total_items ?? 0),
  }));
}

async function getReactivationLeaderboard(): Promise<ReactivationLeaderboardEntry[]> {
  const result = await pool.query(
    `
      WITH ordered AS (
        SELECT
          o.id AS order_id,
          o.customer_id,
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          o.order_date::date AS order_date,
          o.total_amount,
          LAG(o.order_date::date) OVER (PARTITION BY o.customer_id ORDER BY o.order_date) AS previous_order_date
        FROM orders o
      ),
      monthly_reactivations AS (
        SELECT
          order_id,
          customer_id,
          attendant,
          order_date,
          previous_order_date,
          total_amount,
          (order_date - previous_order_date)::int AS days_inactive_before_return,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id, date_trunc('month', order_date)
            ORDER BY order_date
          ) AS month_rank
        FROM ordered
        WHERE previous_order_date IS NOT NULL
          AND (order_date - previous_order_date) >= 90
          AND date_trunc('month', order_date) = date_trunc('month', CURRENT_DATE)
      ),
      first_monthly_reactivations AS (
        SELECT
          order_id,
          customer_id,
          attendant,
          order_date,
          previous_order_date,
          total_amount,
          days_inactive_before_return
        FROM monthly_reactivations
        WHERE month_rank = 1
      ),
      reactivation_details AS (
        SELECT
          fmr.attendant,
          fmr.customer_id,
          COALESCE(NULLIF(cs.customer_code, ''), '') AS customer_code,
          COALESCE(NULLIF(cs.display_name, ''), 'Cliente sem nome') AS display_name,
          COALESCE(cs.status, 'INACTIVE') AS status,
          COALESCE(cs.priority_score, 0)::numeric(10,2) AS priority_score,
          fmr.previous_order_date::text AS previous_order_date,
          fmr.order_date::text AS reactivation_order_date,
          fmr.days_inactive_before_return,
          fmr.total_amount::numeric(14,2) AS reactivated_order_amount,
          COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = fmr.order_id), 0)::int AS reactivated_items
        FROM first_monthly_reactivations fmr
        LEFT JOIN customer_snapshot cs ON cs.customer_id = fmr.customer_id
      )
      SELECT
        attendant,
        COUNT(*)::int AS recovered_customers,
        COALESCE(SUM(reactivated_order_amount), 0)::numeric(14,2) AS recovered_revenue,
        COALESCE(SUM(reactivated_items), 0)::int AS recovered_items,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'customerId', customer_id,
              'customerCode', customer_code,
              'displayName', display_name,
              'status', status,
              'priorityScore', priority_score,
              'previousOrderDate', previous_order_date,
              'reactivationOrderDate', reactivation_order_date,
              'daysInactiveBeforeReturn', days_inactive_before_return,
              'reactivatedOrderAmount', reactivated_order_amount,
              'reactivatedItems', reactivated_items
            )
            ORDER BY days_inactive_before_return DESC, reactivated_order_amount DESC, display_name ASC
          ),
          '[]'::jsonb
        ) AS recovered_clients
      FROM reactivation_details
      GROUP BY attendant
      ORDER BY recovered_customers DESC, recovered_revenue DESC, attendant ASC
      LIMIT 10
    `,
  );

  return result.rows.map((row) => ({
    attendant: String(row.attendant ?? "Sem atendente"),
    recoveredCustomers: Number(row.recovered_customers ?? 0),
    recoveredRevenue: Number(row.recovered_revenue ?? 0),
    recoveredItems: Number(row.recovered_items ?? 0),
    recoveredClients: (Array.isArray(row.recovered_clients) ? row.recovered_clients : []).map(
      (entry: Record<string, unknown>) =>
        ({
          customerId: String(entry.customerId ?? ""),
          customerCode: String(entry.customerCode ?? ""),
          displayName: String(entry.displayName ?? "Cliente sem nome"),
          status: String(entry.status ?? "INACTIVE") as ReactivationRecoveredClient["status"],
          priorityScore: Number(entry.priorityScore ?? 0),
          previousOrderDate: entry.previousOrderDate ? String(entry.previousOrderDate) : null,
          reactivationOrderDate: entry.reactivationOrderDate ? String(entry.reactivationOrderDate) : null,
          daysInactiveBeforeReturn: Number(entry.daysInactiveBeforeReturn ?? 0),
          reactivatedOrderAmount: Number(entry.reactivatedOrderAmount ?? 0),
          reactivatedItems: Number(entry.reactivatedItems ?? 0),
        }) satisfies ReactivationRecoveredClient,
    ),
  }));
}

async function ensureDashboardMetricsFresh(days: number = DASHBOARD_TREND_WINDOW_DAYS) {
  const validatedDays = Math.max(1, Math.min(730, Math.floor(days)));
  const freshnessResult = await pool.query<{
    today: string;
    latest_trend_day: string | null;
    trend_row_count: number;
    snapshot_row_count: number;
    stale_snapshot_count: number;
  }>(
    `
      SELECT
        CURRENT_DATE::text AS today,
        (SELECT MAX(day)::text FROM dashboard_daily_metrics) AS latest_trend_day,
        (
          SELECT COUNT(*)::int
          FROM dashboard_daily_metrics
          WHERE day >= CURRENT_DATE - ($1::int - 1)
        ) AS trend_row_count,
        (SELECT COUNT(*)::int FROM customer_snapshot) AS snapshot_row_count,
        (
          SELECT COUNT(*)::int
          FROM customer_snapshot
          WHERE updated_at::date < CURRENT_DATE
        ) AS stale_snapshot_count
    `,
    [validatedDays],
  );

  const freshness = freshnessResult.rows[0];
  const today = freshness?.today ?? new Date().toISOString().slice(0, 10);
  const latestTrendDay = freshness?.latest_trend_day ?? null;
  const trendRowCount = Number(freshness?.trend_row_count ?? 0);
  const snapshotRowCount = Number(freshness?.snapshot_row_count ?? 0);
  const staleSnapshotCount = Number(freshness?.stale_snapshot_count ?? 0);
  const snapshotIsStale = snapshotRowCount === 0 || staleSnapshotCount > 0;
  const trendNeedsRefresh = trendRowCount < validatedDays || !latestTrendDay || latestTrendDay < today;

  if (!snapshotIsStale && !trendNeedsRefresh) {
    return validatedDays;
  }

  if (snapshotIsStale) {
    await refreshAllSnapshots();
  }

  if (!snapshotIsStale && trendNeedsRefresh) {
    await refreshDashboardDailyMetrics(validatedDays);
  } else if (snapshotIsStale && validatedDays > DASHBOARD_TREND_WINDOW_DAYS) {
    await refreshDashboardDailyMetrics(validatedDays);
  }

  return validatedDays;
}

/**
 * Get portfolio trend data for the specified number of days
 * @param days Number of days of historical data to retrieve (1-730)
 * @returns Array of portfolio trend points
 */
async function getPortfolioTrend(days: number = DASHBOARD_TREND_WINDOW_DAYS) {
  // Validate days parameter
  const validatedDays = Math.max(1, Math.min(730, Math.floor(days)));

  let result = await pool.query(
    `
      SELECT
        day::text AS date,
        total_customers,
        active_count,
        attention_count,
        inactive_count
      FROM dashboard_daily_metrics
      WHERE day >= CURRENT_DATE - ($1::int - 1)
      ORDER BY day
    `,
    [validatedDays],
  );

  if ((result.rowCount ?? 0) < validatedDays) {
    await refreshDashboardDailyMetrics(validatedDays);
    result = await pool.query(
      `
        SELECT
          day::text AS date,
          total_customers,
          active_count,
          attention_count,
          inactive_count
        FROM dashboard_daily_metrics
        WHERE day >= CURRENT_DATE - ($1::int - 1)
        ORDER BY day
      `,
      [validatedDays],
    );
  }

  return result.rows.map((row) => ({
    date: String(row.date),
    totalCustomers: Number(row.total_customers ?? 0),
    activeCount: Number(row.active_count ?? 0),
    attentionCount: Number(row.attention_count ?? 0),
    inactiveCount: Number(row.inactive_count ?? 0),
  }));
}

/**
 * Get dashboard metrics including portfolio trends
 * @param trendDays Optional number of days for portfolio trend data (1-730, default: 90)
 * @returns Complete dashboard metrics
 */
async function getHistoricalReactivationLeaderboard(): Promise<HistoricalReactivationEntry[]> {
  const result = await pool.query(
    `
      WITH ordered AS (
        SELECT
          o.id AS order_id,
          o.customer_id,
          COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
          o.order_date::date AS order_date,
          o.total_amount,
          LAG(o.order_date::date) OVER (PARTITION BY o.customer_id ORDER BY o.order_date) AS previous_order_date
        FROM orders o
      ),
      monthly_reactivations AS (
        SELECT
          order_id,
          customer_id,
          attendant,
          order_date,
          previous_order_date,
          total_amount,
          (order_date - previous_order_date)::int AS days_inactive_before_return,
          date_trunc('month', order_date) AS month_trunc,
          ROW_NUMBER() OVER (
            PARTITION BY customer_id, date_trunc('month', order_date)
            ORDER BY order_date
          ) AS month_rank
        FROM ordered
        WHERE previous_order_date IS NOT NULL
          AND (order_date - previous_order_date) >= 90
      ),
      first_monthly_reactivations AS (
        SELECT
          order_id,
          customer_id,
          month_trunc,
          attendant,
          order_date,
          previous_order_date,
          days_inactive_before_return,
          total_amount
        FROM monthly_reactivations
        WHERE month_rank = 1
      ),
      reactivation_details AS (
        SELECT
          fmr.attendant,
          fmr.month_trunc,
          fmr.customer_id,
          COALESCE(NULLIF(cs.customer_code, ''), '') AS customer_code,
          COALESCE(NULLIF(cs.display_name, ''), 'Cliente sem nome') AS display_name,
          COALESCE(cs.status, 'INACTIVE') AS status,
          COALESCE(cs.priority_score, 0)::numeric(10,2) AS priority_score,
          fmr.previous_order_date::text AS previous_order_date,
          fmr.order_date::text AS reactivation_order_date,
          fmr.days_inactive_before_return,
          fmr.total_amount::numeric(14,2) AS reactivated_order_amount,
          COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = fmr.order_id), 0)::int AS reactivated_items
        FROM first_monthly_reactivations fmr
        LEFT JOIN customer_snapshot cs ON cs.customer_id = fmr.customer_id
      )
      SELECT
        to_char(month_trunc, 'YYYY-MM-01') AS month,
        attendant,
        COUNT(*)::int AS recovered_customers,
        COALESCE(SUM(reactivated_order_amount), 0)::numeric(14,2) AS recovered_revenue,
        COALESCE(SUM(reactivated_items), 0)::int AS recovered_items,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'customerId', customer_id,
              'customerCode', customer_code,
              'displayName', display_name,
              'status', status,
              'priorityScore', priority_score,
              'previousOrderDate', previous_order_date,
              'reactivationOrderDate', reactivation_order_date,
              'daysInactiveBeforeReturn', days_inactive_before_return,
              'reactivatedOrderAmount', reactivated_order_amount,
              'reactivatedItems', reactivated_items
            )
            ORDER BY days_inactive_before_return DESC, reactivated_order_amount DESC, display_name ASC
          ),
          '[]'::jsonb
        ) AS recovered_clients
      FROM reactivation_details
      GROUP BY month_trunc, attendant
      ORDER BY month_trunc DESC, recovered_revenue DESC
      LIMIT 100
    `
  );

  return result.rows.map((row) => ({
    month: String(row.month),
    attendant: String(row.attendant ?? "Sem atendente"),
    recoveredCustomers: Number(row.recovered_customers ?? 0),
    recoveredRevenue: Number(row.recovered_revenue ?? 0),
    recoveredItems: Number(row.recovered_items ?? 0),
    recoveredClients: (Array.isArray(row.recovered_clients) ? row.recovered_clients : []).map(
      (entry: Record<string, unknown>) =>
        ({
          customerId: String(entry.customerId ?? ""),
          customerCode: String(entry.customerCode ?? ""),
          displayName: String(entry.displayName ?? "Cliente sem nome"),
          status: String(entry.status ?? "INACTIVE") as ReactivationRecoveredClient["status"],
          priorityScore: Number(entry.priorityScore ?? 0),
          previousOrderDate: entry.previousOrderDate ? String(entry.previousOrderDate) : null,
          reactivationOrderDate: entry.reactivationOrderDate ? String(entry.reactivationOrderDate) : null,
          daysInactiveBeforeReturn: Number(entry.daysInactiveBeforeReturn ?? 0),
          reactivatedOrderAmount: Number(entry.reactivatedOrderAmount ?? 0),
          reactivatedItems: Number(entry.reactivatedItems ?? 0),
        }) satisfies ReactivationRecoveredClient,
    ),
  }));
}

async function getItemsSoldTrend(): Promise<ItemsSoldTrendPoint[]> {
  const result = await pool.query(
    `
      WITH order_item_totals AS (
        SELECT order_id, COALESCE(SUM(quantity), 0)::int AS quantity
        FROM order_items
        GROUP BY order_id
      ),
      sales AS (
        SELECT
          EXTRACT(YEAR FROM o.order_date)::int AS year,
          EXTRACT(MONTH FROM o.order_date)::int AS month,
          COALESCE(SUM(oi.quantity), 0)::int AS total_items,
          COUNT(DISTINCT o.id)::int AS total_orders,
          COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS total_revenue
        FROM orders o
        LEFT JOIN order_item_totals oi ON oi.order_id = o.id
        WHERE o.order_date >= date_trunc('year', CURRENT_DATE - interval '2 years')
        GROUP BY EXTRACT(YEAR FROM o.order_date), EXTRACT(MONTH FROM o.order_date)
      )
      SELECT 
        s.*,
        mt.target_amount
      FROM sales s
      LEFT JOIN monthly_targets mt ON mt.year = s.year AND mt.month = s.month
      ORDER BY s.year ASC, s.month ASC
    `
  );

  return result.rows.map(row => ({
    year: Number(row.year ?? 0),
    month: Number(row.month ?? 0),
    totalItems: Number(row.total_items ?? 0),
    totalOrders: Number(row.total_orders ?? 0),
    totalRevenue: Number(row.total_revenue ?? 0),
    targetAmount: row.target_amount ? Number(row.target_amount) : null,
  }));
}

export async function saveMonthlyTarget(year: number, month: number, targetAmount: number, attendant = 'TOTAL', targetRevenue = 0): Promise<void> {
  await pool.query(
    `
      INSERT INTO monthly_targets (year, month, attendant, target_amount, target_revenue, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (year, month, attendant) DO UPDATE
      SET target_amount = EXCLUDED.target_amount, 
          target_revenue = EXCLUDED.target_revenue, 
          updated_at = NOW()
    `,
    [year, month, attendant, targetAmount, targetRevenue]
  );
}

export async function getMonthlyTargets(year?: number): Promise<MonthlyTarget[]> {
  const query = year 
    ? { sql: `SELECT * FROM monthly_targets WHERE year = $1 ORDER BY year DESC, month DESC, attendant ASC`, params: [year] }
    : { sql: `SELECT * FROM monthly_targets ORDER BY year DESC, month DESC, attendant ASC`, params: [] };
    
  const result = await pool.query(query.sql, query.params);
  return result.rows.map(row => ({
    year: row.year,
    month: row.month,
    attendant: row.attendant,
    targetAmount: Number(row.target_amount ?? 0),
    targetRevenue: Number(row.target_revenue ?? 0),
  }));
}

export async function getDashboardMetrics(trendDays?: number): Promise<DashboardMetrics> {
  const validatedTrendDays = await ensureDashboardMetricsFresh(trendDays);
  const [totals, buckets, lastSync, topCustomers, agendaEligibleCount, reactivationLeaderboard, reactivationHistory, portfolioTrend, salesPerformance, itemsSoldTrend, currentMonthTargetData] =
    await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*)::int AS total_customers,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_count,
            COUNT(*) FILTER (WHERE status = 'ATTENTION')::int AS attention_count,
            COUNT(*) FILTER (WHERE status = 'INACTIVE')::int AS inactive_count,
            AVG(avg_ticket)::numeric(14,2) AS average_ticket,
            AVG(avg_days_between_orders)::numeric(14,2) AS average_frequency_days
          FROM customer_snapshot
        `,
      ),
      pool.query(
        `
          SELECT label, count
          FROM (
            SELECT '0-14' AS label, COUNT(*)::int AS count FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 0 AND 14
            UNION ALL
            SELECT '15-30', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 15 AND 30
            UNION ALL
            SELECT '31-59', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 31 AND 59
            UNION ALL
            SELECT '60-89', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 60 AND 89
            UNION ALL
            SELECT '90-179', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 90 AND 179
            UNION ALL
            SELECT '180+', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase >= 180 OR days_since_last_purchase IS NULL
          ) bucket_data
        `,
      ),
      pool.query(
        `
          SELECT MAX(finished_at) AS last_sync_at
          FROM (
            SELECT finished_at FROM import_runs WHERE status = 'COMPLETED'
            UNION ALL
            SELECT finished_at FROM sync_runs WHERE status = 'COMPLETED'
          ) AS sync_data
        `,
      ),
      listCustomers({ sortBy: "priority", limit: 8 }),
      getAgendaEligibleCount(),
      getReactivationLeaderboard(),
      getHistoricalReactivationLeaderboard(),
      getPortfolioTrend(validatedTrendDays),
      getSalesPerformance(),
      getItemsSoldTrend(),
      pool.query(`
        SELECT target_amount 
        FROM monthly_targets 
        WHERE year = EXTRACT(YEAR FROM CURRENT_DATE) 
          AND month = EXTRACT(MONTH FROM CURRENT_DATE)
          AND attendant = 'TOTAL'
      `),
    ]);

  const row = totals.rows[0];

  const snapshotTotal = Number(row?.total_customers ?? 0);
  const snapshotActive = Number(row?.active_count ?? 0);
  const snapshotAttention = Number(row?.attention_count ?? 0);
  const snapshotInactive = Number(row?.inactive_count ?? 0);

  const currentYearDate = new Date();
  const currentMonthData = itemsSoldTrend.find(i => i.year === currentYearDate.getFullYear() && i.month === currentYearDate.getMonth() + 1);
  const currentMonthItemsSold = currentMonthData?.totalItems ?? 0;
  const currentMonthTarget = currentMonthTargetData.rows[0]?.target_amount ? Number(currentMonthTargetData.rows[0].target_amount) : null;

  // Ensure the last trend point always matches the card values (both come
  // from customer_snapshot). Without this, historical recalculation from
  // orders can produce slightly different counts due to timing/logic diffs.
  const alignedTrend = portfolioTrend.length
    ? portfolioTrend.map((point, index) =>
        index === portfolioTrend.length - 1
          ? {
              ...point,
              totalCustomers: snapshotTotal,
              activeCount: snapshotActive,
              attentionCount: snapshotAttention,
              inactiveCount: snapshotInactive,
            }
          : point,
      )
    : portfolioTrend;

  return {
    totalCustomers: snapshotTotal,
    statusCounts: {
      ACTIVE: snapshotActive,
      ATTENTION: snapshotAttention,
      INACTIVE: snapshotInactive,
    },
    inactivityBuckets: buckets.rows.map((bucket) => ({
      label: String(bucket.label),
      count: Number(bucket.count ?? 0),
    })),
    averageTicket: Number(row?.average_ticket ?? 0),
    averageFrequencyDays: Number(row?.average_frequency_days ?? 0),
    lastSyncAt: lastSync.rows[0]?.last_sync_at ? new Date(String(lastSync.rows[0].last_sync_at)).toISOString() : null,
    topCustomers,
    agendaEligibleCount,
    reactivationLeaderboard,
    reactivationHistory,
    portfolioTrend: alignedTrend,
    salesPerformance,
    itemsSoldTrend,
    currentMonthTarget,
    currentMonthItemsSold,
  };
}

export async function getAgendaItems(limit = 25, offset = 0, filters: CustomerFilters = {}): Promise<AgendaResponse> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));

  const { whereSql, params } = buildWhere(filters);
  const baseCondition = AGENDA_ELIGIBILITY_SQL;
  const finalWhere = whereSql ? `${whereSql} AND ${baseCondition}` : `WHERE ${baseCondition}`;

  const countParams = [...params];
  const itemsParams = [...params, safeLimit, safeOffset];
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [countResult, itemsResult] = await Promise.all([
    pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM customer_snapshot s
        ${finalWhere}
      `,
      countParams
    ),
    pool.query(
      `
        SELECT
          s.customer_id,
          s.customer_code,
          s.display_name,
          s.last_purchase_at::date::text AS last_purchase_at,
          s.days_since_last_purchase,
          s.total_orders,
          s.total_spent,
          s.avg_ticket,
          s.avg_days_between_orders,
          s.status,
          s.priority_score,
          s.value_score,
          s.predicted_next_purchase_at::date::text AS predicted_next_purchase_at,
          s.primary_insight,
          s.insight_tags,
          s.last_attendant,
          EXISTS (
            SELECT 1
            FROM customer_label_assignments cla
            JOIN customer_labels cl ON cl.id = cla.label_id
            WHERE cla.customer_id = s.customer_id
              AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
          ) AS is_ambassador,
          (
            SELECT cla.created_at::text
            FROM customer_label_assignments cla
            JOIN customer_labels cl ON cl.id = cla.label_id
            WHERE cla.customer_id = s.customer_id
              AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
            ORDER BY cla.created_at ASC
            LIMIT 1
          ) AS ambassador_assigned_at,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
              ORDER BY cl.name
            )
            FROM customer_label_assignments cla
            JOIN customer_labels cl ON cl.id = cla.label_id
            WHERE cla.customer_id = s.customer_id
          ), '[]'::jsonb) AS labels
        FROM customer_snapshot s
        ${finalWhere}
        ORDER BY s.priority_score DESC, s.total_spent DESC, s.display_name ASC
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `,
      itemsParams,
    ),
  ]);

  const items = itemsResult.rows.map((row) => {
    const tags = getInsightTags(row);
    const status = String(row.status);

    return {
      id: String(row.customer_id),
      customerCode: String(row.customer_code ?? ""),
      displayName: String(row.display_name),
      lastPurchaseAt: row.last_purchase_at ? String(row.last_purchase_at) : null,
      daysSinceLastPurchase:
        row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
          ? null
          : Number(row.days_since_last_purchase),
      totalOrders: Number(row.total_orders ?? 0),
      totalSpent: Number(row.total_spent ?? 0),
      avgTicket: Number(row.avg_ticket ?? 0),
      avgDaysBetweenOrders:
        row.avg_days_between_orders === null || row.avg_days_between_orders === undefined
          ? null
          : Number(row.avg_days_between_orders),
      predictedNextPurchaseAt: row.predicted_next_purchase_at ? String(row.predicted_next_purchase_at) : null,
      status: status as AgendaItem["status"],
      priorityScore: Number(row.priority_score ?? 0),
      valueScore: Number(row.value_score ?? 0),
      primaryInsight: row.primary_insight ? (String(row.primary_insight) as InsightTag) : null,
      insightTags: tags,
      lastAttendant: row.last_attendant ? String(row.last_attendant) : null,
      labels: getLabels(row),
      isAmbassador: Boolean(row.is_ambassador),
      ambassadorAssignedAt: row.ambassador_assigned_at ? String(row.ambassador_assigned_at) : null,
      reason: buildAgendaReason(row, tags),
      suggestedAction: buildAgendaSuggestedAction(tags, status),
    } satisfies AgendaItem;
  });

  const totalEligible = Number(countResult.rows[0]?.total ?? 0);

  return {
    items,
    totalEligible,
    hasMore: safeOffset + items.length < totalEligible,
  };
}

import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { extractDisplayName, normalizeName } from "../../lib/normalize.js";
import { computeCustomerSnapshot } from "./analyticsCore.js";

const DASHBOARD_DAILY_WINDOW_DAYS = 90;

interface AggregateRow {
  customerId: string;
  customerCode: string | null;
  displayName: string;
  lastAttendant: string | null;
  orderDates: string[];
  orderTotals: string[];
}

function percentile(values: number[], target: number) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * target)));
  return sorted[index] ?? 0;
}

async function upsertCustomers(customerCodes: string[]) {
  if (!customerCodes.length) {
    return;
  }

  const result = await pool.query(
    `
      SELECT DISTINCT ON (customer_code)
        customer_code,
        customer_label,
        attendant_name,
        source_system,
        external_customer_id
      FROM sales_raw
      WHERE customer_code = ANY($1)
      ORDER BY customer_code, sale_date DESC, created_at DESC
    `,
    [customerCodes],
  );

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const row of result.rows) {
    const displayName = extractDisplayName(String(row.customer_label), String(row.customer_code));
    values.push(
      row.customer_code,
      row.external_customer_id,
      displayName,
      normalizeName(displayName),
      row.source_system,
      row.attendant_name,
    );
    placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
  }

  if (placeholders.length > 0) {
    await pool.query(
      `
        INSERT INTO customers (
          customer_code,
          external_customer_id,
          display_name,
          normalized_name,
          source_system_first,
          last_attendant
        )
        VALUES ${placeholders.join(",")}
        ON CONFLICT (customer_code) DO UPDATE
        SET
          external_customer_id = COALESCE(EXCLUDED.external_customer_id, customers.external_customer_id),
          display_name = EXCLUDED.display_name,
          normalized_name = EXCLUDED.normalized_name,
          last_attendant = COALESCE(EXCLUDED.last_attendant, customers.last_attendant),
          updated_at = NOW()
      `,
      values,
    );
  }
}

async function rebuildOrders(customerCodes: string[]) {
  if (!customerCodes.length) {
    return;
  }

  await pool.query("DELETE FROM orders WHERE customer_code = ANY($1)", [customerCodes]);

  const orderGroups = await pool.query(
    `
      SELECT
        source_system,
        external_order_id,
        order_number,
        customer_code,
        sale_date,
        COALESCE(MAX(order_status), 'VALID') AS order_status,
        COALESCE(MAX(attendant_name), '') AS last_attendant,
        SUM(line_total)::numeric(14,2) AS total_amount,
        COUNT(*)::int AS item_count
      FROM sales_raw
      WHERE customer_code = ANY($1)
      GROUP BY source_system, external_order_id, order_number, customer_code, sale_date
      ORDER BY sale_date DESC
    `,
    [customerCodes],
  );

  const customerMapResult = await pool.query("SELECT id, customer_code FROM customers WHERE customer_code = ANY($1)", [customerCodes]);
  const customerMap = new Map(customerMapResult.rows.map(r => [r.customer_code, r.id]));

  for (let i = 0; i < orderGroups.rows.length; i += 500) {
    const chunk = orderGroups.rows.slice(i, i + 500);
    
    for (const group of chunk) {
      const customerId = customerMap.get(group.customer_code);
      if (!customerId) continue;

      const inserted = await pool.query(
        `
          INSERT INTO orders (
            source_system, external_order_id, order_number, customer_id, customer_code,
            order_date, total_amount, status, item_count, last_attendant
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id
        `,
        [
          group.source_system, group.external_order_id, group.order_number, customerId, group.customer_code,
          group.sale_date, group.total_amount, group.order_status, group.item_count, group.last_attendant || null,
        ],
      );

      const orderId = inserted.rows[0]?.id;
      if (orderId) {
        await pool.query(
          `
            INSERT INTO order_items (
              order_id, sale_raw_id, sku, item_description, quantity, unit_price, line_total, attendant_name
            )
            SELECT $1, id, sku, item_description, quantity, unit_price, line_total, attendant_name
            FROM sales_raw
            WHERE source_system = $2 AND order_number = $3 AND customer_code = $4 AND sale_date = $5
          `,
          [orderId, group.source_system, group.order_number, group.customer_code, group.sale_date],
        );
      }
    }
  }
}

async function fetchAggregates(customerCodes?: string[]) {
  const result = await pool.query<AggregateRow>(
    `
      SELECT
        c.id AS "customerId",
        c.customer_code AS "customerCode",
        c.display_name AS "displayName",
        c.last_attendant AS "lastAttendant",
        ARRAY_AGG(o.order_date::text ORDER BY o.order_date ASC) AS "orderDates",
        ARRAY_AGG(o.total_amount::text ORDER BY o.order_date ASC) AS "orderTotals"
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
      WHERE ($1::text[] IS NULL OR c.customer_code = ANY($1))
      GROUP BY c.id
    `,
    [customerCodes?.length ? customerCodes : null],
  );
  return result.rows;
}

export async function refreshDashboardDailyMetrics(days = DASHBOARD_DAILY_WINDOW_DAYS) {
  const result = await pool.query<{
    day: string;
    total_customers: number;
    active_count: number;
    attention_count: number;
    inactive_count: number;
    new_count: number;
  }>(
    `
      WITH day_series AS (
        SELECT generate_series(
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int - 1),
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date,
          INTERVAL '1 day'
        )::date AS day
      ),
      target_days AS (
        SELECT day FROM day_series
        WHERE day NOT IN (SELECT day FROM dashboard_daily_metrics)
           OR day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1
      ),
      customer_stats_at_day AS (
        SELECT
          td.day,
          c.id AS customer_id,
          (
            SELECT COUNT(*)::int
            FROM orders o
            WHERE o.customer_id = c.id AND o.order_date <= td.day
          ) AS order_count,
          (
            SELECT MAX(o.order_date::date)
            FROM orders o
            WHERE o.customer_id = c.id AND o.order_date <= td.day
          ) AS last_order_day
        FROM target_days td
        CROSS JOIN customers c
        WHERE EXISTS (
          SELECT 1 FROM orders o2 
          WHERE o2.customer_id = c.id AND o2.order_date <= td.day
        )
      )
      SELECT
        day::text as day,
        COUNT(customer_id)::int as total_customers,
        COUNT(*) FILTER (WHERE order_count > 1 AND day - last_order_day <= 30)::int as active_count,
        COUNT(*) FILTER (WHERE order_count > 1 AND day - last_order_day BETWEEN 31 AND 89)::int as attention_count,
        COUNT(*) FILTER (WHERE order_count > 1 AND (last_order_day IS NULL OR day - last_order_day >= 90))::int as inactive_count,
        COUNT(*) FILTER (WHERE order_count = 1)::int as new_count
      FROM customer_stats_at_day
      GROUP BY day
      ORDER BY day
    `,
    [days],
  );

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const row of result.rows) {
    values.push(row.day, row.total_customers, row.active_count, row.attention_count, row.inactive_count, row.new_count);
    placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, NOW())`);
  }

  if (placeholders.length > 0) {
    await pool.query(
      `
        INSERT INTO dashboard_daily_metrics (
          day,
          total_customers,
          active_count,
          attention_count,
          inactive_count,
          new_count,
          updated_at
        )
        VALUES ${placeholders.join(",")}
        ON CONFLICT (day) DO UPDATE
        SET
          total_customers = EXCLUDED.total_customers,
          active_count = EXCLUDED.active_count,
          attention_count = EXCLUDED.attention_count,
          inactive_count = EXCLUDED.inactive_count,
          new_count = EXCLUDED.new_count,
          updated_at = NOW()
      `,
      values,
    );
  }

  // Override today's row with actual customer_snapshot counts so the last
  // trend point always matches the dashboard cards (same data source).
  await pool.query(`
    INSERT INTO dashboard_daily_metrics (
      day, total_customers, active_count, attention_count, inactive_count, updated_at
    )
    SELECT
      (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date,
      COUNT(*)::int,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int,
      COUNT(*) FILTER (WHERE status = 'ATTENTION')::int,
      COUNT(*) FILTER (WHERE status = 'INACTIVE')::int,
      COUNT(*) FILTER (WHERE status = 'NEW')::int,
      NOW()
    FROM customer_snapshot
    ON CONFLICT (day) DO UPDATE
    SET
      total_customers = EXCLUDED.total_customers,
      active_count    = EXCLUDED.active_count,
      attention_count = EXCLUDED.attention_count,
      inactive_count  = EXCLUDED.inactive_count,
      new_count       = EXCLUDED.new_count,
      updated_at      = NOW()
  `);

  logger.info("dashboard daily metrics refreshed", { days, count: result.rows.length });
}

export async function refreshCustomerSnapshots(customerCodes?: string[]) {
  const aggregates = await fetchAggregates(customerCodes);
  if (!aggregates.length) {
    return;
  }

  const monetaryValues = aggregates.map((aggregate) =>
    aggregate.orderTotals.reduce((sum, value) => sum + Number(value), 0),
  );
  const frequencyValues = aggregates.map((aggregate) => aggregate.orderDates.length);
  const highValueThreshold = percentile(monetaryValues, 0.8);
  const maxSpent = Math.max(1, ...monetaryValues);
  const maxOrders = Math.max(1, ...frequencyValues);

  // Postgres has a limit of 65535 parameters. 
  // With ~18 parameters per row, we can safely batch up to ~3000 rows.
  // Current customer count is ~1600, so we can do it in one go.
  // If it grows much larger, we should chunk this.
  
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < aggregates.length; i += CHUNK_SIZE) {
    const chunkValues: any[] = [];
    const chunkPlaceholders: string[] = [];
    let chunkParamIndex = 1;

    const chunkAggregates = aggregates.slice(i, i + CHUNK_SIZE);
    
    for (const aggregate of chunkAggregates) {
      const snapshot = computeCustomerSnapshot({
        orderDates: aggregate.orderDates.map((date) => new Date(date)),
        orderTotals: aggregate.orderTotals.map((value) => Number(value)),
        maxSpent,
        maxOrders,
        highValueThreshold,
      });

      const row = [
        aggregate.customerId,
        aggregate.displayName,
        aggregate.customerCode,
        snapshot.lastPurchaseAt?.toISOString() ?? null,
        snapshot.daysSinceLastPurchase,
        snapshot.totalOrders,
        snapshot.totalSpent.toFixed(2),
        snapshot.avgTicket.toFixed(2),
        snapshot.avgGap?.toFixed(2) ?? null,
        snapshot.purchaseFrequency90d.toFixed(2),
        snapshot.frequencyDropRatio.toFixed(4),
        snapshot.status,
        snapshot.valueScore.toFixed(2),
        snapshot.priorityScore.toFixed(2),
        snapshot.predictedNextPurchaseAt?.toISOString() ?? null,
        snapshot.primaryInsight,
        snapshot.insightTags,
        aggregate.lastAttendant,
      ];

      chunkValues.push(...row);
      const rowPlaceholders = row.map(() => `$${chunkParamIndex++}`).join(",");
      chunkPlaceholders.push(`(${rowPlaceholders}, NOW())`);
    }

    await pool.query(
      `
        INSERT INTO customer_snapshot (
          customer_id, display_name, customer_code, last_purchase_at, days_since_last_purchase,
          total_orders, total_spent, avg_ticket, avg_days_between_orders, purchase_frequency_90d,
          frequency_drop_ratio, status, value_score, priority_score, predicted_next_purchase_at,
          primary_insight, insight_tags, last_attendant, updated_at
        )
        VALUES ${chunkPlaceholders.join(",")}
        ON CONFLICT (customer_id) DO UPDATE
        SET
          display_name = EXCLUDED.display_name,
          customer_code = EXCLUDED.customer_code,
          last_purchase_at = EXCLUDED.last_purchase_at,
          days_since_last_purchase = EXCLUDED.days_since_last_purchase,
          total_orders = EXCLUDED.total_orders,
          total_spent = EXCLUDED.total_spent,
          avg_ticket = EXCLUDED.avg_ticket,
          avg_days_between_orders = EXCLUDED.avg_days_between_orders,
          purchase_frequency_90d = EXCLUDED.purchase_frequency_90d,
          frequency_drop_ratio = EXCLUDED.frequency_drop_ratio,
          status = EXCLUDED.status,
          value_score = EXCLUDED.value_score,
          priority_score = EXCLUDED.priority_score,
          predicted_next_purchase_at = EXCLUDED.predicted_next_purchase_at,
          primary_insight = EXCLUDED.primary_insight,
          insight_tags = EXCLUDED.insight_tags,
          last_attendant = EXCLUDED.last_attendant,
          updated_at = NOW()
      `,
      chunkValues,
    );
  }

  await refreshDashboardDailyMetrics();
  logger.info("customer snapshots refreshed", { count: aggregates.length });
}

export async function rebuildReadModels(customerCodes: string[]) {
  const uniqueCodes = Array.from(new Set(customerCodes.filter(Boolean)));
  await upsertCustomers(uniqueCodes);
  await rebuildOrders(uniqueCodes);
  await refreshCustomerSnapshots(uniqueCodes);
}

export async function refreshAllSnapshots() {
  const result = await pool.query<{ customer_code: string | null }>("SELECT customer_code FROM customers");
  await refreshCustomerSnapshots(
    result.rows.map((row) => row.customer_code).filter((value): value is string => Boolean(value)),
  );
}

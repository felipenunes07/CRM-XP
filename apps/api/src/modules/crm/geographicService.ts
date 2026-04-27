import type {
  GeographicCityStat,
  GeographicCustomerStat,
  GeographicSalesResponse,
  GeographicStateStat,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";

const GEOGRAPHIC_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1qAuw2ebWPJmcy_gl4Qf48GfmnSGLZumDfs62fpG2BGA/export?format=csv&gid=1582301730";

const LOCATION_SALES_CTE = `
  WITH normalized_orders AS (
    SELECT
      NULLIF(UPPER(BTRIM(c.state)), '') AS state,
      NULLIF(BTRIM(c.city), '') AS city,
      o.customer_id,
      o.id AS order_id,
      oi.quantity,
      oi.line_total
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    JOIN order_items oi ON oi.order_id = o.id
  ),
  location_sales AS (
    SELECT
      state,
      city,
      customer_id,
      order_id,
      COALESCE(SUM(quantity), 0)::numeric(14,2) AS total_pieces,
      COALESCE(SUM(line_total), 0)::numeric(14,2) AS total_revenue
    FROM normalized_orders
    WHERE state IS NOT NULL
    GROUP BY state, city, customer_id, order_id
  )
`;

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function mapStateStat(row: Record<string, unknown>): GeographicStateStat {
  return {
    state: String(row.state ?? ""),
    customerCount: toNumber(row.customer_count),
    orderCount: toNumber(row.order_count),
    cityCount: toNumber(row.city_count),
    totalPieces: toNumber(row.total_pieces),
    totalRevenue: toNumber(row.total_revenue),
  };
}

function mapCityStat(row: Record<string, unknown>): GeographicCityStat {
  return {
    state: String(row.state ?? ""),
    city: String(row.city ?? ""),
    customerCount: toNumber(row.customer_count),
    orderCount: toNumber(row.order_count),
    totalPieces: toNumber(row.total_pieces),
    totalRevenue: toNumber(row.total_revenue),
  };
}

function mapCustomerStat(row: Record<string, unknown>): GeographicCustomerStat {
  return {
    customerId: String(row.customer_id ?? ""),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name ?? "Cliente sem nome"),
    state: String(row.state ?? ""),
    city: String(row.city ?? "Sem cidade"),
    orderCount: toNumber(row.order_count),
    totalPieces: toNumber(row.total_pieces),
    totalRevenue: toNumber(row.total_revenue),
  };
}

export async function syncGeographicData() {
  console.log("Starting geographic data sync...");
  try {
    const response = await fetch(GEOGRAPHIC_SHEET_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch geographic sheet: ${response.statusText}`);
    }

    const csv = await response.text();
    const rows = csv.split("\n").slice(1);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let updatedCount = 0;
      for (const row of rows) {
        if (!row.trim()) {
          continue;
        }

        const parts = row.split(",");
        if (parts.length < 6) {
          continue;
        }

        const customerCode = parts[0]?.trim();
        const city = parts[4]?.trim() || null;
        const state = parts[5]?.trim().toUpperCase() || null;

        if (!customerCode) {
          continue;
        }

        await client.query("UPDATE customers SET state = $1, city = $2 WHERE customer_code = $3", [
          state,
          city,
          customerCode,
        ]);

        await client.query("UPDATE customer_snapshot SET state = $1, city = $2 WHERE customer_code = $3", [
          state,
          city,
          customerCode,
        ]);

        updatedCount += 1;
      }

      await client.query("COMMIT");
      console.log(`Geographic sync completed. Updated ${updatedCount} customers.`);
      return { updatedCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Geographic sync failed:", error);
    throw error;
  }
}

export async function getGeographicStats() {
  const result = await pool.query(`
    SELECT
      NULLIF(UPPER(BTRIM(state)), '') AS state,
      COUNT(*)::int AS customer_count,
      COALESCE(SUM(total_spent), 0)::numeric(14,2) AS total_revenue,
      COALESCE(SUM(total_orders), 0)::int AS total_orders
    FROM customer_snapshot
    WHERE NULLIF(UPPER(BTRIM(state)), '') IS NOT NULL
    GROUP BY NULLIF(UPPER(BTRIM(state)), '')
    ORDER BY total_revenue DESC, state ASC
  `);

  return result.rows.map((row) => ({
    state: String(row.state ?? ""),
    customerCount: toNumber(row.customer_count),
    totalRevenue: toNumber(row.total_revenue),
    totalOrders: toNumber(row.total_orders),
  }));
}

export async function getGeographicSalesStats(): Promise<GeographicSalesResponse> {
  const [stateResult, cityResult, customerResult] = await Promise.all([
    pool.query(
      `
        ${LOCATION_SALES_CTE}
        SELECT
          state,
          COUNT(DISTINCT customer_id)::int AS customer_count,
          COUNT(DISTINCT order_id)::int AS order_count,
          COUNT(DISTINCT city)::int AS city_count,
          COALESCE(SUM(total_pieces), 0)::numeric(14,2) AS total_pieces,
          COALESCE(SUM(total_revenue), 0)::numeric(14,2) AS total_revenue
        FROM location_sales
        GROUP BY state
        ORDER BY total_pieces DESC, total_revenue DESC, state ASC
      `,
    ),
    pool.query(
      `
        ${LOCATION_SALES_CTE}
        SELECT
          state,
          city,
          COUNT(DISTINCT customer_id)::int AS customer_count,
          COUNT(DISTINCT order_id)::int AS order_count,
          COALESCE(SUM(total_pieces), 0)::numeric(14,2) AS total_pieces,
          COALESCE(SUM(total_revenue), 0)::numeric(14,2) AS total_revenue
        FROM location_sales
        WHERE city IS NOT NULL
        GROUP BY state, city
        ORDER BY total_pieces DESC, total_revenue DESC, city ASC
      `,
    ),
    pool.query(
      `
        ${LOCATION_SALES_CTE}
        SELECT
          location_sales.customer_id,
          COALESCE(NULLIF(MAX(cs.customer_code), ''), MAX(c.customer_code), '') AS customer_code,
          COALESCE(NULLIF(MAX(cs.display_name), ''), MAX(c.display_name), 'Cliente sem nome') AS display_name,
          location_sales.state,
          COALESCE(location_sales.city, 'Sem cidade') AS city,
          COUNT(DISTINCT location_sales.order_id)::int AS order_count,
          COALESCE(SUM(location_sales.total_pieces), 0)::numeric(14,2) AS total_pieces,
          COALESCE(SUM(location_sales.total_revenue), 0)::numeric(14,2) AS total_revenue
        FROM location_sales
        JOIN customers c ON c.id = location_sales.customer_id
        LEFT JOIN customer_snapshot cs ON cs.customer_id = location_sales.customer_id
        GROUP BY
          location_sales.customer_id,
          location_sales.state,
          COALESCE(location_sales.city, 'Sem cidade')
        ORDER BY total_pieces DESC, total_revenue DESC, display_name ASC
      `,
    ),
  ]);

  const stateStats = stateResult.rows.map((row) => mapStateStat(row));
  const cityStats = cityResult.rows.map((row) => mapCityStat(row));
  const customerStats = customerResult.rows.map((row) => mapCustomerStat(row));

  return {
    summary: {
      totalStates: stateStats.length,
      totalCities: cityStats.length,
      totalCustomers: customerStats.length,
      totalOrders: stateStats.reduce((sum, item) => sum + item.orderCount, 0),
      totalPieces: stateStats.reduce((sum, item) => sum + item.totalPieces, 0),
      totalRevenue: stateStats.reduce((sum, item) => sum + item.totalRevenue, 0),
    },
    stateStats,
    cityStats,
    customerStats,
  };
}

export async function getCitiesByState(state: string) {
  const normalizedState = state.trim().toUpperCase();
  if (!normalizedState) {
    return [];
  }

  const result = await pool.query(
    `
      ${LOCATION_SALES_CTE}
      SELECT
        state,
        city,
        COUNT(DISTINCT customer_id)::int AS customer_count,
        COUNT(DISTINCT order_id)::int AS order_count,
        COALESCE(SUM(total_pieces), 0)::numeric(14,2) AS total_pieces,
        COALESCE(SUM(total_revenue), 0)::numeric(14,2) AS total_revenue
      FROM location_sales
      WHERE state = $1
        AND city IS NOT NULL
      GROUP BY state, city
      ORDER BY total_pieces DESC, total_revenue DESC, city ASC
    `,
    [normalizedState],
  );

  return result.rows.map((row) => mapCityStat(row));
}

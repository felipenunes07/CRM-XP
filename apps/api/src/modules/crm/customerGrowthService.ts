import { pool } from "../../db/client.js";

export const CUSTOMER_GROWTH_METRICS = ["pieces", "screenXp", "screenDe", "screenVv", "battery", "dock"] as const;
export type CustomerGrowthMetric = (typeof CUSTOMER_GROWTH_METRICS)[number];

export interface CustomerGrowthRow {
  customerId: string;
  customerCode: string;
  displayName: string;
  // Um valor por mes de `months`, na mesma ordem.
  series: Record<CustomerGrowthMetric, number[]>;
}

export interface CustomerGrowthResponse {
  months: string[];
  customers: CustomerGrowthRow[];
}

const METRIC_COLUMNS: Record<CustomerGrowthMetric, string> = {
  pieces: "pieces",
  screenXp: "screen_xp",
  screenDe: "screen_de",
  screenVv: "screen_vv",
  battery: "battery",
  dock: "dock",
};

// Lista os ultimos `monthCount` meses fechados (o mes atual fica de fora para
// nao parecer queda so porque ainda esta em andamento).
export function closedMonths(monthCount: number, today = new Date()) {
  const months: string[] = [];
  for (let offset = monthCount; offset >= 1; offset -= 1) {
    const date = new Date(Date.UTC(today.getFullYear(), today.getMonth() - offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// Pecas por mes de cada cliente, separadas por fabrica (telas XP/DE/VV),
// baterias e docks de carga, usando a mesma classificacao das Metas.
export async function getCustomerGrowth(monthCount: number): Promise<CustomerGrowthResponse> {
  const months = closedMonths(monthCount);
  const startMonth = `${months[0]}-01`;

  const result = await pool.query(
    `
      WITH bounds AS (
        SELECT $1::date AS start_month, date_trunc('month', CURRENT_DATE)::date AS end_month
      ),
      selected_orders AS MATERIALIZED (
        SELECT
          o.id,
          o.customer_id,
          to_char(o.order_date, 'YYYY-MM') AS month
        FROM orders o
        CROSS JOIN bounds b
        WHERE o.order_date >= b.start_month
          AND o.order_date < b.end_month
      ),
      active_catalog AS (
        SELECT DISTINCT isi.sku
        FROM inventory_snapshot_items isi
        JOIN inventory_snapshots inventory ON inventory.id = isi.snapshot_id
        WHERE inventory.is_active = TRUE
          AND NULLIF(BTRIM(isi.sku), '') IS NOT NULL
      ),
      raw_order_items AS MATERIALIZED (
        SELECT
          oi.order_id,
          COALESCE(oi.quantity, 0)::numeric(14,2) AS quantity,
          UPPER(COALESCE(oi.item_description, '') || ' ' || COALESCE(oi.sku, '')) AS product_text,
          active_catalog.sku IS NOT NULL AS is_active_catalog_item
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
            WHEN is_active_catalog_item
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
          COALESCE(SUM(quantity), 0) AS pieces,
          COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN' AND factory = 'XP'), 0) AS screen_xp,
          COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN' AND factory = 'DE'), 0) AS screen_de,
          COALESCE(SUM(quantity) FILTER (WHERE category = 'SCREEN' AND factory = 'VV'), 0) AS screen_vv,
          COALESCE(SUM(quantity) FILTER (WHERE category = 'BATTERY'), 0) AS battery,
          COALESCE(SUM(quantity) FILTER (WHERE category = 'DOCK'), 0) AS dock
        FROM classified_order_items
        GROUP BY order_id
      )
      SELECT
        c.id AS customer_id,
        COALESCE(c.customer_code, '') AS customer_code,
        c.display_name,
        o.month,
        COALESCE(SUM(t.pieces), 0)::float8 AS pieces,
        COALESCE(SUM(t.screen_xp), 0)::float8 AS screen_xp,
        COALESCE(SUM(t.screen_de), 0)::float8 AS screen_de,
        COALESCE(SUM(t.screen_vv), 0)::float8 AS screen_vv,
        COALESCE(SUM(t.battery), 0)::float8 AS battery,
        COALESCE(SUM(t.dock), 0)::float8 AS dock
      FROM selected_orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_item_totals t ON t.order_id = o.id
      GROUP BY c.id, c.customer_code, c.display_name, o.month
    `,
    [startMonth],
  );

  const monthIndex = new Map(months.map((month, index) => [month, index]));
  const customers = new Map<string, CustomerGrowthRow>();

  for (const row of result.rows) {
    const index = monthIndex.get(String(row.month));
    if (index === undefined) {
      continue;
    }

    const customerId = String(row.customer_id);
    let customer = customers.get(customerId);
    if (!customer) {
      customer = {
        customerId,
        customerCode: String(row.customer_code ?? ""),
        displayName: String(row.display_name ?? ""),
        series: Object.fromEntries(
          CUSTOMER_GROWTH_METRICS.map((metric) => [metric, months.map(() => 0)]),
        ) as Record<CustomerGrowthMetric, number[]>,
      };
      customers.set(customerId, customer);
    }

    for (const metric of CUSTOMER_GROWTH_METRICS) {
      customer.series[metric][index] = Number(row[METRIC_COLUMNS[metric]] ?? 0);
    }
  }

  return { months, customers: [...customers.values()] };
}

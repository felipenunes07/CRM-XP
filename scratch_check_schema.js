const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/olist_crm' });

async function run() {
  const result = await pool.query("SELECT * FROM orders WHERE order_date >= '2025-01-01' LIMIT 5;");
  console.log("Orders:", JSON.stringify(result.rows, null, 2));

  const result2 = await pool.query(`
        WITH old_codes AS (
          SELECT customer_code
          FROM customers
          WHERE source_system_first = 'history_xls'
            AND customer_code ~ '^(CL|KH|OEM)[0-9]+$'
        ),
        ranked_orders AS (
          SELECT
            o.customer_id AS "customerId",
            c.customer_code AS "customerCode",
            c.display_name AS "displayName",
            o.order_date::date::text AS "firstOrderDate",
            o.total_amount AS "firstOrderAmount",
            o.item_count AS "firstItemCount",
            NULLIF(o.last_attendant, '') AS "firstAttendant",
            ROW_NUMBER() OVER (
              PARTITION BY o.customer_id
              ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
            ) AS order_rank
          FROM orders o
          JOIN customers c ON c.id = o.customer_id
          WHERE NOT (
            c.source_system_first = 'supabase_2026'
            AND EXISTS (
              SELECT 1 FROM old_codes oc
              WHERE c.display_name LIKE oc.customer_code || ' %'
                 OR c.display_name LIKE oc.customer_code || '-%'
                 OR c.display_name LIKE oc.customer_code || ' -%'
            )
          )
          AND c.customer_code != 'OEM417'
          AND c.display_name NOT ILIKE '%MARX%'
        )
        SELECT
          "customerId",
          "customerCode",
          "displayName",
          "firstOrderDate",
          "firstOrderAmount",
          "firstItemCount",
          "firstAttendant"
        FROM ranked_orders
        WHERE order_rank = 1 AND "firstOrderDate" >= '2025-01-01'
        ORDER BY "firstOrderDate" ASC, "displayName" ASC
        LIMIT 5;
  `);
  console.log("Ranked:", JSON.stringify(result2.rows, null, 2));
  process.exit(0);
}
run();

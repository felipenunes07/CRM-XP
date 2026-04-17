import { pool } from "./apps/api/src/db/client.js";

async function run() {
  try {
    const result = await pool.query(`
      WITH first_orders AS (
        SELECT
          o.customer_id,
          NULLIF(o.last_attendant, '') AS attendant,
          o.order_date::date AS order_date,
          ROW_NUMBER() OVER (
            PARTITION BY o.customer_id
            ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
          ) AS order_rank
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        WHERE c.customer_code != 'OEM417'
          AND c.display_name NOT ILIKE '%MARX%'
      ),
      new_customers AS (
        SELECT
          attendant,
          TO_CHAR(order_date, 'YYYY-MM') AS month
        FROM first_orders
        WHERE order_rank = 1
          AND attendant IS NOT NULL
          AND attendant != ''
      ),
      ranked_summary AS (
        SELECT
          month,
          attendant,
          COUNT(*) as new_customers_count,
          ROW_NUMBER() OVER (PARTITION BY month ORDER BY COUNT(*) DESC) as rank
        FROM new_customers
        GROUP BY month, attendant
      )
      SELECT
        month,
        attendant,
        new_customers_count
      FROM ranked_summary
      WHERE rank = 1
      ORDER BY month DESC
      LIMIT 12
    `);

    console.log("Top vendedora por mês (últimos 12 meses registrados):");
    result.rows.forEach(row => {
      console.log(`- ${row.month}: ${row.attendant} (${row.new_customers_count} novos clientes)`);
    });
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

run();

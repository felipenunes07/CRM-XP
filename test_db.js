const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres'
});

async function run() {
  const result = await pool.query(`
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
        COALESCE(SUM(CASE WHEN c.customer_code ~ '^CL[0-9]+' THEN oi.quantity ELSE 0 END), 0)::int AS cl_items,
        COALESCE(SUM(CASE WHEN c.customer_code ~ '^KH[0-9]+' THEN oi.quantity ELSE 0 END), 0)::int AS kh_items,
        COALESCE(SUM(CASE WHEN c.customer_code ~ '^LJ[0-9]+' THEN oi.quantity ELSE 0 END), 0)::int AS lj_items,
        COALESCE(SUM(CASE WHEN c.customer_code !~ '^(CL|KH|LJ)[0-9]+' THEN oi.quantity ELSE 0 END), 0)::int AS other_items,
        COUNT(DISTINCT o.id)::int AS total_orders,
        COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS total_revenue
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_item_totals oi ON oi.order_id = o.id
      WHERE o.order_date >= '2023-01-01'::date
      GROUP BY EXTRACT(YEAR FROM o.order_date), EXTRACT(MONTH FROM o.order_date)
    )
    SELECT * FROM sales LIMIT 2;
  `);
  console.log(result.rows);
  pool.end();
}

run().catch(console.error);

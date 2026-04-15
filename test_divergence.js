import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/crm_xp' });

async function main() {
  const result = await pool.query(`
    WITH chart_logic AS (
      SELECT
        c.id,
        (
            SELECT MAX(o.order_date)::date
            FROM orders o
            WHERE o.customer_id = c.id
              AND (o.order_date <= CURRENT_DATE OR true)  -- simulate MAX exactly like TS
        ) AS last_order_day,
        CASE
          WHEN (CURRENT_DATE - (SELECT MAX(o.order_date)::date FROM orders o WHERE o.customer_id = c.id)) <= 30 THEN 'ACTIVE'
          WHEN (CURRENT_DATE - (SELECT MAX(o.order_date)::date FROM orders o WHERE o.customer_id = c.id)) BETWEEN 31 AND 89 THEN 'ATTENTION'
          ELSE 'INACTIVE'
        END AS chart_status
      FROM customers c
    )
    SELECT
      cs.customer_id,
      cs.days_since_last_purchase as ts_days,
      (CURRENT_DATE - cl.last_order_day) as sql_days,
      cs.status as ts_status,
      cl.chart_status as sql_status
    FROM customer_snapshot cs
    JOIN chart_logic cl ON cl.id = cs.customer_id
    WHERE cs.status != cl.chart_status
      AND cs.status = 'ACTIVE'
    LIMIT 20
  `);

  console.log("Mismatches where TS is ACTIVE but SQL is not:");
  for (const row of result.rows) {
    const dates = await pool.query("SELECT order_date FROM orders WHERE customer_id = $1 ORDER BY order_date ASC", [row.customer_id]);
    console.log(`Cust: ${row.customer_id.substring(0,6)}... | TS Days: ${row.ts_days} (${row.ts_status}) | SQL Days: ${row.sql_days} (${row.sql_status})`);
    console.log(`Dates: ${dates.rows.map(r => r.order_date.toISOString().split('T')[0]).join(', ')}`);
  }
  pool.end();
}

main().catch(console.error);

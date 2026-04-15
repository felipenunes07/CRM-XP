import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/crm_xp' });

pool.query("SELECT COUNT(*) FROM orders WHERE order_date > CURRENT_DATE").then(res => {
  console.log("Future orders:", res.rows[0].count);
  return pool.query("SELECT status, count(*) FROM customer_snapshot GROUP BY status");
}).then(res => {
  console.log("Customer snapshot status counts:", res.rows);
  return pool.query("SELECT day, active_count, attention_count, inactive_count FROM dashboard_daily_metrics ORDER BY day DESC LIMIT 1");
}).then(res => {
  console.log("Dashboard daily metrics final day:", res.rows[0]);
  pool.end();
}).catch(console.error);

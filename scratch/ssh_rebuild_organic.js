const { Client } = require('ssh2');

const rebuildScript = `
import { clearDashboardCache } from "./apps/api/src/modules/crm/dashboardService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== REBUILDING DAILY METRICS WITH REAL ENTRY DATES ===");
  
  await pool.query("DELETE FROM dashboard_daily_metrics");
  console.log("Cleared old data.");

  // Use MIN(orders.created_at) per customer to determine when each customer
  // first appeared in the system. This recreates the organic growth curve
  // that was originally built incrementally day by day.
  const result = await pool.query(\`
    WITH customer_system_entry AS (
      SELECT customer_id, MIN(created_at)::date AS entry_date
      FROM orders
      GROUP BY customer_id
    ),
    day_series AS (
      SELECT generate_series(
        (SELECT MIN(entry_date) FROM customer_system_entry),
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date,
        INTERVAL '1 day'
      )::date AS day
    ),
    daily_customer_stats AS (
      SELECT
        ds.day,
        ce.customer_id,
        MAX(o.order_date) AS last_order_day
      FROM day_series ds
      JOIN customer_system_entry ce ON ce.entry_date <= ds.day
      JOIN orders o ON o.customer_id = ce.customer_id AND o.order_date <= ds.day
      GROUP BY ds.day, ce.customer_id
    ),
    daily_items AS (
      SELECT
        ds.day,
        COALESCE(SUM(oi.quantity), 0)::int as daily_items_sold
      FROM day_series ds
      LEFT JOIN orders o ON o.order_date = ds.day
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY ds.day
    )
    INSERT INTO dashboard_daily_metrics 
      (day, total_customers, active_count, attention_count, inactive_count, new_count, daily_items_sold, updated_at)
    SELECT
      stats.day,
      COUNT(*)::int as total_customers,
      COUNT(*) FILTER (WHERE stats.day - last_order_day <= 30)::int as active_count,
      COUNT(*) FILTER (WHERE stats.day - last_order_day BETWEEN 31 AND 89)::int as attention_count,
      COUNT(*) FILTER (WHERE stats.day - last_order_day >= 90)::int as inactive_count,
      0::int as new_count,
      di.daily_items_sold,
      NOW()
    FROM daily_customer_stats stats
    JOIN daily_items di ON di.day = stats.day
    GROUP BY stats.day, di.daily_items_sold
    ORDER BY stats.day
    RETURNING day
  \`);
  
  console.log("Inserted " + result.rowCount + " days of metrics.");

  const verify = await pool.query(\`
    SELECT 
      MIN(total_customers) as min_tc, MAX(total_customers) as max_tc,
      MIN(day)::text as first_day, MAX(day)::text as last_day, COUNT(*) as days
    FROM dashboard_daily_metrics
  \`);
  console.table(verify.rows);

  const first5 = await pool.query(\`
    SELECT day::text, total_customers, active_count, attention_count, inactive_count
    FROM dashboard_daily_metrics ORDER BY day ASC LIMIT 5
  \`);
  console.log("First 5 days:");
  console.table(first5.rows);

  const last5 = await pool.query(\`
    SELECT day::text, total_customers, active_count, attention_count, inactive_count
    FROM dashboard_daily_metrics ORDER BY day DESC LIMIT 5
  \`);
  console.log("Last 5 days:");
  console.table(last5.rows);

  console.log("=== CLEARING CACHE ===");
  await clearDashboardCache();
  console.log("DONE!");

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected.');
  const b64 = Buffer.from(rebuildScript).toString('base64');
  const script = `
set -e
CONTAINER_ID=$(docker ps --filter name=xpcrm_crm-backend -q)
echo "Container: $CONTAINER_ID"
echo "${b64}" | base64 -d > /tmp/rebuild_organic.ts
docker cp /tmp/rebuild_organic.ts $CONTAINER_ID:/app/rebuild_organic.ts
rm /tmp/rebuild_organic.ts
docker exec $CONTAINER_ID npx tsx rebuild_organic.ts
docker exec $CONTAINER_ID rm /app/rebuild_organic.ts
echo "ALL DONE!"
`;
  conn.exec(script, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      console.log('Exit code:', code);
      conn.end();
    }).on('data', d => process.stdout.write(d)).stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});

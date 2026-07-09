const { Client } = require('ssh2');

const rebuildScript = `
import { refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { clearDashboardCache } from "./apps/api/src/modules/crm/dashboardService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== DELETING ALL DAILY METRICS ===");
  await pool.query("DELETE FROM dashboard_daily_metrics");

  console.log("=== RECALCULATING 900 DAYS (todo o periodo) ===");
  await refreshDashboardDailyMetrics(900);

  const range = await pool.query(\`
    SELECT MIN(total_customers) as min_tc, MAX(total_customers) as max_tc,
           MIN(day)::text as first_day, MAX(day)::text as last_day, COUNT(*) as days
    FROM dashboard_daily_metrics
  \`);
  console.table(range.rows);

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
echo "${b64}" | base64 -d > /tmp/rebuild_full_period.ts
docker cp /tmp/rebuild_full_period.ts $CONTAINER_ID:/app/rebuild_full_period.ts
rm /tmp/rebuild_full_period.ts
docker exec $CONTAINER_ID npx tsx rebuild_full_period.ts
docker exec $CONTAINER_ID rm /app/rebuild_full_period.ts
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

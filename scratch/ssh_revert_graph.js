const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const localFilePath = path.join(__dirname, '..', 'apps', 'api', 'src', 'modules', 'analytics', 'analyticsService.ts');
const localFileContent = fs.readFileSync(localFilePath, 'utf8');

const rebuildScript = `
import { refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { clearDashboardCache } from "./apps/api/src/modules/crm/dashboardService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== DELETING ALL DAILY METRICS ===");
  await pool.query("DELETE FROM dashboard_daily_metrics");
  console.log("Deleted all rows.");

  console.log("\\n=== RECALCULATING 365 DAYS ===");
  await refreshDashboardDailyMetrics(365);
  console.log("Recalculated!");

  console.log("\\n=== VERIFYING ===");
  const v = await pool.query(\`
    SELECT day::text, total_customers, active_count, attention_count, inactive_count
    FROM dashboard_daily_metrics ORDER BY day DESC LIMIT 5
  \`);
  console.table(v.rows);

  const range = await pool.query(\`
    SELECT MIN(total_customers) as min_tc, MAX(total_customers) as max_tc,
           MIN(day)::text as first_day, MAX(day)::text as last_day, COUNT(*) as days
    FROM dashboard_daily_metrics
  \`);
  console.table(range.rows);

  console.log("\\n=== CLEARING CACHE ===");
  await clearDashboardCache();
  console.log("Cache cleared!");

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected.');
  
  const b64Service = Buffer.from(localFileContent).toString('base64');
  const b64Rebuild = Buffer.from(rebuildScript).toString('base64');

  const script = `
set -e
CONTAINER_ID=$(docker ps --filter name=xpcrm_crm-backend -q)
echo "Container: $CONTAINER_ID"

echo "Step 1: Upload analyticsService.ts"
echo "${b64Service}" | base64 -d > /tmp/analyticsService_fix.ts
docker cp /tmp/analyticsService_fix.ts $CONTAINER_ID:/app/apps/api/src/modules/analytics/analyticsService.ts
rm /tmp/analyticsService_fix.ts

echo "Step 2: Build"
docker exec $CONTAINER_ID npm run build:legacy-api

echo "Step 3: Upload rebuild script"
echo "${b64Rebuild}" | base64 -d > /tmp/rebuild_fix.ts
docker cp /tmp/rebuild_fix.ts $CONTAINER_ID:/app/rebuild_fix.ts
rm /tmp/rebuild_fix.ts

echo "Step 4: Run rebuild"
docker exec $CONTAINER_ID npx tsx rebuild_fix.ts

echo "Step 5: Cleanup"
docker exec $CONTAINER_ID rm /app/rebuild_fix.ts

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

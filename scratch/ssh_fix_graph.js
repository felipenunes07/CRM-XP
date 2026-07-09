const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected.');
  
  const script = `
set -e

echo "=== Step 1: Finding active backend container ==="
CONTAINER_ID=$(docker ps --filter name=xpcrm_crm-backend -q)
echo "Found container: $CONTAINER_ID"

if [ -z "$CONTAINER_ID" ]; then
  echo "ERROR: No active xpcrm_crm-backend container found!"
  exit 1
fi

echo ""
echo "=== Step 2: Writing rebuild script ==="
cat > /tmp/rebuild_full.ts << 'SCRIPT_EOF'
import { refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { clearDashboardCache } from "./apps/api/src/modules/crm/dashboardService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== DELETING ALL DAILY METRICS ===");
  await pool.query("DELETE FROM dashboard_daily_metrics");
  console.log("Deleted all rows from dashboard_daily_metrics.");

  console.log("\\n=== RECALCULATING DAILY METRICS (365 DAYS) ===");
  await refreshDashboardDailyMetrics(365);
  console.log("Daily metrics recalculated for 365 days!");

  console.log("\\n=== VERIFYING RESULTS ===");
  const verify = await pool.query(\`
    SELECT day::text, total_customers, active_count, attention_count, inactive_count
    FROM dashboard_daily_metrics
    ORDER BY day DESC
    LIMIT 10
  \`);
  console.table(verify.rows);

  const minMax = await pool.query(\`
    SELECT 
      MIN(total_customers) as min_total,
      MAX(total_customers) as max_total,
      COUNT(*) as total_days
    FROM dashboard_daily_metrics
  \`);
  console.log("Min/Max total_customers across all days:");
  console.table(minMax.rows);

  console.log("\\n=== CLEARING REDIS CACHE ===");
  await clearDashboardCache();
  console.log("Redis cache cleared!");

  await pool.end();
  console.log("\\n=== ALL DONE ===");
}

run().catch(e => { console.error(e); process.exit(1); });
SCRIPT_EOF

echo ""
echo "=== Step 3: Copying script to container ==="
docker cp /tmp/rebuild_full.ts $CONTAINER_ID:/app/rebuild_full.ts

echo ""
echo "=== Step 4: Running rebuild inside container ==="
docker exec $CONTAINER_ID npx tsx rebuild_full.ts

echo ""
echo "=== Step 5: Cleanup ==="
docker exec $CONTAINER_ID rm /app/rebuild_full.ts
rm /tmp/rebuild_full.ts

echo ""
echo "=== COMPLETE! ==="
`;

  conn.exec(script, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      console.log(`\nScript finished with exit code: ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('Connection error:', err);
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});

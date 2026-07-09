const { Client } = require('ssh2');

const remoteScriptContent = `
import { refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== CLEARING ALL DAILY METRICS ===");
  await pool.query("DELETE FROM dashboard_daily_metrics");
  console.log("Cleared dashboard_daily_metrics.");

  console.log("\\n=== RECALCULATING DAILY METRICS (365 DAYS) ===");
  await refreshDashboardDailyMetrics(365);
  console.log("Daily metrics recalculated successfully for 365 days!");

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/rebuild_year.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec(`
        CONTAINER_ID=$(docker ps --filter name=xpcrm_crm-backend -q)
        docker cp /tmp/rebuild_year.ts \$CONTAINER_ID:/app/rebuild_year.ts
        docker exec \$CONTAINER_ID npx tsx rebuild_year.ts
        docker exec \$CONTAINER_ID rm /app/rebuild_year.ts
        rm /tmp/rebuild_year.ts
      `, (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.end();
        }).on('data', d => out += d);
      });
    });
  });
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});

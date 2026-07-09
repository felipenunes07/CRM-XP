const { Client } = require('ssh2');

const remoteScriptContent = `
import { refreshAllSnapshots, refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== REBUILDING ALL CUSTOMER SNAPSHOTS ===");
  await refreshAllSnapshots();
  console.log("All snapshots refreshed successfully.");

  console.log("\\n=== RECALCULATING DAILY METRICS (180 DAYS) ===");
  await pool.query("DELETE FROM dashboard_daily_metrics WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 180");
  await refreshDashboardDailyMetrics(180);
  console.log("Daily metrics recalculated successfully!");

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/rebuild_all_snapshots.ts && docker cp /tmp/rebuild_all_snapshots.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/rebuild_all_snapshots.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx rebuild_all_snapshots.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/rebuild_all_snapshots.ts; rm /tmp/rebuild_all_snapshots.ts', () => conn.end());
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

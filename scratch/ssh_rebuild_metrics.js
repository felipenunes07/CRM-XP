const { Client } = require('ssh2');

const remoteScriptContent = `
import { refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("Deletando métricas diárias dos últimos 180 dias em produção...");
  const delRes = await pool.query("DELETE FROM dashboard_daily_metrics WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 180");
  console.log("Deletados: " + delRes.rowCount + " registros.");

  console.log("Recalculando métricas dos últimos 180 dias...");
  await refreshDashboardDailyMetrics(180);
  console.log("Métricas recalculadas com sucesso!");
  
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/rebuild_metrics.ts && docker cp /tmp/rebuild_metrics.ts xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k:/app/rebuild_metrics.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k npx tsx rebuild_metrics.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k rm /app/rebuild_metrics.ts; rm /tmp/rebuild_metrics.ts', () => conn.end());
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

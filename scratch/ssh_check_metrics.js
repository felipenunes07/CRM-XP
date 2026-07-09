const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const res = await pool.query("SELECT MIN(day)::text as min_day, MAX(day)::text as max_day, COUNT(*) as count FROM dashboard_daily_metrics");
  console.log("=== DASHBOARD DAILY METRICS STATS ===");
  console.log(res.rows[0]);
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/check_metrics.ts && docker cp /tmp/check_metrics.ts xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k:/app/check_metrics.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k npx tsx check_metrics.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k rm /app/check_metrics.ts; rm /tmp/check_metrics.ts', () => conn.end());
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

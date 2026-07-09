const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== FINAL VERIFICATION ===");
  
  const r1 = await pool.query("SELECT COUNT(*) as count FROM customers");
  console.log("Total customers in customers table:", r1.rows[0].count);

  const r2 = await pool.query(\`
    SELECT day::text, total_customers 
    FROM dashboard_daily_metrics 
    WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 2
    ORDER BY day DESC
  \`);
  console.log("Last days in dashboard_daily_metrics:");
  console.table(r2.rows);

  await pool.end();
}

run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/check_final.ts && docker cp /tmp/check_final.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/check_final.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx check_final.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/check_final.ts; rm /tmp/check_final.ts', () => conn.end());
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

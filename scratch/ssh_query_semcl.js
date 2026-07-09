const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";
async function run() {
  const r1 = await pool.query("SELECT id, customer_code, display_name FROM customers WHERE customer_code = '754884308' OR customer_code = 'SEMCL'");
  console.log("=== SEMCL CUSTOMERS ===");
  console.log(r1.rows);
  const r2 = await pool.query("SELECT source_system, customer_code, customer_label, COUNT(*) FROM sales_raw WHERE customer_code IN ('754884308', 'SEMCL') GROUP BY source_system, customer_code, customer_label");
  console.log("=== SEMCL SALES RAW ===");
  console.log(r2.rows);
  await pool.end();
}
run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec(`echo "${base64Content}" | base64 -d > /tmp/query_semcl.ts && docker cp /tmp/query_semcl.ts xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27:/app/query_semcl.ts`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 npx tsx query_semcl.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 rm /app/query_semcl.ts; rm /tmp/query_semcl.ts', () => conn.end());
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

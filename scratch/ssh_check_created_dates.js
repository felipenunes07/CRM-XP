const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== CUSTOMER CREATION DATES DISTRIBUTION ===");
  const res = await pool.query(\`
    SELECT 
      created_at::date as date,
      COUNT(*) as count
    FROM customers
    WHERE customer_code LIKE 'CL%'
    GROUP BY date
    ORDER BY count DESC
    LIMIT 15;
  \`);
  console.table(res.rows);
  await pool.end();
}

run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/check_dates.ts && docker cp /tmp/check_dates.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/check_dates.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx check_dates.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/check_dates.ts; rm /tmp/check_dates.ts', () => conn.end());
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

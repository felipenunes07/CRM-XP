const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const result = await pool.query(\`
    SELECT 
      CASE 
        WHEN customer_code LIKE 'CL%' THEN 'CL'
        WHEN customer_code LIKE 'LJ%' THEN 'LJ'
        WHEN customer_code LIKE 'KH%' THEN 'KH'
        WHEN customer_code ~ '^\\\\d+$' THEN 'Numeric (Only Digits)'
        ELSE 'Others'
      END as prefix,
      COUNT(*) as count
    FROM customers
    GROUP BY prefix
    ORDER BY count DESC;
  \`);
  console.log("=== CUSTOMER COUNTS BY CODE PREFIX ===");
  console.table(result.rows);
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec(`echo "${base64Content}" | base64 -d > /tmp/count_prefixes.ts && docker cp /tmp/count_prefixes.ts xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27:/app/count_prefixes.ts`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 npx tsx count_prefixes.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 rm /app/count_prefixes.ts; rm /tmp/count_prefixes.ts', () => conn.end());
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

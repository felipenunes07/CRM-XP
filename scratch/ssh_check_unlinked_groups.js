const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== CHECKING UNLINKED CL GROUPS BY CODE MATCH ===");

  const res = await pool.query(\`
    SELECT 
      wg.id as group_id,
      wg.source_code as group_code,
      wg.source_name as group_name,
      c.id as customer_id,
      c.customer_code,
      c.display_name as customer_name
    FROM whatsapp_groups wg
    JOIN customers c ON c.customer_code = wg.source_code
    WHERE wg.customer_id IS NULL AND wg.source_code LIKE 'CL%';
  \`);
  
  console.log("Found " + res.rows.length + " unlinked groups that MATCH a customer in the database by code:");
  console.table(res.rows);

  const resNoMatch = await pool.query(\`
    SELECT 
      id as group_id,
      source_code as group_code,
      source_name as group_name
    FROM whatsapp_groups
    WHERE customer_id IS NULL AND source_code LIKE 'CL%'
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.customer_code = source_code
      );
  \`);
  
  console.log("\\nFound " + resNoMatch.rows.length + " unlinked groups that do NOT match any customer in the database:");
  console.table(resNoMatch.rows);

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/check_unlinked.ts && docker cp /tmp/check_unlinked.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/check_unlinked.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx check_unlinked.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/check_unlinked.ts; rm /tmp/check_unlinked.ts', () => conn.end());
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

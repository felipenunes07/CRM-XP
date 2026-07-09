const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== LINKING UNLINKED CL WHATSAPP GROUPS TO CUSTOMERS IN PRODUCTION ===");
  
  const result = await pool.query(\`
    UPDATE whatsapp_groups
    SET customer_id = c.id
    FROM customers c
    WHERE c.customer_code = whatsapp_groups.source_code
      AND whatsapp_groups.customer_id IS NULL 
      AND whatsapp_groups.source_code LIKE 'CL%'
    RETURNING whatsapp_groups.source_code, whatsapp_groups.source_name, c.display_name;
  \`);
  
  console.log("Successfully linked " + result.rowCount + " groups to customers:");
  console.table(result.rows);
  
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/link_groups.ts && docker cp /tmp/link_groups.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/link_groups.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx link_groups.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/link_groups.ts; rm /tmp/link_groups.ts', () => conn.end());
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

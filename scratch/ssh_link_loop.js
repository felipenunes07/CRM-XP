const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== LOOP LINKING CL GROUPS ===");
  
  const toLink = await pool.query(\`
    SELECT 
      wg.id as group_id,
      wg.source_code as group_code,
      c.id as customer_id,
      c.display_name as customer_name
    FROM whatsapp_groups wg
    JOIN customers c ON c.customer_code = wg.source_code
    WHERE wg.customer_id IS NULL AND wg.source_code LIKE 'CL%';
  \`);
  
  console.log("Found " + toLink.rows.length + " matching pairs to update.");

  let successCount = 0;
  let failCount = 0;

  for (const row of toLink.rows) {
    try {
      const updateRes = await pool.query(
        "UPDATE whatsapp_groups SET customer_id = $1 WHERE id = $2",
        [row.customer_id, row.group_id]
      );
      if (updateRes.rowCount > 0) {
        successCount++;
        console.log("Linked: " + row.group_code + " (" + row.customer_name + ") successfully.");
      } else {
        failCount++;
        console.log("Failed to link: " + row.group_code + " (Row not found).");
      }
    } catch (err) {
      failCount++;
      console.log("Error linking " + row.group_code + ": " + err.message);
    }
  }

  console.log("\\nSummary: " + successCount + " successful links, " + failCount + " failures.");
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/link_loop.ts && docker cp /tmp/link_loop.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/link_loop.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx link_loop.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/link_loop.ts; rm /tmp/link_loop.ts', () => conn.end());
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

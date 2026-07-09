const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const res = await pool.query("SELECT COUNT(*) FROM whatsapp_groups WHERE customer_id IS NULL AND source_code LIKE 'CL%'");
  console.log("=== COUNT OF UNLINKED CL GROUPS ===");
  console.log(res.rows[0]);
  
  const resTotal = await pool.query("SELECT COUNT(*) FROM whatsapp_groups WHERE source_code LIKE 'CL%'");
  console.log("=== TOTAL CL GROUPS ===");
  console.log(resTotal.rows[0]);

  await pool.end();
}

run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/check_count.ts && docker cp /tmp/check_count.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/check_count.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx check_count.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/check_count.ts; rm /tmp/check_count.ts', () => conn.end());
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

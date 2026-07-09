const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const codes = ['CL013', 'CL331', 'CL006'];
  for (const code of codes) {
    const res = await pool.query("SELECT id, source_code, customer_id FROM whatsapp_groups WHERE source_code = $1", [code]);
    console.log("Group " + code + ":", res.rows);
  }
  await pool.end();
}

run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/check_detail.ts && docker cp /tmp/check_detail.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/check_detail.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx check_detail.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/check_detail.ts; rm /tmp/check_detail.ts', () => conn.end());
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

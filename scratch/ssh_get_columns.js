const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'whatsapp_groups'");
  console.log(res.rows.map(r => r.column_name + ' (' + r.data_type + ')').join(', '));
  await pool.end();
}

run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/get_columns.ts && docker cp /tmp/get_columns.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/get_columns.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx get_columns.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/get_columns.ts; rm /tmp/get_columns.ts', () => conn.end());
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

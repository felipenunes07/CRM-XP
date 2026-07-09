const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const res = await pool.query("SELECT id, customer_code, display_name FROM customers WHERE display_name ILIKE '%Netinhocell%' OR customer_code = 'CL013'");
  console.log("Netinhocell results:", res.rows);
  await pool.end();
}

run();
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/query_netinho.ts && docker cp /tmp/query_netinho.ts xpcrm_crm-backend.1.ue6qd36uo75bla2nr7ah4z4a:/app/query_netinho.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx query_netinho.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/query_netinho.ts; rm /tmp/query_netinho.ts', () => conn.end());
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

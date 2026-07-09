const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const res = await pool.query(\`
    SELECT id, customer_code, display_name, normalized_name, source_system_first
    FROM customers
    ORDER BY normalized_name, customer_code
  \`);

  const rows = res.rows;
  const duplicates = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const c1 = rows[i];
      const c2 = rows[j];

      const nameClean1 = c1.normalized_name.replace(/^(cl|kh|lj)\\d+\\s*-\\s*/, '').trim();
      const nameClean2 = c2.normalized_name.replace(/^(cl|kh|lj)\\d+\\s*-\\s*/, '').trim();

      const exactNameMatch = c1.normalized_name === c2.normalized_name;
      const baseNameMatch = nameClean1 === nameClean2 && nameClean1.length > 2;

      const codeInName1 = c1.display_name.toLowerCase().includes(c2.customer_code.toLowerCase());
      const codeInName2 = c2.display_name.toLowerCase().includes(c1.customer_code.toLowerCase());

      if (exactNameMatch || baseNameMatch || codeInName1 || codeInName2) {
        duplicates.push({
          c1_code: c1.customer_code,
          c1_name: c1.display_name,
          c2_code: c2.customer_code,
          c2_name: c2.display_name,
          reason: exactNameMatch ? 'Exact normalized name' : (baseNameMatch ? 'Same base name' : 'Code in name')
        });
      }
    }
  }

  console.log("=== ALL POTENTIAL DUPLICATES IN PRODUCTION ===");
  duplicates.forEach((d, idx) => {
    console.log((idx + 1) + ". Code: " + d.c1_code + " (\\"" + d.c1_name + "\\") <---> Code: " + d.c2_code + " (\\"" + d.c2_name + "\\") [" + d.reason + "]");
  });

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec(`echo "${base64Content}" | base64 -d > /tmp/find_all.ts && docker cp /tmp/find_all.ts xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27:/app/find_all.ts`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 npx tsx find_all.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 rm /app/find_all.ts; rm /tmp/find_all.ts', () => conn.end());
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

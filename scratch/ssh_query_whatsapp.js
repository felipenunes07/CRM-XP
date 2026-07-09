const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== WHATSAPP_GROUPS STATS ===");
  const r1 = await pool.query(\`
    SELECT 
      classification,
      COUNT(*) as count
    FROM whatsapp_groups
    GROUP BY classification
    ORDER BY count DESC;
  \`);
  console.table(r1.rows);

  console.log("=== WHATSAPP_GROUPS CL MATCHING ===");
  const r2 = await pool.query(\`
    SELECT 
      COUNT(*) as total_groups,
      COUNT(*) FILTER (WHERE source_code LIKE 'CL%') as starts_with_cl,
      COUNT(*) FILTER (WHERE classification = 'CL') as classified_as_cl
    FROM whatsapp_groups;
  \`);
  console.table(r2.rows);

  console.log("=== WHATSAPP_TEAM_CONTACTS STATS ===");
  const r3 = await pool.query(\`
    SELECT 
      COUNT(*) as total_contacts,
      COUNT(*) FILTER (WHERE name ILIKE '%CL%') as name_contains_cl
    FROM whatsapp_team_contacts;
  \`);
  console.table(r3.rows);

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/query_whatsapp.ts && docker cp /tmp/query_whatsapp.ts xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k:/app/query_whatsapp.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k npx tsx query_whatsapp.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k rm /app/query_whatsapp.ts; rm /tmp/query_whatsapp.ts', () => conn.end());
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

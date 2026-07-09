const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== COMPARING WHATSAPP GROUPS AND CUSTOMERS ===");

  // 1. Check if there are customers with multiple whatsapp groups
  const r1 = await pool.query(\`
    WITH group_counts AS (
      SELECT customer_id, COUNT(*) as group_count
      FROM whatsapp_groups
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id
    )
    SELECT 
      COUNT(*) FILTER (WHERE group_count = 1) as customers_with_one_group,
      COUNT(*) FILTER (WHERE group_count > 1) as customers_with_multiple_groups,
      MAX(group_count) as max_groups_per_customer
    FROM group_counts;
  \`);
  console.log("Multiple groups analysis:");
  console.table(r1.rows);

  // 2. Count customers starting with CL who have multiple groups
  const r2 = await pool.query(\`
    WITH group_counts AS (
      SELECT wg.customer_id, COUNT(*) as group_count
      FROM whatsapp_groups wg
      JOIN customers c ON c.id = wg.customer_id
      WHERE c.customer_code LIKE 'CL%'
      GROUP BY wg.customer_id
    )
    SELECT 
      SUM(group_count) as total_cl_groups_with_customer,
      COUNT(*) as total_cl_customers_with_groups,
      COUNT(*) FILTER (WHERE group_count > 1) as cl_customers_with_multiple_groups
    FROM group_counts;
  \`);
  console.log("CL customers groups analysis:");
  console.table(r2.rows);

  // 3. Check if there are groups starting with CL that have NULL customer_id or no matching customer record
  const r3 = await pool.query(\`
    SELECT 
      COUNT(*) FILTER (WHERE customer_id IS NULL) as groups_with_null_customer,
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id)) as groups_with_orphan_customer_id
    FROM whatsapp_groups
    WHERE source_code LIKE 'CL%';
  \`);
  console.log("Orphan CL groups analysis:");
  console.table(r3.rows);

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/compare_counts.ts && docker cp /tmp/compare_counts.ts xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k:/app/compare_counts.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k npx tsx compare_counts.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.pirmoyj0wbgyf4x7patv7kk2k rm /app/compare_counts.ts; rm /tmp/compare_counts.ts', () => conn.end());
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

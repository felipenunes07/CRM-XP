const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";
import { extractDisplayName, normalizeName } from "./apps/api/src/lib/normalize.js";
import { rebuildReadModels, refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import crypto from "node:crypto";

async function run() {
  console.log("=== STARTING IMPORT OF UNLINKED OLD CL CLIENTS FROM WHATSAPP ===");

  const unlinkedRes = await pool.query(\`
    SELECT id, source_code, source_name, created_at
    FROM whatsapp_groups
    WHERE customer_id IS NULL AND source_code LIKE 'CL%'
      AND NOT EXISTS (
        SELECT 1 FROM customers c WHERE c.customer_code = source_code
      )
  \`);

  console.log("Found " + unlinkedRes.rows.length + " unlinked CL groups to import as customers.");

  const newCodes: string[] = [];

  for (const group of unlinkedRes.rows) {
    const customerId = crypto.randomUUID();
    const cleanName = extractDisplayName(group.source_name, group.source_code);
    const normName = normalizeName(cleanName);

    console.log("Creating customer: " + group.source_code + " - " + cleanName + " (Created at: " + group.created_at.toISOString() + ")");

    await pool.query(\`
      INSERT INTO customers (
        id, customer_code, display_name, normalized_name, internal_notes, source_system_first, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    \`, [
      customerId,
      group.source_code,
      cleanName,
      normName,
      '',
      'WHATSAPP',
      group.created_at,
      new Date()
    ]);

    await pool.query(\`
      UPDATE whatsapp_groups
      SET customer_id = $1
      WHERE id = $2
    \`, [customerId, group.id]);

    newCodes.push(group.source_code);
  }

  if (newCodes.length > 0) {
    console.log("\\nRebuilding read models for " + newCodes.length + " new customers...");
    await rebuildReadModels(newCodes);

    console.log("\\nRecalculating dashboard daily metrics for the last 180 days...");
    // Force delete last 180 days and recalculate
    await pool.query("DELETE FROM dashboard_daily_metrics WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 180");
    await refreshDashboardDailyMetrics(180);
    console.log("Metrics recalculated successfully!");
  }

  console.log("\\n=== IMPORT COMPLETED SUCCESSFULLY ===");
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/import_unlinked.ts && docker cp /tmp/import_unlinked.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/import_unlinked.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a npx tsx import_unlinked.ts', (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.exec('docker exec xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a rm /app/import_unlinked.ts; rm /tmp/import_unlinked.ts', () => conn.end());
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

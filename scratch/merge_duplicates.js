const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Import the rebuild function
const { rebuildReadModels } = require('../apps/api/src/modules/analytics/analyticsService.js');

async function run() {
  // 1. Identify all 40 + 1 (SEMCL) duplicate pairs
  const res = await pool.query(`
    SELECT id, customer_code, display_name, normalized_name, source_system_first
    FROM customers
    ORDER BY normalized_name, customer_code
  `);

  const rows = res.rows;
  const erpDuplicates = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      const c1 = rows[i];
      const c2 = rows[j];

      const c1IsNumeric = /^\d+$/.test(c1.customer_code);
      const c2IsAlphaNumeric = /^[A-Z]+\d+$/.test(c2.customer_code);

      // Handle the 40 standard pairs
      if (c1IsNumeric && c2IsAlphaNumeric) {
        const codeInName = c1.display_name.toUpperCase().includes(c2.customer_code.toUpperCase());
        const cleanName1 = c1.display_name.replace(new RegExp(`^${c2.customer_code}\\s*-\\s*`, 'i'), '').trim();
        const cleanName2 = c2.display_name.trim();
        const baseNameMatch = cleanName1.toLowerCase() === cleanName2.toLowerCase();

        if (codeInName && baseNameMatch) {
          erpDuplicates.push({ numeric: c1, alphanumeric: c2 });
        }
      }

      // Handle SEMCL special case
      if (c1.customer_code === '754884308' && c2.customer_code === 'SEMCL') {
        erpDuplicates.push({ numeric: c1, alphanumeric: c2 });
      }
    }
  }

  console.log(`Starting merge process for ${erpDuplicates.length} duplicate pairs...\n`);

  const client = await pool.connect();

  try {
    for (const pair of erpDuplicates) {
      const num = pair.numeric;
      const alpha = pair.alphanumeric;

      console.log(`Merging client: "${alpha.display_name}" (${alpha.customer_code}) into "${num.display_name}" (${num.customer_code})...`);

      await client.query('BEGIN');

      // 1. Update sales_raw
      await client.query(
        `UPDATE sales_raw SET customer_code = $1 WHERE customer_code = $2`,
        [num.customer_code, alpha.customer_code]
      );

      // 2. Merge customer_label_assignments
      await client.query(
        `INSERT INTO customer_label_assignments (customer_id, label_id)
         SELECT $1, label_id 
         FROM customer_label_assignments 
         WHERE customer_id = $2
         ON CONFLICT DO NOTHING`,
        [num.id, alpha.id]
      );
      await client.query(
        `DELETE FROM customer_label_assignments WHERE customer_id = $2`,
        [num.id, alpha.id]
      );

      // 3. Merge message_automation_customer_events
      await client.query(
        `INSERT INTO message_automation_customer_events (automation_id, customer_id, event_key, last_triggered_run_id, created_at)
         SELECT automation_id, $1, event_key, last_triggered_run_id, created_at 
         FROM message_automation_customer_events 
         WHERE customer_id = $2
         ON CONFLICT (automation_id, customer_id, event_key) 
         DO UPDATE SET last_triggered_run_id = EXCLUDED.last_triggered_run_id`,
        [num.id, alpha.id]
      );
      await client.query(
        `DELETE FROM message_automation_customer_events WHERE customer_id = $2`,
        [num.id, alpha.id]
      );

      // 4. Update simple foreign key references
      const simpleTables = [
        'deals',
        'message_logs',
        'whatsapp_campaign_recipients',
        'whatsapp_groups',
        'customer_lifecycle_events',
        'customer_credit_snapshot_rows',
        'customer_credit_order_entries',
        'customer_credit_payment_entries'
      ];

      for (const table of simpleTables) {
        await client.query(
          `UPDATE ${table} SET customer_id = $1 WHERE customer_id = $2`,
          [num.id, alpha.id]
        );
      }

      // 5. Delete the old customer record
      await client.query(
        `DELETE FROM customers WHERE id = $1`,
        [alpha.id]
      );

      await client.query('COMMIT');
      console.log(`  Successfully merged database records.`);
    }

    console.log(`\nRebuilding read-models for the merged clients...`);
    const numCodesToRebuild = erpDuplicates.map(p => p.numeric.customer_code);
    await rebuildReadModels(numCodesToRebuild);
    console.log(`\nRead-models successfully rebuilt!`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error during merge, transaction rolled back:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);

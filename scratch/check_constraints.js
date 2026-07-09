const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const result = await pool.query(`
    SELECT
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM
      pg_indexes
    WHERE
      schemaname = 'public'
      AND (
        tablename IN (
          'customer_label_assignments', 'orders', 'customer_snapshot', 
          'message_logs', 'whatsapp_groups', 'whatsapp_campaign_recipients', 
          'customer_credit_snapshot_rows', 'deals', 'customer_credit_order_entries', 
          'customer_credit_payment_entries', 'message_automation_customer_events', 
          'customer_lifecycle_events'
        )
      )
    ORDER BY tablename, indexname;
  `);
  console.log("=== UNIQUE AND OTHER INDEXES FOR RELEVANT TABLES ===");
  result.rows.forEach(r => {
    console.log(`Table: ${r.tablename} | Index: ${r.indexname}`);
    console.log(`  Definition: ${r.indexdef}`);
  });

  await pool.end();
}

run().catch(console.error);

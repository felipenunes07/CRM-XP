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
      AND tablename = 'customer_label_assignments'
    ORDER BY indexname;
  `);
  console.log("=== CUSTOMER_LABEL_ASSIGNMENTS INDEXES ===");
  result.rows.forEach(r => {
    console.log(`Index: ${r.indexname}`);
    console.log(`  Definition: ${r.indexdef}`);
  });

  await pool.end();
}

run().catch(console.error);

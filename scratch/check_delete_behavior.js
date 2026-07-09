const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const result = await pool.query(`
    SELECT
      tc.table_name,
      rc.delete_rule,
      tc.constraint_name
    FROM
      information_schema.table_constraints AS tc
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
    WHERE
      tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name;
  `);
  console.log("=== FOREIGN KEY CONSTRAINTS AND DELETE RULES ===");
  console.table(result.rows);

  await pool.end();
}

run().catch(console.error);

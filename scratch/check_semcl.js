const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const result = await pool.query(`
    SELECT source_system, customer_code, customer_label, COUNT(*), MIN(sale_date)::date, MAX(sale_date)::date
    FROM sales_raw
    WHERE customer_code IN ('754884308', 'SEMCL')
    GROUP BY source_system, customer_code, customer_label;
  `);
  console.table(result.rows);
  await pool.end();
}

run().catch(console.error);

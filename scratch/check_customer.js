const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const result = await pool.query(`
    SELECT 
      source_system, 
      customer_code, 
      customer_label,
      COUNT(*) as count,
      MIN(sale_date)::date as min_date,
      MAX(sale_date)::date as max_date
    FROM sales_raw 
    WHERE customer_code IN ('753317902', 'CL010') 
       OR customer_label ILIKE '%w2a%' 
       OR customer_label ILIKE '%cl010%'
    GROUP BY source_system, customer_code, customer_label
    ORDER BY count DESC
  `);
  console.log("=== GROUPED SALES ===");
  console.table(result.rows);

  await pool.end();
}

run().catch(console.error);

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const olistRaw = await pool.query(`
    SELECT raw_payload 
    FROM sales_raw 
    WHERE source_system = 'olist_v2' 
      AND customer_code = '753317902' 
    LIMIT 1
  `);
  console.log("=== OLIST_V2 RAW PAYLOAD ===");
  if (olistRaw.rows.length > 0) {
    console.log(JSON.stringify(olistRaw.rows[0].raw_payload, null, 2));
  } else {
    console.log("No olist_v2 raw payload found for 753317902");
  }

  const supabaseRaw = await pool.query(`
    SELECT raw_payload 
    FROM sales_raw 
    WHERE source_system = 'supabase_2026' 
      AND customer_code = '753317902' 
    LIMIT 1
  `);
  console.log("\n=== SUPABASE_2026 RAW PAYLOAD ===");
  if (supabaseRaw.rows.length > 0) {
    console.log(JSON.stringify(supabaseRaw.rows[0].raw_payload, null, 2));
  } else {
    console.log("No supabase_2026 raw payload found for 753317902");
  }

  await pool.end();
}

run().catch(console.error);

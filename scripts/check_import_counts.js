require('dotenv').config();
const pkg = require("pg");
const { Pool } = pkg;

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: SUPABASE_DATABASE_URL not found in environment variables");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function check() {
  try {
    const sr = await pool.query("SELECT count(*) FROM public.sales_raw");
    const c = await pool.query("SELECT count(*) FROM public.customers");
    const o = await pool.query("SELECT count(*) FROM public.orders");
    
    console.log("Counts:");
    console.log("- Sales Raw:", sr.rows[0].count);
    console.log("- Customers:", c.rows[0].count);
    console.log("- Orders:", o.rows[0].count);
  } finally {
    await pool.end();
  }
}

check().catch(console.error);

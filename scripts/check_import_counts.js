const pkg = require("pg");
const { Pool } = pkg;

const connectionString = "postgresql://postgres.gxvxgpwdgkeskttasrfz:9630Jinren%24@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
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

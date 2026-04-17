import { pool } from "./apps/api/src/db/client";

async function run() {
  const res = await pool.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name IN ('orders', 'order_items', 'customers', 'f_vendas_2026')
  `);
  console.log(res.rows);
  process.exit(0);
}
run().catch(console.error);

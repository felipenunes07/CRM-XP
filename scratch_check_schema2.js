const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/olist_crm' });

async function run() {
  const result = await pool.query("SELECT * FROM orders WHERE customer_id = 'f7b77da2-d869-4d58-b5cb-7e0062ce0519';");
  console.log("Orders for CL1034:", JSON.stringify(result.rows, null, 2));
  process.exit(0);
}
run();

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const wg = await pool.query("SELECT COUNT(*) FROM whatsapp_groups");
    const cust = await pool.query("SELECT COUNT(*) FROM customers");
    const snap = await pool.query("SELECT COUNT(*) FROM customer_snapshot");
    console.log("whatsapp_groups count:", wg.rows[0].count);
    console.log("customers count:", cust.rows[0].count);
    console.log("customer_snapshot count:", snap.rows[0].count);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();

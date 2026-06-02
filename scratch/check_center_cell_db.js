const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL.replace(/\/olist_crm$/, "/center_cell_db");
const pool = new Pool({ connectionString });

async function run() {
  console.log("Checking center_cell_db...");
  try {
    const tables = ['deals', 'deal_activities', 'whatsapp_incoming_messages', 'whatsapp_instances', 'users', 'customers', 'orders'];
    for (const table of tables) {
      try {
        const res = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table};`);
        console.log(`Table ${table} count:`, res.rows[0].count);
      } catch (err) {
        console.log(`Table ${table} error:`, err.message);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();

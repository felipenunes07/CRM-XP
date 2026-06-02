const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  console.log("Checking Supabase DB...");
  try {
    const tables = ['deals', 'deal_activities', 'whatsapp_incoming_messages', 'whatsapp_instances', 'users', 'customers', 'orders', 'whatsapp_activity_rollups'];
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

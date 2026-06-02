const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Checking DB sizes...");
  try {
    const tables = ['deals', 'deal_activities', 'whatsapp_incoming_messages', 'whatsapp_instances', 'users', 'customers', 'orders'];
    for (const table of tables) {
      const res = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table};`);
      console.log(`Table ${table} count:`, res.rows[0].count);
    }

    const activityTypes = await pool.query(`SELECT activity_type, COUNT(*)::int AS count FROM deal_activities GROUP BY activity_type;`);
    console.log("Activity types:");
    console.table(activityTypes.rows);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("=== ALL ROLLUPS ===");
  try {
    const res = await pool.query(`
      SELECT period_date::text, hour, SUM(sent_messages)::int as sent, SUM(received_messages)::int as received, COUNT(*)::int as count
      FROM whatsapp_activity_rollups
      GROUP BY period_date, hour
      ORDER BY period_date DESC, hour DESC
      LIMIT 100
    `);
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err.message);
  }
  await pool.end();
}

run();

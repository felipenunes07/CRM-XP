const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("=== CHECKING MESSAGES IN JUNE 2026 ===");
  try {
    const monitorRes = await pool.query(`
      SELECT DATE(created_at) as date, direction, COUNT(*)::int as count
      FROM whatsapp_monitor_messages
      WHERE created_at >= '2026-06-01'
      GROUP BY DATE(created_at), direction
      ORDER BY date DESC
    `);
    console.log("whatsapp_monitor_messages in June:");
    console.table(monitorRes.rows);
  } catch (err) {
    console.error("Error checking monitor messages:", err.message);
  }

  try {
    const activitiesRes = await pool.query(`
      SELECT DATE(created_at) as date, activity_type, COUNT(*)::int as count
      FROM deal_activities
      WHERE created_at >= '2026-06-01'
        AND activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      GROUP BY DATE(created_at), activity_type
      ORDER BY date DESC
    `);
    console.log("deal_activities in June:");
    console.table(activitiesRes.rows);
  } catch (err) {
    console.error("Error checking deal activities:", err.message);
  }

  try {
    const rollupsRes = await pool.query(`
      SELECT period_date, SUM(sent_messages)::int as sent, SUM(received_messages)::int as received, COUNT(*)::int as count
      FROM whatsapp_activity_rollups
      WHERE period_date >= '2026-06-01'
      GROUP BY period_date
      ORDER BY period_date DESC
    `);
    console.log("whatsapp_activity_rollups in June:");
    console.table(rollupsRes.rows);
  } catch (err) {
    console.error("Error checking rollups:", err.message);
  }

  await pool.end();
}

run();

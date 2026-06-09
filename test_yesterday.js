const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL
});

async function run() {
  console.log("=== CHECKING ROLLUPS GROUPED BY DATE ===");
  const rollups = await pool.query(
    "SELECT period_date, COUNT(*)::int AS count, SUM(sent_messages)::int AS sent, SUM(received_messages)::int AS received FROM whatsapp_activity_rollups GROUP BY period_date ORDER BY period_date DESC LIMIT 15"
  );
  console.table(rollups.rows);

  console.log("\n=== CHECKING MONITOR MESSAGES FOR YESTERDAY ===");
  const monitor = await pool.query(
    "SELECT COUNT(*)::int AS count FROM whatsapp_monitor_messages WHERE created_at >= '2026-06-08 00:00:00-03' AND created_at < '2026-06-09 00:00:00-03'"
  );
  console.log(`Monitor messages: ${monitor.rows[0].count}`);

  console.log("\n=== CHECKING DEAL ACTIVITIES FOR YESTERDAY ===");
  const activities = await pool.query(
    "SELECT COUNT(*)::int AS count FROM deal_activities WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED') AND created_at >= '2026-06-08 00:00:00-03' AND created_at < '2026-06-09 00:00:00-03'"
  );
  console.log(`Deal activities: ${activities.rows[0].count}`);

  console.log("\n=== CHECKING ANY MONITOR MESSAGES ON OTHER DATES ===");
  const monitorDates = await pool.query(
    "SELECT DATE(created_at) AS date, COUNT(*)::int AS count FROM whatsapp_monitor_messages GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC LIMIT 10"
  );
  console.table(monitorDates.rows);

  console.log("\n=== CHECKING ANY DEAL ACTIVITIES ON OTHER DATES ===");
  const activityDates = await pool.query(
    "SELECT DATE(created_at) AS date, COUNT(*)::int AS count FROM deal_activities WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED') GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC LIMIT 10"
  );
  console.table(activityDates.rows);

  pool.end();
}

run().catch(console.error);

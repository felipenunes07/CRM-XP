const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Checking database...");
  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_activity_rollups'
      );
    `);
    console.log("whatsapp_activity_rollups table exists:", tableCheck.rows[0].exists);

    const rollupsCount = await pool.query(`SELECT COUNT(*)::int AS count FROM whatsapp_activity_rollups;`);
    console.log("whatsapp_activity_rollups row count:", rollupsCount.rows[0].count);

    const dealActivitiesCount = await pool.query(`SELECT COUNT(*)::int AS count FROM deal_activities WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');`);
    console.log("deal_activities count (WhatsApp):", dealActivitiesCount.rows[0].count);

  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await pool.end();
  }
}

run();

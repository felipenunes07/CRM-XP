import { pool } from "../apps/api/src/db/client.ts";

async function run() {
  console.log("Checking DB via client pool...");
  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'whatsapp_activity_rollups'
      );
    `);
    console.log("whatsapp_activity_rollups table exists in API pool:", tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      const rollupsCount = await pool.query(`SELECT COUNT(*)::int AS count FROM whatsapp_activity_rollups;`);
      console.log("whatsapp_activity_rollups row count:", rollupsCount.rows[0].count);
    }
  } catch (err) {
    console.error("Error in API pool query:", err);
  } finally {
    await pool.end();
  }
}

run();

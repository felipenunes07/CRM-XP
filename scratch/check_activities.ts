import { pool } from "../apps/api/src/db/client.ts";

async function run() {
  console.log("Inspecting deal_activities...");
  try {
    const total = await pool.query(`SELECT COUNT(*)::int AS count FROM deal_activities;`);
    console.log("Total deal_activities:", total.rows[0].count);

    const whatsapp = await pool.query(`
      SELECT activity_type, COUNT(*)::int AS count 
      FROM deal_activities 
      GROUP BY activity_type;
    `);
    console.log("Activity types distribution:");
    console.table(whatsapp.rows);

    const dateRange = await pool.query(`
      SELECT MIN(created_at) as min_date, MAX(created_at) as max_date 
      FROM deal_activities;
    `);
    console.log("Date range of deal_activities:", dateRange.rows[0]);

    const recentWhatsapp = await pool.query(`
      SELECT id, activity_type, created_at, metadata ->> 'remoteJid' as remote_jid
      FROM deal_activities
      WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log("Recent WhatsApp activities:");
    console.table(recentWhatsapp.rows);

  } catch (err) {
    console.error("Error inspecting activities:", err);
  } finally {
    await pool.end();
  }
}

run();

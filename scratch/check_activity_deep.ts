import { pool } from "../apps/api/src/db/client.js";

async function check() {
  try {
    // 1. Check whatsapp instances status
    console.log("=== WHATSAPP INSTANCES ===");
    const instances = await pool.query(`
      SELECT id, instance_name, display_label, status, phone_number, 
             assigned_user_id, assigned_user_name,
             created_at, updated_at
      FROM whatsapp_instances
      ORDER BY updated_at DESC
    `);
    console.table(instances.rows);

    // 2. Check the most recent incoming messages 
    console.log("\n=== MOST RECENT INCOMING MESSAGES (any time) ===");
    const incoming = await pool.query(`
      SELECT id, remote_jid, instance_name, sender_name, 
             LEFT(message_text, 50) as text_preview,
             from_me, created_at
      FROM whatsapp_incoming_messages
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.table(incoming.rows);

    // 3. Most recent deal activities of any type
    console.log("\n=== MOST RECENT DEAL ACTIVITIES (any type) ===");
    const activities = await pool.query(`
      SELECT da.id, da.activity_type, da.actor_name, 
             LEFT(da.content, 40) as content_preview,
             da.created_at
      FROM deal_activities da
      ORDER BY da.created_at DESC
      LIMIT 10
    `);
    console.table(activities.rows);

    // 4. Check if the window selection matters
    console.log("\n=== ACTIVITIES PER WINDOW ===");
    const windows = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as last_1_day,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days') as last_14_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days,
        COUNT(*) as all_time
      FROM deal_activities
      WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    `);
    console.table(windows.rows);

    // 5. Check if deals have whatsapp_jid but no recent activity 
    console.log("\n=== DEALS WITH WHATSAPP JID - LAST ACTIVITY CHECK ===");
    const dealsActivity = await pool.query(`
      SELECT d.id, d.title, d.whatsapp_jid, 
             d.last_activity_at,
             (SELECT MAX(da.created_at) FROM deal_activities da 
              WHERE da.deal_id = d.id AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')) as last_wa_activity
      FROM deals d
      WHERE d.whatsapp_jid IS NOT NULL
      ORDER BY d.last_activity_at DESC
      LIMIT 10
    `);
    console.table(dealsActivity.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
check();

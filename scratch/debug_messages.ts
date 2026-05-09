import { pool } from "../apps/api/src/db/client.js";

async function debug() {
  try {
    // 1. All WhatsApp instances
    console.log("\n=== WHATSAPP INSTANCES ===");
    const instances = await pool.query(
      "SELECT id, instance_name, display_label, assigned_user_id, assigned_user_name, status FROM whatsapp_instances"
    );
    console.table(instances.rows);

    // 2. All deals with whatsapp_jid
    console.log("\n=== DEALS WITH WHATSAPP JID ===");
    const deals = await pool.query(`
      SELECT d.id, d.title, d.whatsapp_jid, d.whatsapp_instance_id, 
             d.assigned_to, d.assigned_to_name, d.last_activity_at,
             ps.name as stage_name
      FROM deals d 
      LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
      WHERE d.whatsapp_jid IS NOT NULL
      ORDER BY d.last_activity_at DESC
      LIMIT 20
    `);
    console.table(deals.rows);

    // 3. Recent whatsapp_incoming_messages
    console.log("\n=== RECENT INCOMING MESSAGES ===");
    const incoming = await pool.query(`
      SELECT id, remote_jid, instance_name, sender_name, 
             left(message_text, 50) as text_preview, 
             from_me, created_at
      FROM whatsapp_incoming_messages
      ORDER BY created_at DESC
      LIMIT 20
    `);
    console.table(incoming.rows);

    // 4. Recent deal_activities of type WHATSAPP
    console.log("\n=== RECENT WHATSAPP DEAL ACTIVITIES ===");
    const activities = await pool.query(`
      SELECT da.id, da.deal_id, da.activity_type, da.actor_name, 
             left(da.content, 50) as content_preview,
             da.metadata->>'instance' as instance_name,
             da.metadata->>'remoteJid' as remote_jid,
             da.created_at
      FROM deal_activities da
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      ORDER BY da.created_at DESC
      LIMIT 20
    `);
    console.table(activities.rows);

    // 5. Users in the system
    console.log("\n=== USERS ===");
    const users = await pool.query("SELECT id, name, email, role FROM users");
    console.table(users.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

debug();

import { pool } from "../apps/api/src/db/client.js";

async function check() {
  try {
    // 1. Count all whatsapp activities by type
    const counts = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_SENT') as sent,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_RECEIVED') as received,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM deal_activities 
      WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    `);
    console.log("=== ALL WHATSAPP ACTIVITIES ===");
    console.table(counts.rows);

    // 2. Recent 7 days
    const recent7 = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_SENT') as sent,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_RECEIVED') as received
      FROM deal_activities 
      WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND created_at >= NOW() - INTERVAL '7 days'
    `);
    console.log("\n=== LAST 7 DAYS ===");
    console.table(recent7.rows);

    // 3. Recent sent messages
    const recentSent = await pool.query(`
      SELECT da.id, da.deal_id, da.activity_type, da.actor_name, 
             LEFT(da.content, 60) as content_preview,
             da.metadata->>'instance' as instance,
             da.metadata->>'remoteJid' as remote_jid,
             da.actor_user_id,
             da.created_at
      FROM deal_activities da
      WHERE da.activity_type = 'WHATSAPP_SENT'
      ORDER BY da.created_at DESC
      LIMIT 10
    `);
    console.log("\n=== RECENT SENT ACTIVITIES ===");
    console.table(recentSent.rows);

    // 4. Check the activity report query joins
    const reportCheck = await pool.query(`
      SELECT
        COALESCE(u.id::text, 'instance:' || wi_base.id, 'instance:' || wi.id, 'sem-agente') AS agent_id,
        COALESCE(u.name, wi_base.display_label, wi.display_label, 'Sem agente') AS agent_name,
        da.activity_type,
        LEFT(da.content, 60) as content_preview,
        da.metadata->>'remoteJid' as remote_jid,
        da.created_at
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      LEFT JOIN whatsapp_instances wi_base ON (
        wi_base.id = d.whatsapp_instance_id 
        OR LOWER(wi_base.instance_name) = LOWER(COALESCE(da.metadata ->> 'instance', ''))
      )
      LEFT JOIN users u ON (
        u.id = da.actor_user_id 
        OR u.id = d.assigned_to
        OR u.id = wi_base.assigned_user_id
        OR LOWER(u.name) = LOWER(da.actor_name)
        OR LOWER(u.name) = LOWER(d.assigned_to_name)
        OR LOWER(u.name) = LOWER(wi_base.assigned_user_name)
      )
      LEFT JOIN LATERAL (
        SELECT wi_match.*
        FROM whatsapp_instances wi_match
        WHERE (wi_match.id = d.whatsapp_instance_id OR wi_match.assigned_user_id = u.id)
        ORDER BY
          CASE
            WHEN wi_match.id = d.whatsapp_instance_id THEN 0
            WHEN wi_match.assigned_user_id = u.id THEN 1
            ELSE 2
          END
        LIMIT 1
      ) wi ON true
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND da.created_at >= NOW() - INTERVAL '7 days'
        AND COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid) IS NOT NULL
        AND COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid) NOT LIKE '%@broadcast'
        AND LOWER(COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)) <> 'status@broadcast'
      ORDER BY da.created_at DESC
      LIMIT 15
    `);
    console.log("\n=== ACTIVITY REPORT QUERY (last 7 days) ===");
    console.table(reportCheck.rows);

    // 5. Check if there are sent activities that get filtered out
    const filteredOut = await pool.query(`
      SELECT da.id, da.activity_type, LEFT(da.content, 50) as content,
             da.metadata->>'remoteJid' as metadata_remote_jid,
             d.whatsapp_jid as deal_whatsapp_jid,
             COALESCE(da.metadata->>'remoteJid', d.whatsapp_jid) as resolved_jid,
             da.created_at
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type = 'WHATSAPP_SENT'
      ORDER BY da.created_at DESC
      LIMIT 10
    `);
    console.log("\n=== SENT ACTIVITIES WITH JID INFO ===");
    console.table(filteredOut.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
check();

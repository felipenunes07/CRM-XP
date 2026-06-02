import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== CHECKING WHATSAPP SENT MESSAGES IN GROUPS ===");

    // Fetch sent messages in groups from deal_activities
    const result = await pool.query(`
      SELECT
        da.id,
        da.deal_id,
        da.actor_user_id,
        da.actor_name,
        da.content,
        da.metadata,
        da.created_at,
        (da.metadata ->> 'remoteJid')::text AS metadata_remote_jid,
        d.whatsapp_jid,
        d.title
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type = 'WHATSAPP_SENT'
        AND (
          (da.metadata ->> 'remoteJid') LIKE '%@g.us'
          OR d.whatsapp_jid LIKE '%@g.us'
        )
      ORDER BY da.created_at DESC
      LIMIT 50
    `);

    console.log(`Found ${result.rowCount} sent messages in groups.`);
    if (result.rowCount > 0) {
      const formatted = result.rows.map(row => ({
        id: row.id,
        actor: row.actor_name,
        actor_id: row.actor_user_id,
        jid: row.metadata_remote_jid || row.whatsapp_jid,
        title: row.title,
        content: row.content.slice(0, 50),
        metadata: JSON.stringify(row.metadata),
        date: row.created_at
      }));
      console.table(formatted);
    } else {
      console.log("No sent messages in groups found at all.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== RECENT PARTICULAR CHAT ACTIVITIES ===");

    const result = await pool.query(
      `
      SELECT
        da.id,
        da.activity_type,
        da.actor_name,
        da.metadata,
        da.content,
        d.title,
        d.customer_display_name,
        d.whatsapp_jid
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND (
          (da.metadata ->> 'remoteJid') NOT LIKE '%@g.us'
          AND d.whatsapp_jid NOT LIKE '%@g.us'
        )
      ORDER BY da.created_at DESC
      LIMIT 20
      `
    );

    console.table(result.rows.map(row => ({
      id: row.id,
      type: row.activity_type,
      actor: row.actor_name,
      senderName: row.metadata?.senderName,
      chatDisplayName: row.metadata?.chatDisplayName,
      dealTitle: row.title,
      dealCustomer: row.customer_display_name,
      dealJid: row.whatsapp_jid,
      metadataJid: row.metadata?.remoteJid
    })));

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

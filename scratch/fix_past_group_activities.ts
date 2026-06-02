import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== STARTING RETROACTIVE CORRECTION FOR GROUP CHATS (NAME HEURISTIC) ===");

    // 1. Fetch all unique attendant names from sales/orders
    const salesRes = await pool.query(
      `
      SELECT DISTINCT COALESCE(NULLIF(last_attendant, ''), 'Sem atendente') AS attendant 
      FROM orders
      `
    );
    const attendants = salesRes.rows.map(r => r.attendant.trim().toLowerCase());
    console.log("CRM Attendants list for matching:", attendants);

    // 2. Fetch all WHATSAPP_RECEIVED group activities
    const activitiesRes = await pool.query(
      `
      SELECT
        da.id,
        da.deal_id,
        da.activity_type,
        da.actor_user_id,
        da.actor_name,
        da.metadata,
        da.created_at,
        (da.metadata ->> 'remoteJid')::text AS metadata_remote_jid,
        d.whatsapp_jid,
        d.title
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type = 'WHATSAPP_RECEIVED'
        AND (
          (da.metadata ->> 'remoteJid') LIKE '%@g.us'
          OR d.whatsapp_jid LIKE '%@g.us'
        )
      `
    );

    const activities = activitiesRes.rows;
    console.log(`Analyzing ${activities.length} group RECEIVED activities...`);

    let correctedCount = 0;

    for (const row of activities) {
      const name = row.actor_name ? row.actor_name.trim() : "";
      const lowerName = name.toLowerCase();
      
      if (lowerName === "sem atendente" || lowerName === "sem agente") {
        continue;
      }

      const isXpSeller = /^xp\s+/i.test(name) || 
                         attendants.includes(lowerName) || 
                         attendants.includes(lowerName.replace(/^xp\s+/i, '').trim());

      if (isXpSeller) {
        // Correct this activity!
        const activityId = row.id;

        // Build new metadata with outbound flags
        const originalMetadata = row.metadata || {};
        const newMetadata = {
          ...originalMetadata,
          fromMe: true,
          isOutbound: true,
          capturedFromWhatsapp: true,
          outboundSource: "whatsapp_device",
        };

        // 1. Update deal_activities to WHATSAPP_SENT
        await pool.query(
          `
          UPDATE deal_activities
          SET
            activity_type = 'WHATSAPP_SENT',
            metadata = $1::jsonb
          WHERE id = $2
          `,
          [JSON.stringify(newMetadata), activityId]
        );

        // 2. Update whatsapp_incoming_messages if exists
        const messageId = originalMetadata.messageId;
        if (messageId) {
          await pool.query(
            `
            UPDATE whatsapp_incoming_messages
            SET from_me = true
            WHERE message_id = $1
            `,
            [messageId]
          );
        }

        console.log(`[CORRECTED] Activity ${activityId} ("${name}") in deal "${row.title}"`);
        correctedCount++;
      }
    }

    console.log(`\n=== CORRECTION SUMMARY ===`);
    console.log(`Total activities analyzed: ${activities.length}`);
    console.log(`Total activities corrected: ${correctedCount}`);

  } catch (err) {
    console.error("Error executing retroactive correction:", err);
  } finally {
    await pool.end();
  }
}

run();

import { pool } from "./apps/api/src/config/database";

async function fixWhatsappHistory() {
  console.log("Starting WhatsApp history fix...");

  try {
    // 1. Fix the "All Green" bug: Messages in whatsapp_incoming_messages that evaluate to from_me = true, 
    // but the sender_jid is equal to remote_jid (which means it's a customer message misclassified due to the fallback).
    const greenFixResult = await pool.query(`
      UPDATE whatsapp_incoming_messages
      SET from_me = false
      WHERE from_me = true
        AND participant_jid = remote_jid
        AND is_group = false
      RETURNING id, remote_jid;
    `);
    
    console.log(`Fixed ${greenFixResult.rowCount} inbound messages that were incorrectly marked as OUTBOUND (Green).`);

    // 2. Fix the "All Gray" bug: Messages in deal_activities that have activity_type = 'WHATSAPP_RECEIVED' 
    // but actually originated from the host device (they have participant_jid != remote_jid or were sent by the host).
    // Wait, the easiest way to fix "All Gray" is to look at whatsapp_incoming_messages where participant_jid is NOT the remote_jid,
    // and is_group = false, and set from_me = true.
    const grayIncomingResult = await pool.query(`
      UPDATE whatsapp_incoming_messages
      SET from_me = true
      WHERE from_me = false
        AND is_group = false
        AND participant_jid IS NOT NULL
        AND participant_jid != remote_jid
      RETURNING id, message_id;
    `);

    console.log(`Fixed ${grayIncomingResult.rowCount} outbound messages in incoming_messages that were incorrectly marked as INBOUND (Gray).`);

    if (grayIncomingResult.rowCount && grayIncomingResult.rowCount > 0) {
      // Extract the fixed message IDs
      const fixedMessageIds = grayIncomingResult.rows.map(row => row.message_id);

      // Now update deal_activities to match!
      const grayActivitiesResult = await pool.query(`
        UPDATE deal_activities
        SET activity_type = 'WHATSAPP_SENT'
        WHERE activity_type = 'WHATSAPP_RECEIVED'
          AND metadata->>'messageId' = ANY($1)
      `, [fixedMessageIds]);

      console.log(`Fixed ${grayActivitiesResult.rowCount} deal_activities that were incorrectly marked as INBOUND (Gray).`);
    }

  } catch (err) {
    console.error("Error fixing history:", err);
  } finally {
    await pool.end();
    console.log("Done.");
  }
}

fixWhatsappHistory();

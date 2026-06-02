import { pool } from "../apps/api/src/db/client.js";
import { isInternalWhatsappReportChat, classifyWhatsappReportConversation } from "../apps/api/src/modules/whatsapp/whatsappMonitorService.js";

function resolveWhatsappActivityFromMe(
  row: any,
  metadata = (typeof row.metadata === 'object' && row.metadata !== null) ? row.metadata : {}
) {
  const optionalBoolean = (val: any) => {
    if (val === true || val === "true") return true;
    if (val === false || val === "false") return false;
    return null;
  };
  const providerFromMe = null; // emulado, já que incoming_raw_payload não está na query
  const storedIncomingFromMe = optionalBoolean(row.incoming_from_me);
  const metadataFromMe =
    optionalBoolean(metadata.fromMe) ??
    optionalBoolean(metadata.isOutbound) ??
    optionalBoolean(metadata.capturedFromWhatsapp) ??
    optionalBoolean(metadata.sentFromMonitor);

  return providerFromMe ?? storedIncomingFromMe ?? metadataFromMe;
}

function isWhatsappActivityOutbound(row: any) {
  const metadata = (typeof row.metadata === 'object' && row.metadata !== null) ? row.metadata : {};
  return resolveWhatsappActivityFromMe(row, metadata) ?? (String(row.activity_type) === "WHATSAPP_SENT");
}

async function run() {
  try {
    console.log("=== INVESTIGATING WHATSAPP GROUP ACTIVITIES ===");

    // Fetch the 50 most recent WhatsApp group activities (ended with @g.us)
    const activities = await pool.query(`
      SELECT
        da.id,
        da.activity_type,
        da.actor_user_id,
        da.actor_name,
        da.metadata,
        da.created_at,
        (da.metadata ->> 'remoteJid')::text AS metadata_remote_jid,
        d.whatsapp_jid,
        d.title,
        d.customer_display_name
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND (
          (da.metadata ->> 'remoteJid') LIKE '%@g.us'
          OR d.whatsapp_jid LIKE '%@g.us'
        )
      ORDER BY da.created_at DESC
      LIMIT 100
    `);

    console.log(`Found ${activities.rowCount} group activities.`);

    if (activities.rowCount === 0) {
      console.log("No group activities found in database. Checking all recent whatsapp activities with @g.us in any field...");
      const debugJids = await pool.query(`
        SELECT da.id, da.activity_type, da.metadata->>'remoteJid' as remote_jid, d.whatsapp_jid 
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        ORDER BY da.created_at DESC
        LIMIT 20
      `);
      console.table(debugJids.rows);
      return;
    }

    const sample = activities.rows.slice(0, 10);
    console.log("\n=== SAMPLE ACTIVITIES ===");
    const formattedSample = sample.map(row => {
      const remoteJid = String(row.metadata_remote_jid || row.whatsapp_jid || "");
      const isGroup = remoteJid.endsWith("@g.us");
      const isOutbound = isWhatsappActivityOutbound(row);
      const chatName = row.metadata_chat_display_name || row.customer_display_name || row.title || "";
      const isInternal = isInternalWhatsappReportChat({ name: chatName, remoteJid });
      return {
        id: row.id,
        type: row.activity_type,
        actor: row.actor_name,
        actor_id: row.actor_user_id,
        remoteJid,
        chatName,
        isGroup,
        isOutbound,
        isInternal,
      };
    });
    console.table(formattedSample);

    // Run the actual daily report logic for today or yesterday to see what's happening
    console.log("\n=== RUNNING SIMULATED DIALOG FOR RECENT ACTIVITIES ===");
    // Let's analyze how many are group, isOutbound, isInternal
    let stats = {
      total: activities.rowCount,
      isGroupCount: 0,
      isOutboundCount: 0,
      isInternalCount: 0,
      bothGroupAndOutbound: 0,
      bothGroupOutboundAndNotInternal: 0,
    };

    activities.rows.forEach(row => {
      const remoteJid = String(row.metadata_remote_jid || row.whatsapp_jid || "");
      const isGroup = remoteJid.endsWith("@g.us");
      const isOutbound = isWhatsappActivityOutbound(row);
      const chatName = row.metadata_chat_display_name || row.customer_display_name || row.title || "";
      const isInternal = isInternalWhatsappReportChat({ name: chatName, remoteJid });

      if (isGroup) stats.isGroupCount++;
      if (isOutbound) stats.isOutboundCount++;
      if (isInternal) stats.isInternalCount++;
      if (isGroup && isOutbound) stats.bothGroupAndOutbound++;
      if (isGroup && isOutbound && !isInternal) stats.bothGroupOutboundAndNotInternal++;
    });

    console.log("Calculated metrics for the retrieved 100 activities:");
    console.log(stats);

  } catch (err) {
    console.error("Error running investigation:", err);
  } finally {
    await pool.end();
  }
}

run();

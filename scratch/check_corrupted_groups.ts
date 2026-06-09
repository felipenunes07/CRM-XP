import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== CHECKING FOR CORRUPTED GROUP DEALS ===");

    const check = await pool.query(
      `SELECT d.id, d.title, d.customer_display_name, d.whatsapp_jid, wg.source_name
       FROM deals d
       JOIN whatsapp_groups wg ON wg.jid = d.whatsapp_jid
       WHERE d.whatsapp_jid LIKE '%@g.us'
         AND wg.source_name IS NOT NULL
         AND wg.source_name <> ''
         AND (
           d.title LIKE 'Grupo%'
           OR d.title LIKE '[GRUPO]%'
           OR d.title IS NULL
           OR d.title = ''
           OR EXISTS (
             SELECT 1 
             FROM whatsapp_incoming_messages wim 
             WHERE wim.remote_jid = d.whatsapp_jid 
               AND LOWER(wim.sender_name) = LOWER(d.title)
           )
         )`
    );

    console.log(`Found ${check.rowCount} group deals that can be repaired using whatsapp_groups:`);
    if (check.rowCount > 0) {
      console.table(check.rows);
    }

    // Let's also check for whatsapp_chat_profiles that have sender names as display_name for groups
    const profiles = await pool.query(
      `SELECT wcp.remote_jid, wcp.display_name, wg.source_name
       FROM whatsapp_chat_profiles wcp
       JOIN whatsapp_groups wg ON wg.jid = wcp.remote_jid
       WHERE wcp.remote_jid LIKE '%@g.us'
         AND wcp.display_name <> wg.source_name`
    );
    console.log(`\nFound ${profiles.rowCount} group chat profiles that differ from whatsapp_groups:`);
    if (profiles.rowCount > 0) {
      console.table(profiles.rows);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

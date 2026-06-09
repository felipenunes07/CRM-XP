import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== STARTING GROUP REPAIR OPERATIONS ===");

    // 1. Repair group deals using source_name from whatsapp_groups
    const dealsRepair = await pool.query(
      `UPDATE deals d
       SET 
         title = COALESCE(NULLIF(wg.source_name, ''), d.title),
         customer_display_name = COALESCE(NULLIF(wg.source_name, ''), d.customer_display_name)
       FROM whatsapp_groups wg
       WHERE wg.jid = d.whatsapp_jid
         AND d.whatsapp_jid LIKE '%@g.us'
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
         )
       RETURNING d.id, d.title, d.whatsapp_jid`
    );
    console.log(`Repaired ${dealsRepair.rowCount} group deals in 'deals' table.`);
    if (dealsRepair.rowCount > 0) {
      console.table(dealsRepair.rows);
    }

    // 2. Stripping leftover "[GRUPO]" prefix from other group deals
    const prefixRepair = await pool.query(
      `UPDATE deals
       SET 
         title = regexp_replace(regexp_replace(title, '^\\s*\\[?GRUPO\\]?\\s*-\\s*', '', 'i'), '^\\s*\\[?GRUPO\\]?\\s*', '', 'i'),
         customer_display_name = regexp_replace(regexp_replace(customer_display_name, '^\\s*\\[?GRUPO\\]?\\s*-\\s*', '', 'i'), '^\\s*\\[?GRUPO\\]?\\s*', '', 'i')
       WHERE whatsapp_jid LIKE '%@g.us'
         AND (title LIKE '[GRUPO]%' OR title LIKE 'GRUPO%' OR customer_display_name LIKE '[GRUPO]%' OR customer_display_name LIKE 'GRUPO%')
       RETURNING id, title, whatsapp_jid`
    );
    console.log(`Stripped prefix from ${prefixRepair.rowCount} remaining group deals.`);
    if (prefixRepair.rowCount > 0) {
      console.table(prefixRepair.rows);
    }

    // 3. Repair corrupted group chat profiles using whatsapp_groups
    const profilesRepair = await pool.query(
      `UPDATE whatsapp_chat_profiles wcp
       SET display_name = wg.source_name
       FROM whatsapp_groups wg
       WHERE wg.jid = wcp.remote_jid
         AND wcp.remote_jid LIKE '%@g.us'
         AND wg.source_name IS NOT NULL
         AND wg.source_name <> ''
         AND wcp.display_name <> wg.source_name
       RETURNING wcp.remote_jid, wcp.display_name`
    );
    console.log(`Repaired ${profilesRepair.rowCount} group chat profiles.`);
    if (profilesRepair.rowCount > 0) {
      console.table(profilesRepair.rows);
    }

    // 4. Force clean up any group profiles where the display_name is equal to a sender name (corrupted fallback)
    const senderCorruptRepair = await pool.query(
      `UPDATE whatsapp_chat_profiles wcp
       SET display_name = COALESCE(
         (SELECT source_name FROM whatsapp_groups wg WHERE wg.jid = wcp.remote_jid LIMIT 1),
         (SELECT chat_display_name FROM whatsapp_incoming_messages wim WHERE wim.remote_jid = wcp.remote_jid AND wim.chat_display_name IS NOT NULL AND wim.chat_display_name <> '' LIMIT 1),
         wcp.display_name
       )
       WHERE wcp.remote_jid LIKE '%@g.us'
         AND EXISTS (
           SELECT 1 
           FROM whatsapp_incoming_messages wim 
           WHERE wim.remote_jid = wcp.remote_jid 
             AND LOWER(wim.sender_name) = LOWER(wcp.display_name)
         )
       RETURNING wcp.remote_jid, wcp.display_name`
    );
    console.log(`Repaired ${senderCorruptRepair.rowCount} corrupted sender-name group profiles.`);
    if (senderCorruptRepair.rowCount > 0) {
      console.table(senderCorruptRepair.rows);
    }

    console.log("=== GROUP REPAIR COMPLETED SUCCESSFULLY ===");
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

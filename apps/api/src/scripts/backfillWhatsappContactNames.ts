/**
 * One-off backfill: materialize the contact display name (WhatsApp pushName)
 * into whatsapp_chat_profiles for 1:1 chats, so conversations stop showing the
 * bare phone number. Source = the most recent inbound message pushName per
 * (instance, jid). Only fills names that are currently empty (never overwrites).
 *
 * Run on the server:
 *   npx tsx apps/api/src/scripts/backfillWhatsappContactNames.ts
 */
import { pool } from "../db/client.js";

async function main() {
  const result = await pool.query(
    `INSERT INTO whatsapp_chat_profiles (instance_name, remote_jid, display_name, is_group, last_synced_at)
     SELECT DISTINCT ON (COALESCE(instance_name, ''), remote_jid)
       COALESCE(instance_name, ''), remote_jid, sender_name, false, NOW()
     FROM whatsapp_incoming_messages
     WHERE from_me = false
       AND NULLIF(sender_name, '') IS NOT NULL
       AND remote_jid IS NOT NULL
       AND remote_jid NOT LIKE '%@g.us'
     ORDER BY COALESCE(instance_name, ''), remote_jid, created_at DESC
     ON CONFLICT (instance_name, remote_jid) DO UPDATE
       SET display_name = COALESCE(NULLIF(whatsapp_chat_profiles.display_name, ''), EXCLUDED.display_name),
           last_synced_at = NOW()`,
  );

  console.log(`backfill de nomes concluido: ${result.rowCount ?? 0} perfis afetados`);
  await pool.end();
}

main().catch((error) => {
  console.error("backfill de nomes falhou:", error);
  process.exit(1);
});

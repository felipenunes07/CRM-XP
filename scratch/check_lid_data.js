const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // 1. Let's look at some rows in whatsapp_chat_profiles where remote_jid ends with @lid
  const profiles = await pool.query(`
    SELECT remote_jid, display_name, updated_at
    FROM whatsapp_chat_profiles
    WHERE remote_jid LIKE '%@lid'
    LIMIT 20
  `);
  console.log("\n--- LIDs IN whatsapp_chat_profiles ---");
  for (const row of profiles.rows) {
    console.log(`JID: ${row.remote_jid} | Name: ${row.display_name}`);
  }

  // 2. Let's look at whatsapp_incoming_messages where participant_jid or remote_jid is a @lid
  const incoming = await pool.query(`
    SELECT id, remote_jid, participant_jid, sender_name, raw_payload, created_at
    FROM whatsapp_incoming_messages
    WHERE remote_jid LIKE '%@lid' OR participant_jid LIKE '%@lid'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log("\n--- LIDs IN whatsapp_incoming_messages ---");
  for (const row of incoming.rows) {
    console.log(`MsgID: ${row.id} | RemoteJID: ${row.remote_jid} | PartJID: ${row.participant_jid} | Sender: ${row.sender_name} | Raw keys: ${Object.keys(row.raw_payload || {})}`);
    // Print a bit of raw_payload key structure
    if (row.raw_payload && row.raw_payload.key) {
      console.log(`  Key: ${JSON.stringify(row.raw_payload.key)}`);
    }
  }

  pool.end();
}

run().catch(console.error);

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // Let's find any message where participant or remoteJid has a LID and phone PN link
  const res = await pool.query(`
    SELECT DISTINCT
      participant_jid as lid,
      raw_payload -> 'key' ->> 'participantPn' as phone_net
    FROM whatsapp_incoming_messages
    WHERE participant_jid LIKE '%@lid'
      AND raw_payload -> 'key' ->> 'participantPn' IS NOT NULL
  `);
  console.log("\n--- INCOMING MESSAGES LID-PHONE MAPPINGS ---");
  console.table(res.rows);

  // Let's also check if there are other fields in raw_payload that map LID to Phone
  const sample = await pool.query(`
    SELECT id, remote_jid, raw_payload
    FROM whatsapp_incoming_messages
    WHERE remote_jid LIKE '%@lid'
    LIMIT 10
  `);
  console.log("\n--- SAMPLE OF @lid MESSAGES PAYLOADS ---");
  for (const row of sample.rows) {
    console.log(`MsgID: ${row.id} | RemoteJID: ${row.remote_jid}`);
    console.log(JSON.stringify(row.raw_payload, null, 2));
  }

  pool.end();
}

run().catch(console.error);

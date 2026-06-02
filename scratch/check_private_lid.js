const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // Let's find any whatsapp_incoming_messages where remote_jid ends with @lid and list full raw_payload
  const incoming = await pool.query(`
    SELECT id, remote_jid, sender_name, raw_payload, created_at
    FROM whatsapp_incoming_messages
    WHERE remote_jid LIKE '%@lid'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  
  console.log("\n--- PRIVATE @lid MESSAGES RAW PAYLOADS ---");
  for (const row of incoming.rows) {
    console.log(`MsgID: ${row.id} | RemoteJID: ${row.remote_jid} | Sender: ${row.sender_name}`);
    console.log(JSON.stringify(row.raw_payload, null, 2));
    console.log("-------------------------------------------------");
  }

  pool.end();
}

run().catch(console.error);

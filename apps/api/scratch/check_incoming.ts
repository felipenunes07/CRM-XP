import { pool } from "../src/db/client.js";

async function run() {
  try {
    const result = await pool.query(`
      SELECT id, remote_jid, sender_name, message_text, from_me, created_at,
             raw_payload->'message' IS NOT NULL as has_raw_message,
             raw_payload->'base64' IS NOT NULL or raw_payload->'media' IS NOT NULL or raw_payload->'mediaBase64' IS NOT NULL as has_base64
      FROM whatsapp_incoming_messages
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log("RECENT MESSAGES:");
    console.table(result.rows.map(row => ({
      id: row.id,
      jid: row.remote_jid,
      name: row.sender_name,
      text: (row.message_text || "").slice(0, 40),
      fromMe: row.from_me,
      hasMsg: row.has_raw_message,
      hasB64: row.has_base64,
      time: row.created_at
    })));

  } catch (error) {
    console.error("Error running database query:", error);
  } finally {
    await pool.end();
  }
}

run();

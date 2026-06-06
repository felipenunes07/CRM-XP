import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const res = await pool.query(
      `SELECT remote_jid, sender_name, participant_name, chat_display_name, message_text, from_me, created_at 
       FROM whatsapp_incoming_messages 
       WHERE remote_jid = '120363155567349673@g.us'
       ORDER BY created_at ASC`
    );
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

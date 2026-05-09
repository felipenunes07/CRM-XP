import { pool } from "../apps/api/src/db/client.js";

async function test() {
  try {
    const res = await pool.query(`
      SELECT id, remote_jid, sender_name, message_text, created_at, from_me 
      FROM whatsapp_incoming_messages 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
test();

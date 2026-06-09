import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const res = await pool.query(
      `SELECT remote_jid, display_name, profile_picture_url, updated_at
       FROM whatsapp_chat_profiles 
       WHERE remote_jid LIKE '%@g.us'
       LIMIT 10`
    );
    console.log("whatsapp_chat_profiles group rows:");
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

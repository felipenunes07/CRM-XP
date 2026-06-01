import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const res = await pool.query(`
      SELECT da.*, d.whatsapp_jid 
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.id = 'dd22237d-5da0-40c2-bddf-35e54fa958c1'
    `);
    console.log("=== SINGLE ACTIVITY ===");
    console.log(JSON.stringify(res.rows[0], null, 2));

    // Also let's check the corresponding incoming message
    if (res.rows[0]) {
      const messageId = res.rows[0].metadata?.messageId;
      if (messageId) {
        const msgRes = await pool.query(`
          SELECT * FROM whatsapp_incoming_messages 
          WHERE message_id = $1
        `, [messageId]);
        console.log("\n=== CORRESPONDING INCOMING MESSAGE ===");
        console.log(JSON.stringify(msgRes.rows[0], null, 2));
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

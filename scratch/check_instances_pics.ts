import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const res = await pool.query(
      `SELECT id, instance_name, display_label, profile_picture_url, status
       FROM whatsapp_instances`
    );
    console.log("=== WHATSAPP INSTANCES ===");
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

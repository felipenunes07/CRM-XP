import { pool } from "../src/db/client.js";

async function run() {
  try {
    const result = await pool.query("SELECT id, instance_name, display_label, phone_number, provider, uazapi_base_url, uazapi_token, status FROM whatsapp_instances");
    console.log("=== WHATSAPP INSTANCES IN DB ===");
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    await pool.end();
  }
}

run();

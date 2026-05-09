
import { pool } from '../apps/api/src/db/client.js';

async function main() {
  try {
    const res = await pool.query("SELECT * FROM whatsapp_instances");
    console.log("Instances:", JSON.stringify(res.rows, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

main();

import { pool } from "../src/db/client.js";

async function run() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'whatsapp_instances'
    `);
    console.log("=== COLUMNS IN whatsapp_instances ===");
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error("Error querying columns:", error);
  } finally {
    await pool.end();
  }
}

run();

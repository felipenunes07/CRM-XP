import { pool } from "../src/db/client.js";

async function run() {
  const whatsappInstanceId = "8ad92bbf-792d-47e1-82b7-fd4311a81983"; // Ragnar ID
  try {
    const result = await pool.query(
      `SELECT 
        provider, 
        evolution_instance_name, 
        evolution_base_url, 
        evolution_api_key, 
        uazapi_base_url, 
        uazapi_token,
        display_label
      FROM whatsapp_instances 
      WHERE id = $1`,
      [whatsappInstanceId]
    );
    console.log("Result:", result.rows);
  } catch (error: any) {
    console.error("Query failed with error:", error.message);
  } finally {
    await pool.end();
  }
}

run();

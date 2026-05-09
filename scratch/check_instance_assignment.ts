import { pool } from "../apps/api/src/db/client.js";

async function test() {
  try {
    const res = await pool.query(`
      SELECT instance_name, assigned_user_name, assigned_user_id 
      FROM whatsapp_instances
    `);
    console.table(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
test();

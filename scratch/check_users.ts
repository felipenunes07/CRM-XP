import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const res = await pool.query("SELECT id, name, role FROM users");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();


import { pool } from '../apps/api/src/db/client.ts';

async function main() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("Tables:", res.rows.map(r => r.table_name));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

main();

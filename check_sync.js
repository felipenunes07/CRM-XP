const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("=== LAST SYNC RUNS ===");
  try {
    const res = await pool.query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 10");
    console.table(res.rows);
  } catch (err) {
    console.error("Error sync_runs:", err.message);
  }

  console.log("\n=== LAST IMPORT RUNS ===");
  try {
    const res = await pool.query("SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 10");
    console.table(res.rows);
  } catch (err) {
    console.error("Error import_runs:", err.message);
  }

  await pool.end();
}

run();

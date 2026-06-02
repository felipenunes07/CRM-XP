const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Checking migrations...");
  try {
    const migrationsRes = await pool.query(`SELECT * FROM migrations ORDER BY version;`);
    console.table(migrationsRes.rows);
  } catch (err) {
    console.error("Error checking migrations:", err);
  } finally {
    await pool.end();
  }
}

run();

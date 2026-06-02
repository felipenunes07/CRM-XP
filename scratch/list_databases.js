const { Pool } = require('pg');
require('dotenv').config();

// Connect using default postgres database to see all databases
const connectionString = process.env.DATABASE_URL.replace(/\/olist_crm$/, "/postgres");
const pool = new Pool({ connectionString });

async function run() {
  console.log("Listing databases...");
  try {
    const res = await pool.query(`SELECT datname FROM pg_database WHERE datistemplate = false;`);
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();

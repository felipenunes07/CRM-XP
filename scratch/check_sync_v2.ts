import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    console.log("Checking sync_runs...");
    const syncRuns = await pool.query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 10");
    console.table(syncRuns.rows);

    console.log("\nChecking import_runs...");
    const importRuns = await pool.query("SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 10");
    console.table(importRuns.rows);

    console.log("\nChecking last sync dates...");
    const lastDates = await pool.query("SELECT source_system, MAX(sale_date) as last_sale FROM sales_raw GROUP BY source_system");
    console.table(lastDates.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();

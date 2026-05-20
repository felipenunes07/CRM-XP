import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    const importRuns = await pool.query(`
      SELECT ir.status, ir.started_at, ir.finished_at, sf.file_name
      FROM import_runs ir
      JOIN source_files sf ON sf.id = ir.source_file_id
      ORDER BY ir.started_at DESC LIMIT 5
    `);
    console.log("IMPORT RUNS:");
    importRuns.rows.forEach(r => console.log(`${r.file_name}: ${r.status} started at ${r.started_at}, finished at ${r.finished_at}`));

    const syncRuns = await pool.query("SELECT status, started_at, finished_at FROM sync_runs ORDER BY started_at DESC LIMIT 5");
    console.log("\nSYNC RUNS:");
    syncRuns.rows.forEach(r => console.log(`${r.status} started at ${r.started_at}, finished at ${r.finished_at}`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();

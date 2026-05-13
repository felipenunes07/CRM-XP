import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5432/olist_crm"
});

async function check() {
  try {
    const importRuns = await pool.query(`
      SELECT ir.status, ir.finished_at, sf.file_name
      FROM import_runs ir
      JOIN source_files sf ON sf.id = ir.source_file_id
      ORDER BY ir.started_at DESC LIMIT 5
    `);
    console.log("IMPORT RUNS:");
    importRuns.rows.forEach(r => console.log(`${r.file_name}: ${r.status} at ${r.finished_at}`));

    const syncRuns = await pool.query("SELECT status, finished_at FROM sync_runs ORDER BY started_at DESC LIMIT 5");
    console.log("\nSYNC RUNS:");
    syncRuns.rows.forEach(r => console.log(`${r.status} at ${r.finished_at}`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();

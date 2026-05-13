import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://postgres:postgres@localhost:5432/olist_crm"
});

async function check() {
  try {
    console.log("Checking import_runs...");
    const importRuns = await pool.query(`
      SELECT ir.id, ir.status, ir.started_at, ir.finished_at, sf.file_name
      FROM import_runs ir
      JOIN source_files sf ON sf.id = ir.source_file_id
      ORDER BY ir.started_at DESC LIMIT 5
    `);
    console.table(importRuns.rows);

    console.log("\nChecking sync_runs...");
    const syncRuns = await pool.query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 5");
    console.table(syncRuns.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();

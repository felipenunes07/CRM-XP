
import pg from "pg";
import fs from "node:fs/promises";

const DATABASE_URL = "postgresql://postgres:9630Jinren@localhost:5432/olist_crm?sslmode=disable";

async function check() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const snapshots = await pool.query("SELECT * FROM customer_credit_snapshots ORDER BY imported_at DESC LIMIT 1");
    console.log("Latest Snapshot:", snapshots.rows[0] || "None");

    if (snapshots.rows[0]) {
      const rows = await pool.query("SELECT COUNT(*) FROM customer_credit_snapshot_rows WHERE snapshot_id = $1", [snapshots.rows[0].id]);
      console.log("Rows in snapshot:", rows.rows[0].count);
    }

    const dir = "C:\\Users\\Felipe\\Dropbox\\XP SALDO TEMPORARIO";
    console.log("Looking for files in:", dir);

    try {
      const entries = await fs.readdir(dir);
      console.log("Files found:", entries.filter(e => e.toLowerCase().endsWith(".xlsx")));
    } catch (e) {
      console.log("Error reading directory:", e.message);
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
    process.exit();
  }
}

check();

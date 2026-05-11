
import { pool } from "../apps/api/src/db/client.js";
import fs from "node:fs/promises";
import { env } from "../apps/api/src/lib/env.js";

async function check() {
  try {
    const snapshots = await pool.query("SELECT * FROM customer_credit_snapshots ORDER BY imported_at DESC LIMIT 1");
    console.log("Latest Snapshot:", snapshots.rows[0] || "None");

    if (snapshots.rows[0]) {
      const rows = await pool.query("SELECT COUNT(*) FROM customer_credit_snapshot_rows WHERE snapshot_id = $1", [snapshots.rows[0].id]);
      console.log("Rows in snapshot:", rows.rows[0].count);
    }

    console.log("Looking for files in:", env.CUSTOMER_CREDIT_WORKBOOK_DIR);
    console.log("Prefix:", env.CUSTOMER_CREDIT_WORKBOOK_PREFIX);

    try {
      const entries = await fs.readdir(env.CUSTOMER_CREDIT_WORKBOOK_DIR);
      console.log("Files found:", entries.filter(e => e.toLowerCase().endsWith(".xlsx")));
    } catch (e) {
      console.log("Error reading directory:", e.message);
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    process.exit();
  }
}

check();

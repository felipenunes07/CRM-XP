require("dotenv").config({ path: "apps/api/.env" });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    const res = await pool.query(`
      WITH latest_daily_snapshots AS (
        SELECT DISTINCT ON (snapshot_day)
          id,
          imported_at,
          snapshot_day
        FROM (
          SELECT
            id,
            imported_at,
            imported_at::date AS snapshot_day
          FROM inventory_snapshots
        ) snapshots
        ORDER BY snapshot_day DESC, imported_at DESC
      ),
      recent_snapshots AS (
        SELECT id, imported_at
        FROM latest_daily_snapshots
        ORDER BY imported_at DESC
        LIMIT 5
      )
      SELECT 
        s.id AS "snapshotId",
        s.imported_at::date::text AS date,
        COUNT(DISTINCT isi.model) as total_models,
        COUNT(DISTINCT CASE WHEN isi.stock_quantity > 0 THEN isi.model END) as active_models,
        SUM(isi.stock_quantity) as total_stock
      FROM recent_snapshots rs
      JOIN inventory_snapshots s ON s.id = rs.id
      JOIN inventory_snapshot_items isi ON isi.snapshot_id = s.id
      GROUP BY s.id, s.imported_at
      ORDER BY s.imported_at ASC
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();

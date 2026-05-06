const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm?sslmode=disable'
});

async function run() {
  // Delete the snapshot from today (May 6) that was auto-created on startup
  const del = await pool.query(`DELETE FROM inventory_snapshots WHERE imported_at::date = '2026-05-06'`);
  console.log('Deleted today snapshots:', del.rowCount);

  // Make sure the May 5 one is active
  await pool.query(`UPDATE inventory_snapshots SET is_active = TRUE WHERE id = '479a67af-7346-4575-8576-717b1a003c28'`);

  // Verify
  const check = await pool.query('SELECT id, imported_at, is_active FROM inventory_snapshots ORDER BY imported_at');
  console.table(check.rows);

  pool.end();
}

run().catch(console.error);

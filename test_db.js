const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm?sslmode=disable'
});

async function run() {
  // Delete all snapshots except the one from May 5th
  const result = await pool.query(`
    DELETE FROM inventory_snapshots 
    WHERE id != '479a67af-7346-4575-8576-717b1a003c28'
  `);
  console.log('Deleted snapshots:', result.rowCount);
  
  // Make the remaining one active
  await pool.query(`UPDATE inventory_snapshots SET is_active = TRUE`);
  pool.end();
}

run().catch(console.error);

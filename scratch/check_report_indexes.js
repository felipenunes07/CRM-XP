const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // Get indexes for orders
  const ordersIndexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'orders'
  `);
  console.log("\n--- INDEXES ON orders ---");
  for (const row of ordersIndexes.rows) {
    console.log(`Index: ${row.indexname} | Def: ${row.indexdef}`);
  }

  // Get indexes for order_items
  const orderItemsIndexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'order_items'
  `);
  console.log("\n--- INDEXES ON order_items ---");
  for (const row of orderItemsIndexes.rows) {
    console.log(`Index: ${row.indexname} | Def: ${row.indexdef}`);
  }

  pool.end();
}

run().catch(console.error);

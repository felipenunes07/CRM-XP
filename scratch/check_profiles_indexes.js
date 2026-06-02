const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // Get indexes for whatsapp_chat_profiles
  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'whatsapp_chat_profiles'
  `);
  console.log("\n--- INDEXES ON whatsapp_chat_profiles ---");
  for (const row of indexes.rows) {
    console.log(`Index: ${row.indexname} | Def: ${row.indexdef}`);
  }

  pool.end();
}

run().catch(console.error);

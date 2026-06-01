const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // 1. Get indexes for deal_activities
  const dealActivitiesIndexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'deal_activities'
  `);
  console.log("\n--- INDEXES ON deal_activities ---");
  for (const row of dealActivitiesIndexes.rows) {
    console.log(`Index: ${row.indexname} | Def: ${row.indexdef}`);
  }

  // 2. Get indexes for whatsapp_incoming_messages
  const incomingMessagesIndexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'whatsapp_incoming_messages'
  `);
  console.log("\n--- INDEXES ON whatsapp_incoming_messages ---");
  for (const row of incomingMessagesIndexes.rows) {
    console.log(`Index: ${row.indexname} | Def: ${row.indexdef}`);
  }

  // 3. Let's count rows in key tables to understand the volume
  const counts = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM deals)::int as deals_count,
      (SELECT COUNT(*) FROM deal_activities)::int as activities_count,
      (SELECT COUNT(*) FROM whatsapp_incoming_messages)::int as incoming_count
  `);
  console.log("\n--- TABLE ROW COUNTS ---");
  console.table(counts.rows);

  pool.end();
}

run().catch(console.error);

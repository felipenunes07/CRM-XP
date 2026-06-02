const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // Let's find distinct activity types for whatsapp
  const types = await pool.query(`
    SELECT activity_type, COUNT(*) as count
    FROM deal_activities
    WHERE activity_type LIKE '%WHATSAPP%'
    GROUP BY activity_type
  `);
  console.log("\n--- WHATSAPP ACTIVITY TYPES ---");
  console.table(types.rows);

  // Let's get sample of activities that have metadata
  const sample = await pool.query(`
    SELECT id, activity_type, actor_name, 
           metadata
    FROM deal_activities
    WHERE activity_type LIKE '%WHATSAPP%'
    ORDER BY created_at DESC
    LIMIT 50
  `);
  console.log("\n--- SAMPLE OF WHATSAPP ACTIVITIES AND METADATA ---");
  for (const row of sample.rows) {
    console.log(`Type: ${row.activity_type} | Actor: ${row.actor_name} | Metadata: ${JSON.stringify(row.metadata)}`);
  }

  pool.end();
}

run().catch(console.error);

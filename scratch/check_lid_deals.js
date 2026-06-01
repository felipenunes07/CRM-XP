const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // Let's find any deals where whatsapp_jid ends with @lid or is just digits
  const deals = await pool.query(`
    SELECT id, title, whatsapp_jid, customer_display_name, last_activity_at
    FROM deals
    WHERE whatsapp_jid LIKE '%@lid' OR whatsapp_jid NOT LIKE '%@s.whatsapp.net'
  `);
  console.log("\n--- DEALS WITH NON-STANDARD JIDs ---");
  for (const row of deals.rows) {
    console.log(`ID: ${row.id} | Title: ${row.title} | JID: ${row.whatsapp_jid} | Customer: ${row.customer_display_name}`);
  }

  pool.end();
}

run().catch(console.error);

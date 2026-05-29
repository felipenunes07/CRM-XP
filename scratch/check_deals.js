const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Checking deals for groups from logs...");
  
  const resDeals = await pool.query(
    "SELECT id, title, whatsapp_jid, created_at FROM deals WHERE whatsapp_jid IN ($1, $2)",
    ["120363044132316737@g.us", "120363288987872472@g.us"]
  );
  
  console.log("Deals found:", resDeals.rowCount);
  console.table(resDeals.rows);
  
  const resActivitiesCount = await pool.query(
    "SELECT count(*)::int as count FROM deal_activities WHERE deal_id IN (SELECT id FROM deals WHERE whatsapp_jid IN ($1, $2))",
    ["120363044132316737@g.us", "120363288987872472@g.us"]
  );
  console.log("Total deal activities for these groups:", resActivitiesCount.rows[0].count);

  pool.end();
}

run().catch(console.error);

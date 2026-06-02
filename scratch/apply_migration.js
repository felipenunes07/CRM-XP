const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Applying database index...");
  const res = await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wcr_group_id_status_sent 
    ON whatsapp_campaign_recipients(group_id, status) 
    WHERE status = 'SENT';
  `);
  console.log("Database index applied successfully!");
  pool.end();
}

run().catch(console.error);

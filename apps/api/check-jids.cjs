const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function run() {
  try {
    const result = await pool.query(`
      SELECT id, campaign_id, jid, customer_display_name, status
      FROM whatsapp_campaign_recipients
      LIMIT 50
    `);
    console.log("=== RECIPIENTS JIDS ===");
    console.log(result.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

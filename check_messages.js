const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("=== CHECKING MESSAGES IN JUNE 2026 ===");
  try {
    const campaignsRes = await pool.query(`
      SELECT id, name, status, created_at
      FROM whatsapp_campaigns
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log("whatsapp_campaigns count:", campaignsRes.rows.length);
    console.table(campaignsRes.rows);
  } catch (err) {
    console.error("Error checking campaigns:", err.message);
  }

  try {
    const customersCount = await pool.query("SELECT COUNT(*)::int as count FROM customers");
    const groupsCount = await pool.query("SELECT COUNT(*)::int as count FROM whatsapp_groups");
    const recipientsCount = await pool.query("SELECT COUNT(*)::int as count FROM whatsapp_campaign_recipients");
    console.log("Customers Count:", customersCount.rows[0].count);
    console.log("WhatsApp Groups Count:", groupsCount.rows[0].count);
    console.log("Recipients Count:", recipientsCount.rows[0].count);
  } catch (err) {
    console.error("Error checking counts:", err.message);
  }

  try {
    const rollupsRes = await pool.query(`
      SELECT period_date, SUM(sent_messages)::int as sent, SUM(received_messages)::int as received, COUNT(*)::int as count
      FROM whatsapp_activity_rollups
      WHERE period_date >= '2026-06-01'
      GROUP BY period_date
      ORDER BY period_date DESC
    `);
    console.log("whatsapp_activity_rollups in June:");
    console.table(rollupsRes.rows);
  } catch (err) {
    console.error("Error checking rollups:", err.message);
  }

  await pool.end();
}

run();

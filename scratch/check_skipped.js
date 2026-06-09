const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkSkipped() {
  try {
    // Find the campaign that has these recipients
    const res = await pool.query(`
      SELECT c.id, c.name, c.status as campaign_status, c.cancelled_at, c.updated_at
      FROM whatsapp_campaign_recipients r
      JOIN whatsapp_campaigns c ON c.id = r.campaign_id
      WHERE r.jid = '120363422108376080@g.us'
      LIMIT 1
    `);
    
    const campaign = res.rows[0];
    if (!campaign) {
      console.log("Campaign not found");
      return;
    }
    
    console.log("Campaign Details:", campaign);
    
    // Get the recipients
    const recipients = await pool.query(`
      SELECT jid, status, scheduled_for, skipped_at, sent_at, failed_at, updated_at
      FROM whatsapp_campaign_recipients
      WHERE campaign_id = $1
      ORDER BY updated_at ASC
    `, [campaign.id]);
    
    console.log("Recipients Count:", recipients.rowCount);
    console.log("First 15 recipients:", recipients.rows.slice(0, 15));
    
  } catch (error) {
    console.error(error);
  } finally {
    pool.end();
  }
}

checkSkipped();

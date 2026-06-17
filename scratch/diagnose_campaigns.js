const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Analyzing local database...");
  try {
    // 1. Check campaigns count and status
    const campaigns = await pool.query(`
      SELECT id, name, status, created_at
      FROM whatsapp_campaigns
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.log("\n--- Latest Campaigns ---");
    console.table(campaigns.rows);

    // 2. Check recipients status count for latest campaign
    if (campaigns.rows.length > 0) {
      const latestCampaignId = campaigns.rows[0].id;
      const latestCampaignName = campaigns.rows[0].name;
      console.log(`\n--- Recipient Status for Latest Campaign: ${latestCampaignName} (${latestCampaignId}) ---`);
      const statuses = await pool.query(`
        SELECT status, count(*)::int
        FROM whatsapp_campaign_recipients
        WHERE campaign_id = $1
        GROUP BY status;
      `, [latestCampaignId]);
      console.table(statuses.rows);
      
      // Also show any recipients in SENDING state across all campaigns
      console.log("\n--- Recipients currently in SENDING state across all campaigns ---");
      const sendingRecipients = await pool.query(`
        SELECT r.id, r.campaign_id, r.jid, r.status, r.last_attempt_at, wc.name as campaign_name
        FROM whatsapp_campaign_recipients r
        JOIN whatsapp_campaigns wc ON wc.id = r.campaign_id
        WHERE r.status = 'SENDING';
      `);
      console.table(sendingRecipients.rows);
    }

    // 3. Check for any active locks or blocked queries in Postgres
    console.log("\n--- Active Database Queries / Locks ---");
    const locks = await pool.query(`
      SELECT pid, age(clock_timestamp(), query_start), usename, state, query
      FROM pg_stat_activity
      WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%';
    `);
    console.table(locks.rows);

  } catch (err) {
    console.error("Error during analysis:", err);
  } finally {
    await pool.end();
  }
}

run();

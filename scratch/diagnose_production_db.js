const { Pool } = require('pg');
require('dotenv').config();

const productionUrl = process.env.SUPABASE_DATABASE_URL;

if (!productionUrl) {
  console.error("SUPABASE_DATABASE_URL is not set in the environment variables!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: productionUrl
});

async function run() {
  console.log("Connecting to production database...");
  try {
    const campaigns = await pool.query(`
      SELECT id, name, status, created_at
      FROM whatsapp_campaigns
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log("\n--- Latest Production Campaigns ---");
    console.table(campaigns.rows);

    if (campaigns.rows.length > 0) {
      const latestId = campaigns.rows[0].id;
      const latestName = campaigns.rows[0].name;
      console.log(`\n--- Recipient Status for Latest Campaign in Production: ${latestName} (${latestId}) ---`);
      
      const statuses = await pool.query(`
        SELECT status, count(*)::int
        FROM whatsapp_campaign_recipients
        WHERE campaign_id = $1
        GROUP BY status;
      `, [latestId]);
      console.table(statuses.rows);

      // Check for any FAILED or PENDING or SENDING recipients
      console.log(`\n--- Latest 10 recipients detail for ${latestId} ---`);
      const details = await pool.query(`
        SELECT id, jid, status, scheduled_for, last_attempt_at, last_error
        FROM whatsapp_campaign_recipients
        WHERE campaign_id = $1
        ORDER BY updated_at DESC
        LIMIT 10;
      `, [latestId]);
      console.table(details.rows);
    }

    // Check database locks
    console.log("\n--- Active Database Queries / Locks in Production ---");
    const locks = await pool.query(`
      SELECT pid, age(clock_timestamp(), query_start), state, query
      FROM pg_stat_activity
      WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%';
    `);
    console.table(locks.rows);

  } catch (err) {
    console.error("Error connected to production database:", err);
  } finally {
    await pool.end();
  }
}

run();

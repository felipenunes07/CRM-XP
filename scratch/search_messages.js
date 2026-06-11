const { Pool } = require('pg');
require('dotenv').config();

async function checkDb(url, label) {
  if (!url) {
    console.log(`[${label}] URL not found in env.`);
    return;
  }
  console.log(`\n=== CHECKING DB [${label}] ===`);
  const pool = new Pool({ connectionString: url });
  try {
    const totalIncoming = await pool.query("SELECT COUNT(*)::int as count FROM whatsapp_incoming_messages");
    const totalActivities = await pool.query("SELECT COUNT(*)::int as count FROM deal_activities");
    const totalRecipients = await pool.query("SELECT COUNT(*)::int as count FROM whatsapp_campaign_recipients");
    console.log("Total incoming:", totalIncoming.rows[0].count);
    console.log("Total activities:", totalActivities.rows[0].count);
    console.log("Total recipients:", totalRecipients.rows[0].count);

    if (totalIncoming.rows[0].count > 0 || totalRecipients.rows[0].count > 0) {
      console.log("Searching for messages in incoming or activities...");
      const res = await pool.query(`
        SELECT id::text, remote_jid, sender_name, message_text, created_at, from_me
        FROM whatsapp_incoming_messages
        WHERE message_text ILIKE '%print%' OR message_text ILIKE '%pagamos%' OR message_text ILIKE '%proxima%' OR message_text ILIKE '%manda%'
        LIMIT 10
      `);
      console.log("Matches in incoming:");
      console.table(res.rows);

      const res2 = await pool.query(`
        SELECT id::text, content as message_text, actor_name as sender_name, created_at
        FROM deal_activities
        WHERE content ILIKE '%print%' OR content ILIKE '%pagamos%' OR content ILIKE '%proxima%' OR content ILIKE '%manda%'
        LIMIT 10
      `);
      console.log("Matches in deal activities:");
      console.table(res2.rows);

      // Let's also check Claudia Cell in recipients
      const claudia = await pool.query(`
        SELECT id, campaign_id, customer_display_name, jid, status, responded, response_count
        FROM whatsapp_campaign_recipients
        WHERE customer_display_name ILIKE '%Claudia%'
      `);
      console.log("Claudia Cell in recipients:");
      console.table(claudia.rows);
    }
  } catch (err) {
    console.error(`Error with ${label}:`, err.message);
  } finally {
    await pool.end();
  }
}

async function run() {
  await checkDb(process.env.DATABASE_URL, "LOCAL_DATABASE_URL");
  await checkDb(process.env.SUPABASE_DATABASE_URL, "SUPABASE_DATABASE_URL");
}

run();

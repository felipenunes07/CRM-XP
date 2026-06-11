import { pool } from "../apps/api/src/db/client.js";

async function verify() {
  console.log("=== RUNNING DATABASE ALIAS VERIFICATION ===");
  
  // 1. Check if there are any cross-polluted group-individual JID aliases in the table
  const aliasQuery = await pool.query(`
    SELECT alias_jid, canonical_jid, instance_name
    FROM whatsapp_jid_aliases
    WHERE (canonical_jid LIKE '%@g.us' AND alias_jid NOT LIKE '%@g.us')
       OR (canonical_jid NOT LIKE '%@g.us' AND alias_jid LIKE '%@g.us')
  `);
  
  console.log(`Corrupted alias rows found: ${aliasQuery.rowCount}`);
  if (aliasQuery.rowCount > 0) {
    console.error("❌ ERROR: Corrupted group/individual aliases still exist in the database!");
    console.error(aliasQuery.rows);
  } else {
    console.log("✅ SUCCESS: No corrupted group/individual aliases found in database.");
  }
  
  const countQuery = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM whatsapp_campaigns) as campaigns_count,
      (SELECT COUNT(*) FROM whatsapp_campaign_recipients) as recipients_count,
      (SELECT COUNT(*) FROM whatsapp_jid_aliases) as aliases_count,
      (SELECT COUNT(*) FROM whatsapp_campaign_stats_cache) as stats_cache_count
  `);
  console.log("Database Row Counts:", countQuery.rows[0]);

  // 2. Query stats cache to check recalculated stats
  const statsQuery = await pool.query(`
    SELECT campaign_id, total_recipients, responded_count, cached_at
    FROM whatsapp_campaign_stats_cache
    ORDER BY cached_at DESC
    LIMIT 10
  `);
  
  console.log("\n=== LATEST RECALCULATED CAMPAIGN STATS CACHE ===");
  console.table(statsQuery.rows);
  
  await pool.end();
}

verify().catch((err) => {
  console.error("Error running verification script:", err);
  process.exit(1);
});

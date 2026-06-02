const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");
  const groupsCountRes = await pool.query("SELECT count(*)::int as count FROM whatsapp_groups");
  const recipientsCountRes = await pool.query("SELECT count(*)::int as count FROM whatsapp_campaign_recipients");
  
  console.log("Total groups:", groupsCountRes.rows[0].count);
  console.log("Total recipients:", recipientsCountRes.rows[0].count);

  console.log("\nTiming the original query in listWhatsappGroups (without limit/offset)...");
  const t0 = Date.now();
  try {
    const res = await pool.query(`
      SELECT
        wg.*,
        c.customer_code,
        COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS customer_display_name,
        cs.status AS customer_status,
        COALESCE(cs.last_attendant, c.last_attendant) AS last_attendant,
        (
          SELECT COUNT(*)::int
          FROM whatsapp_campaign_recipients wcr
          WHERE wcr.group_id = wg.id AND wcr.status = 'SENT'
        ) AS sent_campaigns_count
      FROM whatsapp_groups wg
      LEFT JOIN customers c ON c.id = wg.customer_id
      LEFT JOIN customer_snapshot cs ON cs.customer_id = wg.customer_id
      ORDER BY wg.last_contact_at DESC NULLS LAST, wg.source_name ASC
    `);
    console.log(`Original query took ${Date.now() - t0}ms. Returned ${res.rowCount} rows.`);
  } catch (err) {
    console.error("Original query failed:", err);
  }

  console.log("\nTiming mapping summary query...");
  const t1 = Date.now();
  try {
    const resSummary = await pool.query(`
      SELECT
        COUNT(*)::int AS total_groups,
        COUNT(*) FILTER (WHERE wg.mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED'))::int AS mapped_groups,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'PENDING_REVIEW')::int AS pending_review_groups,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'CONFIRMED_UNMATCHED')::int AS confirmed_unmatched_groups,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'IGNORED')::int AS ignored_groups,
        COUNT(*) FILTER (
          WHERE wg.last_contact_at IS NOT NULL
            AND wg.last_contact_at > NOW() - make_interval(days => 7::int)
        )::int AS recently_blocked_groups,
        MAX(wg.last_imported_at) AS last_imported_at,
        COUNT(*) FILTER (WHERE wg.classification = 'WITH_ORDER')::int AS with_order_count,
        COUNT(*) FILTER (WHERE wg.classification = 'NO_ORDER_EXCEL')::int AS no_order_excel_count,
        COUNT(*) FILTER (WHERE wg.classification = 'OTHER')::int AS other_count,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'AUTO_MAPPED')::int AS auto_mapped_count,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'MANUAL_MAPPED')::int AS manual_mapped_count,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'PENDING_REVIEW')::int AS pending_review_count,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'CONFIRMED_UNMATCHED')::int AS confirmed_unmatched_count,
        COUNT(*) FILTER (WHERE wg.mapping_status = 'IGNORED')::int AS ignored_count,
        COUNT(*) FILTER (WHERE cs.status = 'ATTENTION')::int AS attention_count,
        COUNT(*) FILTER (WHERE cs.status = 'INACTIVE')::int AS inactive_count
      FROM whatsapp_groups wg
      LEFT JOIN customer_snapshot cs ON cs.customer_id = wg.customer_id
    `);
    console.log(`Mapping summary query took ${Date.now() - t1}ms.`);
  } catch (err) {
    console.error("Mapping summary query failed:", err);
  }

  console.log("\nRunning EXPLAIN on the original list query...");
  try {
    const explainRes = await pool.query(`
      EXPLAIN ANALYZE
      SELECT
        wg.*,
        c.customer_code,
        COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS customer_display_name,
        cs.status AS customer_status,
        COALESCE(cs.last_attendant, c.last_attendant) AS last_attendant,
        (
          SELECT COUNT(*)::int
          FROM whatsapp_campaign_recipients wcr
          WHERE wcr.group_id = wg.id AND wcr.status = 'SENT'
        ) AS sent_campaigns_count
      FROM whatsapp_groups wg
      LEFT JOIN customers c ON c.id = wg.customer_id
      LEFT JOIN customer_snapshot cs ON cs.customer_id = wg.customer_id
      ORDER BY wg.last_contact_at DESC NULLS LAST, wg.source_name ASC
    `);
    console.log(explainRes.rows.map(r => r['QUERY PLAN']).join('\n'));
  } catch (err) {
    console.error("EXPLAIN failed:", err);
  }

  pool.end();
}

run().catch(console.error);

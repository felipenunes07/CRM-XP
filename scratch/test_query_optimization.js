const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const ORIGINAL_QUERY = `
  WITH latest_whatsapp AS (
    SELECT
      da.*,
      ROW_NUMBER() OVER (PARTITION BY da.deal_id ORDER BY da.created_at DESC, da.id DESC) AS rn
    FROM deal_activities da
    WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
  ),
  activity_stats AS (
    SELECT
      da.deal_id,
      COUNT(*) FILTER (WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED'))::int AS event_count,
      COUNT(*) FILTER (WHERE da.activity_type = 'WHATSAPP_RECEIVED')::int AS inbound_count,
      MAX(da.created_at) FILTER (WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')) AS last_message_at
    FROM deal_activities da
    GROUP BY da.deal_id
  )
  SELECT d.id, latest_whatsapp.content, activity_stats.event_count
  FROM deals d
  LEFT JOIN latest_whatsapp ON latest_whatsapp.deal_id = d.id AND latest_whatsapp.rn = 1
  LEFT JOIN activity_stats ON activity_stats.deal_id = d.id
  LIMIT 200;
`;

const OPTIMIZED_QUERY = `
  SELECT d.id, latest_whatsapp.content, activity_stats.event_count
  FROM deals d
  LEFT JOIN LATERAL (
    SELECT content, created_at
    FROM deal_activities da
    WHERE da.deal_id = d.id
      AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    ORDER BY da.created_at DESC, da.id DESC
    LIMIT 1
  ) latest_whatsapp ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS event_count,
      COUNT(*) FILTER (WHERE da.activity_type = 'WHATSAPP_RECEIVED')::int AS inbound_count,
      MAX(da.created_at) AS last_message_at
    FROM deal_activities da
    WHERE da.deal_id = d.id
      AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
  ) activity_stats ON true
  LIMIT 200;
`;

async function run() {
  console.log("Connecting to DB...");

  console.log("\n1. Running ORIGINAL query...");
  const t0 = Date.now();
  const res0 = await pool.query(ORIGINAL_QUERY);
  console.log(`Original query completed in ${Date.now() - t0}ms. Rows: ${res0.rowCount}`);

  console.log("\n2. Running OPTIMIZED query...");
  const t1 = Date.now();
  const res1 = await pool.query(OPTIMIZED_QUERY);
  console.log(`Optimized query completed in ${Date.now() - t1}ms. Rows: ${res1.rowCount}`);

  console.log("\n3. EXPLAIN ORIGINAL QUERY:");
  const exp0 = await pool.query("EXPLAIN " + ORIGINAL_QUERY);
  console.log(exp0.rows.map(r => r['QUERY PLAN']).join('\n'));

  console.log("\n4. EXPLAIN OPTIMIZED QUERY:");
  const exp1 = await pool.query("EXPLAIN " + OPTIMIZED_QUERY);
  console.log(exp1.rows.map(r => r['QUERY PLAN']).join('\n'));

  pool.end();
}

run().catch(console.error);

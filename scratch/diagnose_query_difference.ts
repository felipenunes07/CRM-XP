import { pool } from "../apps/api/src/db/client.js";

async function run() {
  const dateStr = "2026-05-28";
  const timezone = "America/Sao_Paulo";
  
  console.log("=== DIAGNÓSTICO: SIMULANDO CONSULTA DE MONITORAMENTO ===");
  
  // 1. Get the list of all deal_id that had activities today in Daily Summary style
  const summaryDealsRes = await pool.query(
    `
    SELECT DISTINCT
      da.deal_id,
      d.whatsapp_jid,
      COALESCE(wi.display_label, wi.instance_name) AS instance_label
    FROM deal_activities da
    JOIN deals d ON d.id = da.deal_id
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      AND da.created_at >= ($1::date AT TIME ZONE $2)
      AND da.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE $2)
    `,
    [dateStr, timezone]
  );
  
  console.log(`\n[Daily Summary] Deals com atividades hoje: ${summaryDealsRes.rowCount}`);
  const summaryDeals = summaryDealsRes.rows;
  
  // 2. Simulate the activity_stats CTE for these deals
  const statsRes = await pool.query(
    `
    WITH activity_stats AS (
      SELECT
        da.deal_id,
        COUNT(*) FILTER (WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED'))::int AS event_count,
        COUNT(*) FILTER (WHERE da.activity_type = 'WHATSAPP_RECEIVED')::int AS inbound_count,
        MAX(da.created_at) FILTER (WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')) AS last_message_at
      FROM deal_activities da
      GROUP BY da.deal_id
    )
    SELECT 
      ast.deal_id,
      ast.event_count,
      ast.last_message_at,
      ast.last_message_at >= (($1::date) AT TIME ZONE $2) AS is_ge_start,
      ast.last_message_at < (($1::date + INTERVAL '1 day') AT TIME ZONE $2) AS is_lt_end
    FROM activity_stats ast
    WHERE ast.deal_id IN (
      SELECT DISTINCT da.deal_id
      FROM deal_activities da
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND da.created_at >= ($1::date AT TIME ZONE $2)
        AND da.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE $2)
    )
    `,
    [dateStr, timezone]
  );

  console.log(`\n[Activity Stats] CTE results size: ${statsRes.rowCount}`);
  for (const row of statsRes.rows) {
    console.log(`- Deal ID: ${row.deal_id}`);
    console.log(`  Event count: ${row.event_count}`);
    console.log(`  Last message at: ${row.last_message_at}`);
    console.log(`  >= Start: ${row.is_ge_start}, < End: ${row.is_lt_end}`);
  }

  process.exit(0);
}

run().catch(console.error);

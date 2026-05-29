import { pool } from "../apps/api/src/db/client.js";

async function run() {
  console.log("=== DIAGNÓSTICO DE JIDs NULOS EM DEALS ===");
  const nullJidsRes = await pool.query(
    `
    SELECT 
      da.deal_id,
      d.whatsapp_jid,
      COUNT(*)::int AS activity_count
    FROM deal_activities da
    JOIN deals d ON d.id = da.deal_id
    WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      AND d.whatsapp_jid IS NULL
    GROUP BY da.deal_id, d.whatsapp_jid
    `
  );
  console.log("Negócios com whatsapp_jid NULO mas com atividades de WhatsApp:", nullJidsRes.rows);

  console.log("\n=== CONTAGEM TOTAL DE DEALS E JIDs ===");
  const countsRes = await pool.query(
    `
    SELECT 
      COUNT(*)::int AS total_deals,
      COUNT(whatsapp_jid)::int AS deals_with_jid,
      COUNT(*) FILTER (WHERE whatsapp_jid IS NULL)::int AS deals_without_jid
    FROM deals
    `
  );
  console.log(countsRes.rows[0]);

  process.exit(0);
}

run().catch(console.error);

import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    // 1. Fetch all unique attendant names from sales/orders
    const salesRes = await pool.query(
      `
      SELECT DISTINCT COALESCE(NULLIF(last_attendant, ''), 'Sem atendente') AS attendant 
      FROM orders
      `
    );
    const attendants = salesRes.rows.map(r => r.attendant.trim().toLowerCase());
    console.log("Attendants in sales/orders database:", attendants);

    // 2. Query RECEIVED activities in groups
    const activitiesRes = await pool.query(
      `
      SELECT
        da.id,
        da.actor_name,
        da.metadata,
        d.title
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      WHERE da.activity_type = 'WHATSAPP_RECEIVED'
        AND (
          (da.metadata ->> 'remoteJid') LIKE '%@g.us'
          OR d.whatsapp_jid LIKE '%@g.us'
        )
      `
    );

    let matchCount = 0;
    const sampleMatches = [];

    for (const row of activitiesRes.rows) {
      const name = row.actor_name ? row.actor_name.trim() : "";
      const lowerName = name.toLowerCase();
      const isXp = /^xp\s+/i.test(name) || attendants.includes(lowerName) || attendants.includes(lowerName.replace(/^xp\s+/i, '').trim());

      if (isXp && lowerName !== "sem atendente" && lowerName !== "sem agente") {
        matchCount++;
        if (sampleMatches.length < 10) {
          sampleMatches.push({
            id: row.id,
            actor_name: row.actor_name,
            deal: row.title,
            isXp,
          });
        }
      }
    }

    console.log(`\nFound ${matchCount} matches that would be corrected retroactively!`);
    console.table(sampleMatches);

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

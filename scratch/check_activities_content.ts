import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== SEARCHING IN DEAL_ACTIVITIES ===");

    const queries = [
      "206785629679654",
      "268688892686580",
      "171747907248371"
    ];

    for (const q of queries) {
      console.log(`\nSearching for: ${q}`);
      const res = await pool.query(
        `
        SELECT da.id, da.activity_type, da.actor_name, da.metadata, d.title, d.whatsapp_jid
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        WHERE da.metadata::text LIKE $1 OR d.whatsapp_jid LIKE $1 OR d.title LIKE $1
        `,
        [`%${q}%`]
      );
      console.log(`Results found: ${res.rowCount}`);
      if (res.rowCount > 0) {
        console.table(res.rows.map(r => ({
          id: r.id,
          type: r.activity_type,
          actor: r.actor_name,
          dealTitle: r.title,
          dealJid: r.whatsapp_jid,
          metadataJid: r.metadata?.remoteJid
        })));
      }
    }

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

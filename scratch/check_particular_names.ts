import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== ANALYZING PARTICULAR CHAT NAMES ===");

    // Fetch details of deals matching the names the user reported
    const deals = await pool.query(
      `
      SELECT
        d.id,
        d.title,
        d.customer_display_name,
        d.whatsapp_jid,
        d.assigned_to_name,
        c.display_name as customer_name,
        c.customer_code
      FROM deals d
      LEFT JOIN customers c ON c.id = d.customer_id
      WHERE d.whatsapp_jid NOT LIKE '%@g.us'
        AND (
          d.title LIKE '%Suelen%'
          OR d.customer_display_name LIKE '%Suelen%'
          OR d.title ~ '^\\d+$'
          OR d.whatsapp_jid LIKE '%206785629679654%'
          OR d.whatsapp_jid LIKE '%268688892686580%'
          OR d.whatsapp_jid LIKE '%171747907248371%'
        )
      LIMIT 20
      `
    );

    console.table(deals.rows);

    // Let's also check the recent deal activities for one of these deals to see the metadata
    if (deals.rows[0]) {
      const dealId = deals.rows[0].id;
      const activities = await pool.query(
        `
        SELECT da.id, da.activity_type, da.actor_name, da.metadata, da.content, da.created_at
        FROM deal_activities da
        WHERE da.deal_id = $1
        ORDER BY da.created_at DESC
        LIMIT 5
        `,
        [dealId]
      );
      console.log(`\n=== RECENT ACTIVITIES FOR DEAL ${dealId} (${deals.rows[0].title}) ===`);
      console.log(JSON.stringify(activities.rows, null, 2));
    }

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    const testJid = "551188887777@s.whatsapp.net";
    console.log("Running DB test query...");
    const result = await pool.query(
      `
      SELECT d.id, d.whatsapp_jid FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      WHERE ps.is_won = false AND ps.is_lost = false
        AND (
          d.whatsapp_jid = $1
          OR (
            $1 NOT LIKE '%@g.us'
            AND d.whatsapp_jid NOT LIKE '%@g.us'
            AND regexp_replace(d.whatsapp_jid, '\\D', '', 'g') LIKE '55%'
            AND regexp_replace($1, '\\D', '', 'g') LIKE '55%'
            AND substring(regexp_replace(d.whatsapp_jid, '\\D', '', 'g') from 3 for 2) = substring(regexp_replace($1, '\\D', '', 'g') from 3 for 2)
            AND right(regexp_replace(d.whatsapp_jid, '\\D', '', 'g'), 8) = right(regexp_replace($1, '\\D', '', 'g'), 8)
          )
        )
      ORDER BY d.last_activity_at DESC
      LIMIT 1
      `,
      [testJid]
    );
    console.log("Query executed successfully!");
    console.log("Results count:", result.rows.length);
    console.table(result.rows);
  } catch (error) {
    console.error("Database query failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();

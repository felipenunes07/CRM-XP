import { pool } from "./apps/api/src/db";

async function main() {
  try {
    const result = await pool.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_name = 'whatsapp_campaign_stats_cache';
    `);
    console.log("Stats Cache Table Info:", result.rows);
    
    if (result.rows.length > 0 && result.rows[0].table_type === 'VIEW') {
      const viewResult = await pool.query(`
        SELECT view_definition 
        FROM information_schema.views 
        WHERE table_name = 'whatsapp_campaign_stats_cache';
      `);
      console.log("View Definition:", viewResult.rows[0].view_definition);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

main();

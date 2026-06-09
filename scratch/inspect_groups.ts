import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== INSPECTING GROUP DEALS AND THEIR TITLES ===");

    const deals = await pool.query(
      `SELECT d.id, d.title, d.customer_display_name, d.whatsapp_jid, d.assigned_to_name, wg.source_name as group_table_name
       FROM deals d
       LEFT JOIN whatsapp_groups wg ON wg.jid = d.whatsapp_jid
       WHERE d.whatsapp_jid LIKE '%@g.us'`
    );
    console.log(`Found ${deals.rowCount} group deals:`);
    for (const r of deals.rows) {
      console.log(`JID: ${r.whatsapp_jid}`);
      console.log(`  Deal Title: ${r.title}`);
      console.log(`  Customer Display Name: ${r.customer_display_name}`);
      console.log(`  Group Table Name: ${r.group_table_name}`);
      console.log(`  Assigned Seller: ${r.assigned_to_name}`);
      console.log(`----------------------------------------`);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

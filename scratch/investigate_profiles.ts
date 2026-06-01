import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== INVESTIGATING PROFILES AND MESSAGES FOR PROBLEM JIDS ===");

    const jids = [
      '206785629679654',
      '268688892686580',
      '171747907248371'
    ];

    for (const jid of jids) {
      console.log(`\n-------------------------------------`);
      console.log(`Checking JID containing: ${jid}`);

      // 1. Check in whatsapp_chat_profiles
      const profiles = await pool.query(
        `SELECT * FROM whatsapp_chat_profiles WHERE remote_jid LIKE $1`,
        [`%${jid}%`]
      );
      console.log("whatsapp_chat_profiles records found:", profiles.rowCount);
      if (profiles.rowCount > 0) {
        console.table(profiles.rows.map(r => ({
          jid: r.remote_jid,
          display_name: r.display_name,
          instance: r.instance_name
        })));
      }

      // 2. Check in whatsapp_incoming_messages
      const messages = await pool.query(
        `
        SELECT DISTINCT remote_jid, sender_name, participant_name, chat_display_name 
        FROM whatsapp_incoming_messages 
        WHERE remote_jid LIKE $1 OR participant_jid LIKE $1
        `,
        [`%${jid}%`]
      );
      console.log("whatsapp_incoming_messages unique names found:", messages.rowCount);
      if (messages.rowCount > 0) {
        console.table(messages.rows);
      }

      // 3. Check in deals
      const deals = await pool.query(
        `SELECT id, title, customer_display_name, whatsapp_jid FROM deals WHERE whatsapp_jid LIKE $1`,
        [`%${jid}%`]
      );
      console.log("deals records found:", deals.rowCount);
      if (deals.rowCount > 0) {
        console.table(deals.rows);
      }
    }

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

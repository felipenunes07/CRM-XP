import { pool } from "./apps/api/src/db/client.js";

async function run() {
  try {
    console.log("Removing duplicate events...");
    await pool.query(`
      DELETE FROM message_events a USING message_events b
      WHERE a.id < b.id AND a.message_id = b.message_id AND a.deal_id = b.deal_id AND a.message_id IS NOT NULL;
    `);

    console.log("Adding UNIQUE constraint...");
    await pool.query(`
      ALTER TABLE message_events DROP CONSTRAINT IF EXISTS unique_message_deal;
      ALTER TABLE message_events ADD CONSTRAINT unique_message_deal UNIQUE (message_id, deal_id);
    `);

    console.log("Success!");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();

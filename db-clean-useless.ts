import { pool } from "./apps/api/src/db/client.js";

async function run() {
  try {
    console.log("Removing useless events (Dúvida genérica, Saudações, Neutras)...");
    const result = await pool.query(`
      DELETE FROM message_events 
      WHERE event_type IN ('QUESTION', 'GREETING', 'NEUTRAL');
    `);
    console.log(`Deleted ${result.rowCount} useless events.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();

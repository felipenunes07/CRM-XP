const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Running manual rollup refresh...");
  const client = await pool.connect();
  try {
    const { refreshWhatsappActivityRollups } = await import('./apps/api/src/modules/whatsapp/whatsappActivityRollupService.js');
    const result = await refreshWhatsappActivityRollups();
    console.log("Rollup refresh result:", result);
  } catch (err) {
    console.error("Rollup refresh failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

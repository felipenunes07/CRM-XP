const { refreshWhatsappActivityRollups } = require('../apps/api/dist/modules/whatsapp/whatsappActivityRollupService.js');
const { pool } = require('../apps/api/dist/db/client.js');

async function run() {
  try {
    console.log("Running refreshWhatsappActivityRollups(7)...");
    const result = await refreshWhatsappActivityRollups(7);
    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    pool.end();
  }
}

run();

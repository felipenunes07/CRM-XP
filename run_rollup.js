const { refreshWhatsappActivityRollups } = require('./apps/api/dist/modules/whatsapp/whatsappActivityRollupService.js');
require('dotenv').config();

async function run() {
  console.log("=== RUNNING ROLLUP REFRESH ===");
  const start = Date.now();
  try {
    const res = await refreshWhatsappActivityRollups(14);
    console.log("Success:", res);
  } catch (err) {
    console.error("Error running rollup:", err.message, err.stack);
  }
  console.log(`Time taken: ${(Date.now() - start) / 1000}s`);
  process.exit(0);
}

run();

import { pool } from "../apps/api/src/db/client.ts";
import { refreshWhatsappActivityRollups } from "../apps/api/src/modules/whatsapp/whatsappActivityRollupService.ts";

async function run() {
  console.log("Running manual rollup refresh...");
  try {
    const result = await refreshWhatsappActivityRollups(70);
    console.log("Rollup refresh result:", result);
  } catch (err) {
    console.error("Rollup refresh failed:", err);
  } finally {
    await pool.end();
  }
}

run();

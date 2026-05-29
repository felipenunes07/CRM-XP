import { importWhatsappGroupsFromDefaultWorkbook } from "../apps/api/src/modules/whatsapp/whatsappGroupService.js";
import { pool } from "../apps/api/src/db/client.js";

async function run() {
  console.log("Testing optimized actual import from Google Sheets...");
  const t0 = Date.now();
  try {
    const summary = await importWhatsappGroupsFromDefaultWorkbook();
    console.log(`\nImport completed in ${Date.now() - t0}ms!`);
    console.log("Summary:", summary);
  } catch (err) {
    console.error("Import failed:", err);
  } finally {
    await pool.end();
  }
}

run().catch(console.error);

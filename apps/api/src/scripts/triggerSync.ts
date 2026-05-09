
import { syncGeographicData } from "../modules/crm/geographicService.js";
import { pool } from "../db/client.js";

async function runSync() {
  try {
    console.log("Starting geographic data sync...");
    const result = await syncGeographicData();
    console.log("Sync completed successfully:", result);
  } catch (err: any) {
    console.error("Sync failed:", err.message);
    if (err.response) {
      console.error("Response data:", err.response.data);
    }
  } finally {
    await pool.end();
  }
}

runSync();

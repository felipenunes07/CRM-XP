import { getAcquisitionMetrics } from "../apps/api/src/modules/crm/acquisitionService.js";
import { logger } from "../apps/api/src/lib/logger.js";

async function test() {
  try {
    console.log("Fetching acquisition metrics...");
    const metrics = await getAcquisitionMetrics();
    console.log("Successfully fetched metrics!");
    console.log("Summary:", JSON.stringify(metrics.summary, null, 2));
    console.log("First daily point:", metrics.dailySeries[0]);
    console.log("First monthly point:", metrics.monthlySeries[0]);
  } catch (error) {
    console.error("Error fetching acquisition metrics:", error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  }
}

test();

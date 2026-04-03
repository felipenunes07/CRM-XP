import { historicalFiles } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { pool, redis } from "../db/client.js";
import { bootstrapPlatform } from "../modules/platform/bootstrap.js";
import { importHistoryFile } from "../modules/ingestion/historyImporter.js";

async function main() {
  await bootstrapPlatform();
  for (const filePath of historicalFiles) {
    logger.info("starting historical import", { filePath });
    await importHistoryFile(filePath);
  }
}

main()
  .then(async () => {
    await redis.quit();
    await pool.end();
  })
  .catch(async (error) => {
    logger.error("historical import failed", { error: String(error) });
    await redis.quit();
    await pool.end();
    process.exit(1);
  });

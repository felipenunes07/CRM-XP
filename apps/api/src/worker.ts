import { pool, redis } from "./db/client.js";
import { logger } from "./lib/logger.js";
import { enqueueOlistSyncJob, startWorkerProcessing } from "./modules/platform/jobs.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";

async function main() {
  await bootstrapPlatform();
  const worker = startWorkerProcessing();

  const interval = setInterval(() => {
    enqueueOlistSyncJob().catch((error) => {
      logger.error("failed to enqueue scheduled olist sync", { error: String(error) });
    });
  }, 10 * 60 * 1000);

  logger.info("worker started");

  const shutdown = async () => {
    clearInterval(interval);
    await worker.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  logger.error("worker failed to start", { error: String(error) });
  await redis.quit();
  await pool.end();
  process.exit(1);
});

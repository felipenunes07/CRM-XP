import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { enqueueOlistSyncJob, startWorkerProcessing } from "./modules/platform/jobs.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import { startWhatsappDispatchWorker } from "./modules/whatsapp/whatsappQueue.js";

async function main() {
  await bootstrapPlatform();
  const worker = startWorkerProcessing();
  const whatsappWorker = startWhatsappDispatchWorker();

  const interval = env.WORKER_OLIST_SYNC_ENABLED
    ? setInterval(
        () => {
          enqueueOlistSyncJob().catch((error) => {
            logger.error("failed to enqueue scheduled olist sync", { error: String(error) });
          });
        },
        env.WORKER_OLIST_SYNC_INTERVAL_MINUTES * 60 * 1000,
      )
    : null;

  logger.info("worker started", {
    olistSyncEnabled: env.WORKER_OLIST_SYNC_ENABLED,
    olistSyncIntervalMinutes: env.WORKER_OLIST_SYNC_INTERVAL_MINUTES,
  });

  const shutdown = async () => {
    if (interval) {
      clearInterval(interval);
    }
    await worker.close();
    await whatsappWorker.close();
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

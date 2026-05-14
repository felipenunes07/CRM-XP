import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { enqueueOlistSyncJob, startWorkerProcessing } from "./modules/platform/jobs.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import { startWhatsappDispatchWorker } from "./modules/whatsapp/whatsappQueue.js";
import { syncGeographicData } from "./modules/crm/geographicService.js";
import { importWhatsappGroupsFromDefaultWorkbook } from "./modules/whatsapp/whatsappGroupService.js";
import { ensureCustomerCreditSnapshot } from "./modules/crm/customerCreditService.js";
import { startMessageAutomationScheduler } from "./modules/crm/automationService.js";
import { aggregateAllDealsSentiment } from "./modules/events/eventsService.js";

async function main() {
  await bootstrapPlatform();
  const worker = startWorkerProcessing();
  const whatsappWorker = startWhatsappDispatchWorker();
  const automationScheduler = startMessageAutomationScheduler();

  const intervals: NodeJS.Timeout[] = [];

  // 1. Olist Sync
  if (env.WORKER_OLIST_SYNC_ENABLED) {
    intervals.push(
      setInterval(
        () => {
          enqueueOlistSyncJob().catch((error) => {
            logger.error("failed to enqueue scheduled olist sync", { error: String(error) });
          });
        },
        env.WORKER_OLIST_SYNC_INTERVAL_MINUTES * 60 * 1000,
      )
    );
  }

  // 2. Geographic Data Sync (Google Sheets)
  if (env.WORKER_GEOGRAPHIC_SYNC_ENABLED) {
    logger.info("scheduled geographic sync enabled", { intervalHours: env.WORKER_GEOGRAPHIC_SYNC_INTERVAL_HOURS });
    intervals.push(
      setInterval(
        () => {
          logger.info("starting scheduled geographic sync");
          syncGeographicData().catch((error) => {
            logger.error("failed scheduled geographic sync", { error: String(error) });
          });
        },
        env.WORKER_GEOGRAPHIC_SYNC_INTERVAL_HOURS * 60 * 60 * 1000,
      )
    );
  }

  // 3. WhatsApp Groups Sync (Google Sheets)
  if (env.WORKER_WHATSAPP_SYNC_ENABLED) {
    logger.info("scheduled whatsapp groups sync enabled", { intervalHours: env.WORKER_WHATSAPP_SYNC_INTERVAL_HOURS });
    intervals.push(
      setInterval(
        () => {
          logger.info("starting scheduled whatsapp groups sync");
          importWhatsappGroupsFromDefaultWorkbook().catch((error) => {
            logger.error("failed scheduled whatsapp groups sync", { error: String(error) });
          });
        },
        env.WORKER_WHATSAPP_SYNC_INTERVAL_HOURS * 60 * 60 * 1000,
      )
    );
  }

  // 4. Customer Credit Sync (Dropbox/Local)
  if (env.WORKER_CREDIT_SYNC_ENABLED) {
    logger.info("scheduled credit sync enabled", { intervalMinutes: env.WORKER_CREDIT_SYNC_INTERVAL_MINUTES });
    intervals.push(
      setInterval(
        () => {
          logger.info("starting scheduled credit sync");
          ensureCustomerCreditSnapshot(true).catch((error) => {
            logger.error("failed scheduled credit sync", { error: String(error) });
          });
        },
        env.WORKER_CREDIT_SYNC_INTERVAL_MINUTES * 60 * 1000,
      )
    );
  }

  logger.info("worker started", {
    olistSyncEnabled: env.WORKER_OLIST_SYNC_ENABLED,
    geographicSyncEnabled: env.WORKER_GEOGRAPHIC_SYNC_ENABLED,
    whatsappSyncEnabled: env.WORKER_WHATSAPP_SYNC_ENABLED,
    creditSyncEnabled: env.WORKER_CREDIT_SYNC_ENABLED,
  });

  const shutdown = async () => {
    intervals.forEach(clearInterval);
    await automationScheduler.close();
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

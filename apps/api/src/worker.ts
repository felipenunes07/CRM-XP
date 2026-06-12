import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { startWorkerProcessing } from "./modules/platform/jobs.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import { startWhatsappDispatchWorker } from "./modules/whatsapp/whatsappQueue.js";
import { syncGeographicData } from "./modules/crm/geographicService.js";
import { importWhatsappGroupsFromDefaultWorkbook } from "./modules/whatsapp/whatsappGroupService.js";
import { ensureCustomerCreditSnapshot } from "./modules/crm/customerCreditService.js";
import { startMessageAutomationScheduler } from "./modules/crm/automationService.js";
import { aggregateAllDealsSentiment } from "./modules/events/eventsService.js";
import { refreshWhatsappActivityRollups } from "./modules/whatsapp/whatsappActivityRollupService.js";
import { runWhatsappWebhookWatchdog } from "./modules/whatsapp/whatsappWebhookWatchdog.js";
import type { RecurringJobHandle } from "./modules/platform/scheduledJobs.js";
import { startPrimarySyncScheduler } from "./modules/platform/syncService.js";

async function main() {
  await bootstrapPlatform();
  const worker = startWorkerProcessing();
  const whatsappWorker = startWhatsappDispatchWorker();
  const automationScheduler = startMessageAutomationScheduler();

  const intervals: NodeJS.Timeout[] = [];
  const recurringJobs: RecurringJobHandle[] = [];

  // 1. Primary sales sync
  recurringJobs.push(
    startPrimarySyncScheduler({
      enabled: env.WORKER_OLIST_SYNC_ENABLED,
      reason: "worker-scheduled-periodic-sync",
    }),
  );

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

  // 5. Sentiment Aggregation
  if (env.WORKER_SENTIMENT_AGGREGATION_ENABLED) {
    logger.info("scheduled sentiment aggregation enabled", { intervalHours: env.WORKER_SENTIMENT_AGGREGATION_INTERVAL_HOURS });
    intervals.push(
      setInterval(
        () => {
          logger.info("starting scheduled sentiment aggregation");
          aggregateAllDealsSentiment().catch((error) => {
            logger.error("failed scheduled sentiment aggregation", { error: String(error) });
          });
        },
        env.WORKER_SENTIMENT_AGGREGATION_INTERVAL_HOURS * 60 * 60 * 1000,
      )
    );
  }

  // 6. WhatsApp Activity Rollups
  if (env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_ENABLED) {
    logger.info("scheduled whatsapp activity rollup enabled", {
      intervalMinutes: env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_INTERVAL_MINUTES,
      refreshDays: env.WHATSAPP_ACTIVITY_ROLLUP_REFRESH_DAYS,
    });

    const refreshRollups = () => {
      logger.info("starting scheduled whatsapp activity rollup refresh");
      refreshWhatsappActivityRollups().catch((error) => {
        logger.error("failed scheduled whatsapp activity rollup refresh", { error: String(error) });
      });
    };

    refreshRollups();
    intervals.push(
      setInterval(
        refreshRollups,
        env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_INTERVAL_MINUTES * 60 * 1000,
      )
    );
  }

  // 7. WhatsApp Webhook Watchdog: re-applies the Evolution webhook config and
  // alerts when an instance disconnects — without this, message ingestion
  // (heatmap/activity report) stops silently when the config is lost.
  if (env.WORKER_WHATSAPP_WEBHOOK_WATCHDOG_ENABLED) {
    logger.info("scheduled whatsapp webhook watchdog enabled", {
      intervalMinutes: env.WORKER_WHATSAPP_WEBHOOK_WATCHDOG_INTERVAL_MINUTES,
    });

    const runWatchdog = () => {
      runWhatsappWebhookWatchdog().catch((error) => {
        logger.error("failed scheduled whatsapp webhook watchdog", { error: String(error) });
      });
    };

    runWatchdog();
    intervals.push(
      setInterval(
        runWatchdog,
        env.WORKER_WHATSAPP_WEBHOOK_WATCHDOG_INTERVAL_MINUTES * 60 * 1000,
      )
    );
  }

  // 8. Database Cleanup (Daily)
  intervals.push(
    setInterval(
      () => {
        logger.info("starting daily database cleanup");
        import("./modules/events/eventsService.js")
          .then((m) => m.purgeOldEventsData())
          .catch((error) => {
            logger.error("failed daily database cleanup", { error: String(error) });
          });
      },
      24 * 60 * 60 * 1000,
    )
  );

  logger.info("worker started", {
    olistSyncEnabled: env.WORKER_OLIST_SYNC_ENABLED,
    geographicSyncEnabled: env.WORKER_GEOGRAPHIC_SYNC_ENABLED,
    whatsappSyncEnabled: env.WORKER_WHATSAPP_SYNC_ENABLED,
    creditSyncEnabled: env.WORKER_CREDIT_SYNC_ENABLED,
    sentimentAggregationEnabled: env.WORKER_SENTIMENT_AGGREGATION_ENABLED,
    whatsappActivityRollupEnabled: env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_ENABLED,
  });

  const shutdown = async () => {
    intervals.forEach(clearInterval);
    await Promise.all(recurringJobs.map((job) => job.close()));
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

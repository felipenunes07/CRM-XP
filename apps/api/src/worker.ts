import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { startWorkerProcessing } from "./modules/platform/jobs.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import { startWhatsappDispatchWorker } from "./modules/whatsapp/whatsappQueue.js";
import { syncGeographicData } from "./modules/crm/geographicService.js";
import { importWhatsappGroupsFromDefaultWorkbook } from "./modules/whatsapp/whatsappGroupService.js";
import { refreshCustomerCreditOverview } from "./modules/crm/customerCreditService.js";
import { startMessageAutomationScheduler } from "./modules/crm/automationService.js";
import { aggregateAllDealsSentiment } from "./modules/events/eventsService.js";
import { runConversationIntelligence } from "./modules/events/conversationAi.js";
import { refreshWhatsappActivityRollups } from "./modules/whatsapp/whatsappActivityRollupService.js";
import { runWhatsappWebhookWatchdog } from "./modules/whatsapp/whatsappWebhookWatchdog.js";
import type { RecurringJobHandle } from "./modules/platform/scheduledJobs.js";
import { startPrimarySyncScheduler } from "./modules/platform/syncService.js";
import { startDailyOffboardingScheduler } from "./modules/crm/offboardingAlertService.js";
import { startDailyLifecycleScheduler } from "./modules/crm/lifecycleAutomationService.js";

async function main() {
  await bootstrapPlatform();
  const worker = startWorkerProcessing();
  const whatsappWorker = startWhatsappDispatchWorker();
  const automationScheduler = startMessageAutomationScheduler();
  const offboardingScheduler = startDailyOffboardingScheduler();
  const lifecycleScheduler = startDailyLifecycleScheduler();

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
          // Reprocessa a planilha E reaquece o cache do overview, para que a aba
          // de credito abra instantanea quando alguem acessar.
          refreshCustomerCreditOverview().catch((error) => {
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

  // 5.5. Inteligencia de Mensagens: analise de conversas por IA + briefing do
  // dia. O proprio job aplica horario comercial, presenca de chave, cadencia e
  // orcamento diario de requests/tokens.
  if (env.EVENTS_AI_BATCH_ENABLED) {
    logger.info("scheduled conversation intelligence enabled", {
      intervalMinutes: env.EVENTS_AI_BATCH_INTERVAL_MINUTES,
      provider: env.EVENTS_AI_PROVIDER,
      model: env.EVENTS_AI_MODEL,
      cerebrasModel: env.CEREBRAS_MODEL,
      timezone: env.EVENTS_AI_TIMEZONE,
      businessStartHour: env.EVENTS_AI_BUSINESS_START_HOUR,
      businessEndHour: env.EVENTS_AI_BUSINESS_END_HOUR,
      maxConversationsPerRun: env.EVENTS_AI_MAX_CONVERSATIONS_PER_RUN,
    });

    const runIntelligence = () => {
      runConversationIntelligence().catch((error) => {
        logger.error("failed scheduled conversation intelligence", { error: String(error) });
      });
    };

    runIntelligence();
    intervals.push(
      setInterval(
        runIntelligence,
        env.EVENTS_AI_BATCH_INTERVAL_MINUTES * 60 * 1000,
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
    await offboardingScheduler.close();
    await lifecycleScheduler.close();
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

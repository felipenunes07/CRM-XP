import { createServer } from "node:http";
import { createApp } from "./app.js";
import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import {
  startDailySyncScheduler,
  startSupabaseSalesChangeListener,
} from "./modules/platform/syncService.js";
import { startDailyRebuildScheduler } from "./modules/analytics/readModelRebuild.js";
import { startPayloadCleanupScheduler } from "./modules/whatsapp/payloadRetentionService.js";
import { runMigrations } from "./db/runMigrations.js";
import { startWhatsappDispatchWorker } from "./modules/whatsapp/whatsappQueue.js";
import { refreshWhatsappActivityRollups } from "./modules/whatsapp/whatsappActivityRollupService.js";
import { configureUazapiWebhook } from "./modules/whatsapp/uazapiService.js";
import { runWhatsappWebhookWatchdog } from "./modules/whatsapp/whatsappWebhookWatchdog.js";
import { startDailyOffboardingScheduler } from "./modules/crm/offboardingAlertService.js";
import { startDailyCustomerDefectSyncScheduler } from "./modules/crm/customerDefectService.js";
import { runConversationIntelligence } from "./modules/events/conversationAi.js";
import { cacheActiveWhatsappInstanceAvatars } from "./modules/whatsapp/whatsappAvatarCache.js";

/**
 * Garante que toda instância uazapi ativa entregue mensagens recebidas ao CRM.
 * Sem o webhook apontado para cá, respostas de clientes nunca entram no banco
 * (mini chat vazio e "Respondeu" zerado nas campanhas uazapi).
 */
function configureUazapiWebhooksAtStartup() {
  const base = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
  const webhookUrl = `${base}/api/webhooks/uazapi`;

  void pool
    .query(
      `SELECT instance_name, uazapi_base_url, uazapi_token
       FROM whatsapp_instances
       WHERE provider = 'UAZAPI' AND status = 'ACTIVE'
         AND COALESCE(messages_enabled, TRUE) = TRUE
         AND uazapi_base_url IS NOT NULL AND uazapi_token IS NOT NULL`,
    )
    .then(async (result) => {
      for (const row of result.rows) {
        const outcome = await configureUazapiWebhook(
          { baseUrl: String(row.uazapi_base_url), token: String(row.uazapi_token) },
          webhookUrl,
        );
        logger.info("uazapi webhook startup configuration", {
          instance: String(row.instance_name),
          configured: outcome.configured,
        });
      }
    })
    .catch((error) => {
      logger.warn("uazapi webhook startup configuration failed", { error: String(error) });
    });
}

async function main() {
  await runMigrations();
  await bootstrapPlatform();
  // Guarda as fotos das instancias como bytes no Postgres. Os links assinados
  // do WhatsApp podem expirar; a ultima imagem valida do CRM permanece.
  void cacheActiveWhatsappInstanceAvatars()
    .then((result) => logger.info("whatsapp instance avatar cache warmed", result))
    .catch((error) => logger.warn("whatsapp instance avatar cache warmup failed", {
      error: String(error),
    }));
  const scheduler = startDailySyncScheduler();
  const realtimeSalesScheduler = startSupabaseSalesChangeListener();
  const rebuildScheduler = startDailyRebuildScheduler();
  const payloadCleanupScheduler = startPayloadCleanupScheduler();
  // Roda tambem na API (alem do worker) para o alerta diario das 8h disparar
  // mesmo se o container worker estiver fora. A trava diaria (claimDailyOffboardingRun)
  // garante que so um processo envia por dia.
  const offboardingScheduler = startDailyOffboardingScheduler();
  const customerDefectSyncScheduler = startDailyCustomerDefectSyncScheduler();
  const whatsappWorker = startWhatsappDispatchWorker();
  // Só (re)configura o webhook da uazapi se explicitamente habilitado. Por padrão
  // o CRM não mexe no webhook da uazapi (UAZAPI_AUTO_CONFIGURE_WEBHOOK=false).
  if (env.UAZAPI_AUTO_CONFIGURE_WEBHOOK) {
    configureUazapiWebhooksAtStartup();
  } else {
    logger.info("uazapi webhook auto-config disabled (UAZAPI_AUTO_CONFIGURE_WEBHOOK=false)");
  }

  // Start WhatsApp Activity Rollup background refresh
  let rollupInterval: NodeJS.Timeout | undefined;
  if (env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_ENABLED) {
    logger.info("api server scheduled whatsapp activity rollup enabled", {
      intervalMinutes: env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_INTERVAL_MINUTES,
      refreshDays: env.WHATSAPP_ACTIVITY_ROLLUP_REFRESH_DAYS,
    });

    // Run once at startup with a larger window to backfill any offline period
    refreshWhatsappActivityRollups(14).catch((error) => {
      logger.error("api server failed startup whatsapp activity rollup backfill", { error: String(error) });
    });

    const refreshRollups = () => {
      logger.info("api server starting scheduled whatsapp activity rollup refresh");
      refreshWhatsappActivityRollups().catch((error) => {
        logger.error("api server failed scheduled whatsapp activity rollup refresh", { error: String(error) });
      });
    };

    rollupInterval = setInterval(
      refreshRollups,
      env.WORKER_WHATSAPP_ACTIVITY_ROLLUP_INTERVAL_MINUTES * 60 * 1000,
    );
  }

  // Inteligencia de Mensagens: o agendamento roda na API porque em producao o
  // container so executa server.js (o worker.ts nao sobe). O proprio
  // runConversationIntelligence decide quando agir (modo diario 16h, horario
  // comercial, orcamento, "ja rodou hoje") — o tick e so uma checagem barata.
  let intelligenceInterval: NodeJS.Timeout | undefined;
  if (env.EVENTS_AI_BATCH_ENABLED) {
    const tickMinutes = env.EVENTS_AI_SCHEDULE_MODE === "daily"
      ? Math.min(10, env.EVENTS_AI_BATCH_INTERVAL_MINUTES)
      : env.EVENTS_AI_BATCH_INTERVAL_MINUTES;

    logger.info("api server conversation intelligence scheduler enabled", {
      scheduleMode: env.EVENTS_AI_SCHEDULE_MODE,
      dailyRunHour: env.EVENTS_AI_DAILY_RUN_HOUR,
      tickMinutes,
    });

    const runIntelligence = () => {
      runConversationIntelligence().catch((error) => {
        logger.error("api server failed scheduled conversation intelligence", { error: String(error) });
      });
    };

    runIntelligence();
    intelligenceInterval = setInterval(runIntelligence, tickMinutes * 60 * 1000);
  }

  // WhatsApp Webhook Watchdog: also runs on the API server so the webhook
  // config self-heals even when the worker container is down.
  let watchdogInterval: NodeJS.Timeout | undefined;
  if (env.WORKER_WHATSAPP_WEBHOOK_WATCHDOG_ENABLED) {
    logger.info("api server whatsapp webhook watchdog enabled", {
      intervalMinutes: env.WORKER_WHATSAPP_WEBHOOK_WATCHDOG_INTERVAL_MINUTES,
    });

    const runWatchdog = () => {
      runWhatsappWebhookWatchdog().catch((error) => {
        logger.error("api server failed whatsapp webhook watchdog", { error: String(error) });
      });
    };

    runWatchdog();
    watchdogInterval = setInterval(
      runWatchdog,
      env.WORKER_WHATSAPP_WEBHOOK_WATCHDOG_INTERVAL_MINUTES * 60 * 1000,
    );
  }

  const app = createApp();
  const server = createServer(app);
  server.listen(env.PORT, () => {
    logger.info("api server listening", { port: env.PORT });
  });

  const shutdown = async () => {
    logger.info("shutting down api server");
    if (rollupInterval) {
      clearInterval(rollupInterval);
    }
    if (intelligenceInterval) {
      clearInterval(intelligenceInterval);
    }
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
    }
    server.close(async () => {
      await scheduler.close();
      await realtimeSalesScheduler.close();
      await rebuildScheduler.close();
      await payloadCleanupScheduler.close();
      await offboardingScheduler.close();
      await customerDefectSyncScheduler.close();
      if (whatsappWorker && typeof whatsappWorker.close === "function") {
        await whatsappWorker.close();
      }
      await redis.quit();
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  logger.error("api server failed to start", { error: String(error) });
  await redis.quit();
  await pool.end();
  process.exit(1);
});

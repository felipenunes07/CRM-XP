import { createServer } from "node:http";
import { createApp } from "./app.js";
import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import { startDailySyncScheduler } from "./modules/platform/syncService.js";
import { runMigrations } from "./db/runMigrations.js";
import { startWhatsappDispatchWorker } from "./modules/whatsapp/whatsappQueue.js";
import { refreshWhatsappActivityRollups } from "./modules/whatsapp/whatsappActivityRollupService.js";

async function main() {
  await runMigrations();
  await bootstrapPlatform();
  const scheduler = startDailySyncScheduler();
  const whatsappWorker = startWhatsappDispatchWorker();

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
    server.close(async () => {
      await scheduler.close();
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

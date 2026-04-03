import { createServer } from "node:http";
import { createApp } from "./app.js";
import { pool, redis } from "./db/client.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { bootstrapPlatform } from "./modules/platform/bootstrap.js";
import { startDailySyncScheduler } from "./modules/platform/syncService.js";

async function main() {
  await bootstrapPlatform();
  const scheduler = startDailySyncScheduler();
  const app = createApp();
  const server = createServer(app);
  server.listen(env.PORT, () => {
    logger.info("api server listening", { port: env.PORT });
  });

  const shutdown = async () => {
    logger.info("shutting down api server");
    server.close(async () => {
      await scheduler.close();
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

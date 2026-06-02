import { pool, redis } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { refreshWhatsappActivityRollups } from "../modules/whatsapp/whatsappActivityRollupService.js";

async function main() {
  const rawDays = process.argv[2];
  const days = rawDays === undefined ? undefined : Number(rawDays);

  if (days !== undefined && (!Number.isFinite(days) || days <= 0)) {
    throw new Error(`Invalid days argument: ${rawDays}`);
  }

  const result = await refreshWhatsappActivityRollups(days);
  logger.info("manual whatsapp activity rollup refresh finished", result);
}

main()
  .catch((error) => {
    logger.error("manual whatsapp activity rollup refresh failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });

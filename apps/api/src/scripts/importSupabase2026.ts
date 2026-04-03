import { logger } from "../lib/logger.js";
import { pool, redis } from "../db/client.js";
import { bootstrapPlatform } from "../modules/platform/bootstrap.js";
import { importSupabase2026 } from "../modules/ingestion/supabaseImporter.js";

async function main() {
  await bootstrapPlatform();
  await importSupabase2026();
}

main()
  .then(async () => {
    await redis.quit();
    await pool.end();
  })
  .catch(async (error) => {
    logger.error("supabase 2026 import failed", { error: String(error) });
    await redis.quit();
    await pool.end();
    process.exit(1);
  });

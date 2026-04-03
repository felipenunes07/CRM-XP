import { pool } from "./client.js";
import { migrations } from "./migrations.js";
import { logger } from "../lib/logger.js";

export async function runMigrations() {
  for (const migration of migrations) {
    await pool.query(migration);
  }
  logger.info("database migrations applied");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error("database migration failed", { error: String(error) });
      await pool.end();
      process.exit(1);
    });
}

import { pool } from "./client.js";
import { logger } from "../lib/logger.js";
import { runMigrations } from "./runMigrations.js";

export { runMigrations };

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

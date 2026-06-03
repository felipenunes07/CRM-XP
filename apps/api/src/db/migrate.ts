import { fileURLToPath } from "url";
import path from "path";
import { pool } from "./client.js";
import { logger } from "../lib/logger.js";
import { runMigrations } from "./runMigrations.js";

export { runMigrations };

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
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

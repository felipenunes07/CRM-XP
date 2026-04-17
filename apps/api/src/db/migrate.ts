import { pool } from "./client.js";
import { migrations } from "./migrations.js";
import { logger } from "../lib/logger.js";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    // Acquire a session-level advisory lock using a stable integer ID.
    // This prevents concurrent migration runs from deadlocking each other.
    await client.query("SELECT pg_advisory_lock(987654321)");
    
    for (const migration of migrations) {
      await client.query(migration);
    }
    logger.info("database migrations applied");
  } catch (error) {
    logger.error("database migration failed", { error: String(error) });
    throw error;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(987654321)");
    } catch (unlockError) {
      logger.warn("failed to release advisory lock", { error: String(unlockError) });
    }
    client.release();
  }
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

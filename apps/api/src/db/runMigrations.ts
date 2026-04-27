import { pool } from "./client.js";
import { logger } from "../lib/logger.js";
import { migrations } from "./migrations.js";

export async function runMigrations() {
  logger.info("checking database migrations");
  
  // Basic migration table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      version INTEGER NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query("SELECT MAX(version) as version FROM migrations");
  const currentVersion = rows[0]?.version ?? 0;
  
  logger.info("current database version", { currentVersion, totalMigrations: migrations.length });

  for (let i = currentVersion; i < migrations.length; i++) {
    const version = i + 1;
    const sql = migrations[i];
    
    logger.info("executing migration", { version });
    
    try {
      await pool.query("BEGIN");
      await pool.query(sql);
      await pool.query("INSERT INTO migrations (version) VALUES ($1)", [version]);
      await pool.query("COMMIT");
      logger.info("migration executed successfully", { version });
    } catch (error) {
      await pool.query("ROLLBACK");
      logger.error("migration failed", { version, error: String(error) });
      throw error;
    }
  }

  logger.info("all migrations are up to date");
}

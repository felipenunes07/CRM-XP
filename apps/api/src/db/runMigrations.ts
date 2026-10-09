import { Pool } from "pg";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import { migrations } from "./migrations.js";

const MIGRATION_ADVISORY_LOCK_ID = 742_026_815;

export async function runMigrations() {
  logger.info("checking database migrations");
  // O pool das requisicoes usa timeout curto para proteger a API. Migracoes
  // precisam de uma conexao separada: criar um indice grande pode levar mais
  // de 20 segundos e nao deve ser abortado no meio do deploy.
  const migrationPool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 0,
    statement_timeout: 0,
  });
  const client = await migrationPool.connect();
  let lockAcquired = false;

  try {
    await client.query("SET statement_timeout = 0");
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_ID]);
    lockAcquired = true;
    await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          version INTEGER NOT NULL,
          executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

    const { rows } = await client.query("SELECT MAX(version) as version FROM migrations");
    const currentVersion = rows[0]?.version ?? 0;

    logger.info("current database version", { currentVersion, totalMigrations: migrations.length });

    for (let i = currentVersion; i < migrations.length; i++) {
      const version = i + 1;
      const sql = migrations[i];

      logger.info("executing migration", { version });

      try {
        await client.query("BEGIN");
        await client.query(sql as string);
        await client.query("INSERT INTO migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        logger.info("migration executed successfully", { version });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        logger.error("migration failed", { version, error: String(error) });
        throw error;
      }
    }

    logger.info("all migrations are up to date");
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_ID]).catch(() => undefined);
    }
    client.release();
    await migrationPool.end();
  }
}

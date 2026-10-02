import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { ensureDefaultAdmin } from "./authService.js";

/**
 * Colunas/tabelas que o codigo atual le e que o deploy nao cria sozinho (as
 * migracoes so rodam com `npm run migrate`). Idempotente: se ja existem, nao
 * faz nada. Sem isso, a tela de Financeiro e a cobranca quebrariam ao subir uma
 * versao nova antes de alguem rodar a migracao.
 */
export async function ensureRuntimeSchema() {
  try {
    await pool.query(`
      ALTER TABLE IF EXISTS customer_credit_overrides
        ADD COLUMN IF NOT EXISTS internal_credit_limit NUMERIC(14, 2);

      CREATE TABLE IF NOT EXISTS customer_credit_change_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        customer_code TEXT,
        before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
        after_values JSONB NOT NULL DEFAULT '{}'::jsonb,
        changed_by_user_id TEXT,
        changed_by_name TEXT,
        notified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_credit_change_log_customer
        ON customer_credit_change_log (customer_id, created_at DESC);
    `);
  } catch (error) {
    logger.error("failed to ensure runtime schema", { error: String(error) });
  }
}

export async function bootstrapPlatform() {
  await ensureDefaultAdmin();
  await ensureRuntimeSchema();
}

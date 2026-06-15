/**
 * Limpeza de bloat (espaço morto) das tabelas quentes do WhatsApp.
 *
 * Rodar no console do crm-backend (EasyPanel):
 *   npm run db:vacuum -w @olist-crm/api
 *
 * - Tabelas PEQUENAS e muito inchadas (poucas linhas vivas, centenas de MB):
 *   VACUUM FULL — reescreve só as linhas vivas, devolve o espaço pro disco.
 *   Pega lock exclusivo, mas como há pouca linha viva é quase instantâneo.
 * - Tabelas GRANDES: VACUUM normal (ANALYZE) — NÃO trava escrita; marca o espaço
 *   morto como reutilizável e atualiza as estatísticas do planner. NÃO encolhe o
 *   arquivo (pra encolher de verdade, use pg_repack numa janela de manutenção).
 *
 * Idempotente e seguro: VACUUM nunca apaga dado, só reorganiza.
 */
import { Pool } from "pg";
import { env } from "../lib/env.js";

// Bloat extremo confirmado (poucas linhas vivas, centenas de MB) → FULL rápido.
const FULL_TABLES = ["whatsapp_campaign_recipients", "message_logs"];
// Grandes → VACUUM normal (sem lock de escrita).
const PLAIN_TABLES = ["whatsapp_monitor_messages", "deal_activities", "whatsapp_incoming_messages"];

async function main() {
  // statement_timeout 0: VACUUM pode passar do limite de 20s do pool da app.
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    statement_timeout: 0,
    query_timeout: 0,
    idleTimeoutMillis: 10_000,
  });

  const sizeOf = async (table: string) =>
    (await pool.query(`SELECT pg_size_pretty(pg_total_relation_size($1)) AS s`, [table])).rows[0].s as string;

  console.log("=== VACUUM FULL (tabelas pequenas e inchadas — lock breve) ===");
  for (const table of FULL_TABLES) {
    const before = await sizeOf(table);
    process.stdout.write(`  ${table}: ${before} -> `);
    const start = Date.now();
    await pool.query(`VACUUM (FULL, ANALYZE) ${table}`);
    console.log(`${await sizeOf(table)}  (${Date.now() - start}ms)`);
  }

  console.log("\n=== VACUUM normal (tabelas grandes — sem travar escrita) ===");
  for (const table of PLAIN_TABLES) {
    const before = await sizeOf(table);
    process.stdout.write(`  ${table}: ${before} (limpando dead tuples) -> `);
    const start = Date.now();
    await pool.query(`VACUUM (ANALYZE) ${table}`);
    console.log(`feito em ${Date.now() - start}ms (arquivo segue ${await sizeOf(table)}; use pg_repack p/ encolher)`);
  }

  await pool.end();
  console.log("\nConcluído.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

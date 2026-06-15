/**
 * Limpeza manual dos payloads crus de auditoria (fase 1, colunas seguras).
 *
 * Rodar no console do crm-backend (EasyPanel):
 *   npm run db:cleanup-payloads -w @olist-crm/api
 *
 * Aceita janela de retenção em dias como argumento (default = PAYLOAD_RETENTION_DAYS):
 *   npm run db:cleanup-payloads -w @olist-crm/api -- 60
 *
 * Mesma lógica do agendador diário (startPayloadCleanupScheduler). Seguro: só
 * NULLifica raw_payload / provider_payload / response_payload em linhas antigas.
 */
import { pool } from "../db/client.js";
import { env } from "../lib/env.js";
import { cleanupHeavyPayloads } from "../modules/whatsapp/payloadRetentionService.js";

async function main() {
  const arg = process.argv[2];
  const mediaArg = process.argv[3];
  const retentionDays = arg ? Number(arg) : env.PAYLOAD_RETENTION_DAYS;
  const mediaRetentionDays = mediaArg ? Number(mediaArg) : env.MEDIA_BASE64_RETENTION_DAYS;
  if (!Number.isFinite(retentionDays) || retentionDays < 7) {
    console.error(`Janela de retenção inválida: "${arg}" (mínimo 7 dias).`);
    process.exit(1);
  }
  if (!Number.isFinite(mediaRetentionDays) || mediaRetentionDays < 7) {
    console.error(`Janela de mídia inválida: "${mediaArg}" (mínimo 7 dias).`);
    process.exit(1);
  }

  console.log(
    `Limpando payloads crus (>${retentionDays} dias) e mediaBase64 (>${mediaRetentionDays} dias)...`,
  );
  const result = await cleanupHeavyPayloads(retentionDays, mediaRetentionDays);
  console.table(result.counts);
  console.log(
    "\nFeito. As colunas foram zeradas; o espaço volta para REUSO via autovacuum.",
  );
  console.log(
    "Para encolher o ARQUIVO já existente de uma vez, rode pg_repack/VACUUM FULL numa janela de manutenção.",
  );
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

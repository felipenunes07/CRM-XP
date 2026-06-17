/**
 * Limpeza de rotina dos payloads crus que incham as tabelas de mensagem.
 *
 * As tabelas de WhatsApp guardam, por linha, um JSONB com o payload cru do provider
 * (auditoria/debug). Isso cresce pra sempre e deixa as queries lentas (ex.: 21 GB em
 * whatsapp_monitor_messages, 6,9 GB em whatsapp_incoming_messages). Este serviço
 * NULLifica essas colunas em linhas mais antigas que a janela de retenção, mantendo
 * texto, identidade e metadados. SÓ toca colunas que o runtime não lê:
 *
 *   - whatsapp_incoming_messages.raw_payload   (só usado em migrations de backfill)
 *   - message_logs.provider_payload            (nenhuma leitura no código)
 *   - whatsapp_campaign_recipients.response_payload (não usado no front)
 *
 * NÃO toca em media_json (chat) nem deal_activities.metadata (atribuição/rollup) —
 * esses são lidos em runtime e precisam de limpeza por chave (fase 2).
 *
 * Observação: NULLificar gera tuplas mortas que o autovacuum recupera para REUSO
 * (a tabela para de crescer). Para encolher o arquivo já existente de uma vez, rode
 * pg_repack/VACUUM FULL numa janela de manutenção DEPOIS da primeira limpeza.
 */
import { Pool, type PoolClient } from "pg";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

const CLEANUP_TIMEZONE = "America/Sao_Paulo";
const CLEANUP_CURSOR_KEY = "payload_cleanup_date";
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // checa a cada 30 min
const BATCH_SIZE = 2000;
// media_json tem ~737KB por linha; lote menor evita reescrever GBs de TOAST de uma vez.
const JSON_BATCH_SIZE = 300;

type CleanupTarget = { table: string; column: string };
type JsonKeyTarget = { table: string; column: string; key: string };

const SAFE_TARGETS: CleanupTarget[] = [
  { table: "whatsapp_incoming_messages", column: "raw_payload" },
  { table: "message_logs", column: "provider_payload" },
  { table: "whatsapp_campaign_recipients", column: "response_payload" },
];

// Remoção por CHAVE (não a coluna toda): tira só o blob base64 pesado, mantendo as
// chaves pequenas que o chat usa (mediaUrl, caption, mimeType, mediaType, fileName).
// O front cai pro mediaUrl quando mediaBase64 some (buildMediaSrc em MessagesPage).
const JSON_KEY_TARGETS: JsonKeyTarget[] = [
  { table: "whatsapp_monitor_messages", column: "media_json", key: "mediaBase64" },
  // A mesma imagem base64 (~484KB/linha) também é duplicada aqui = boa parte dos 14GB
  // de deal_activities. Removemos só a chave; as chaves pequenas que a atribuição/chat
  // usam (remoteJid, messageId, instance, mediaUrl, chatDisplayName...) ficam.
  { table: "deal_activities", column: "metadata", key: "mediaBase64" },
];

async function clearColumnInBatches(client: PoolClient, target: CleanupTarget, retentionDays: number) {
  let total = 0;
  // ctid em lotes: cada iteração pega até BATCH_SIZE linhas antigas que ainda têm
  // payload; ao setar NULL elas saem do filtro, garantindo progresso até zerar.
  for (;;) {
    const result = await client.query(
      `
        UPDATE ${target.table}
        SET ${target.column} = NULL
        WHERE ctid IN (
          SELECT ctid
          FROM ${target.table}
          WHERE ${target.column} IS NOT NULL
            AND created_at < NOW() - ($1::int * INTERVAL '1 day')
          LIMIT ${BATCH_SIZE}
        )
      `,
      [retentionDays],
    );
    const affected = result.rowCount ?? 0;
    total += affected;
    if (affected < BATCH_SIZE) {
      break;
    }
    // Give the database time to breathe and prevent lock starvation/CPU saturation
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return total;
}

async function stripJsonKeyInBatches(client: PoolClient, target: JsonKeyTarget, retentionDays: number) {
  let total = 0;
  for (;;) {
    const result = await client.query(
      `
        UPDATE ${target.table}
        SET ${target.column} = ${target.column} - $2
        WHERE ctid IN (
          SELECT ctid
          FROM ${target.table}
          WHERE ${target.column} ? $2
            AND created_at < NOW() - ($1::int * INTERVAL '1 day')
          LIMIT ${JSON_BATCH_SIZE}
        )
      `,
      [retentionDays, target.key],
    );
    const affected = result.rowCount ?? 0;
    total += affected;
    if (affected < JSON_BATCH_SIZE) {
      break;
    }
    // Give the database time to breathe and prevent lock starvation/CPU saturation
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return total;
}

export async function cleanupHeavyPayloads(
  retentionDays = env.PAYLOAD_RETENTION_DAYS,
  mediaRetentionDays = env.MEDIA_BASE64_RETENTION_DAYS,
) {
  const counts: Record<string, number> = {};
  // Pool dedicado SEM timeout: o pool padrão tem statement_timeout E query_timeout de
  // 20s; reescrever o TOAST pesado (media_json ~737KB/linha) passa disso e aborta.
  // Aqui rodamos em lotes, sem limite de tempo, sem afetar o resto da app.
  const cleanupPool = new Pool({
    connectionString: env.DATABASE_URL,
    statement_timeout: 0,
    query_timeout: 0,
    idleTimeoutMillis: 10_000,
    max: 2,
  });
  const client = await cleanupPool.connect();
  try {
    await client.query("SET lock_timeout = '10s'");

    for (const target of SAFE_TARGETS) {
      try {
        const cleared = await clearColumnInBatches(client, target, retentionDays);
        counts[`${target.table}.${target.column}`] = cleared;
      } catch (error) {
        logger.error("payload cleanup failed for target", {
          target: `${target.table}.${target.column}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const target of JSON_KEY_TARGETS) {
      try {
        const cleared = await stripJsonKeyInBatches(client, target, mediaRetentionDays);
        counts[`${target.table}.${target.column} -${target.key}`] = cleared;
      } catch (error) {
        logger.error("payload cleanup failed for json key target", {
          target: `${target.table}.${target.column} -${target.key}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    client.release();
    await cleanupPool.end();
  }
  logger.info("payload cleanup finished", { retentionDays, mediaRetentionDays, counts });
  return { retentionDays, mediaRetentionDays, counts };
}

function getLocalParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLEANUP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? "0"),
  };
}

async function getCursor(key: string) {
  const result = await pool.query("SELECT cursor_value FROM sync_cursors WHERE key = $1", [key]);
  return (result.rows[0]?.cursor_value as string | undefined) ?? null;
}

async function setCursor(key: string, value: string) {
  await pool.query(
    `
      INSERT INTO sync_cursors (key, cursor_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
    `,
    [key, value],
  );
}

export function startPayloadCleanupScheduler() {
  if (!env.PAYLOAD_CLEANUP_ENABLED) {
    logger.info("payload cleanup scheduler disabled");
    return {
      async close() {
        return;
      },
    };
  }

  const check = async () => {
    try {
      const now = getLocalParts();
      if (now.hour !== env.PAYLOAD_CLEANUP_HOUR) {
        return;
      }
      const lastRun = await getCursor(CLEANUP_CURSOR_KEY);
      if (lastRun === now.dateKey) {
        return; // já rodou hoje
      }

      logger.info("payload cleanup started", { dateKey: now.dateKey, retentionDays: env.PAYLOAD_RETENTION_DAYS });
      const result = await cleanupHeavyPayloads();
      await setCursor(CLEANUP_CURSOR_KEY, now.dateKey);
      logger.info("payload cleanup completed", { dateKey: now.dateKey, ...result });
    } catch (error) {
      logger.error("payload cleanup scheduler tick failed", { error: String(error) });
    }
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  void check();

  logger.info("payload cleanup scheduler initialized", {
    hour: env.PAYLOAD_CLEANUP_HOUR,
    retentionDays: env.PAYLOAD_RETENTION_DAYS,
    timezone: CLEANUP_TIMEZONE,
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}

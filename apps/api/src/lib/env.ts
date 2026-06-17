import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(process.cwd(), "../../../.env"),
]) {
  dotenv.config({ path: candidate, override: false });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_URL: z.string().default(""),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default(""),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("12h"),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6).default("change-me"),
  EVOLUTION_API_BASE_URL: z.string().default(""),
  EVOLUTION_API_KEY: z.string().default(""),
  EVOLUTION_INSTANCE_NAME: z.string().default(""),
  // Quando "true", o CRM (re)configura o webhook das instâncias uazapi no startup
  // e ao criar campanha, apontando para /api/webhooks/uazapi. Padrão "false":
  // o CRM NÃO mexe no webhook da uazapi (deixa o que já estiver lá).
  UAZAPI_AUTO_CONFIGURE_WEBHOOK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WHATSAPP_GROUPS_SHEET_CSV_URL: z
    .string()
    .default(
      "https://docs.google.com/spreadsheets/d/1qAuw2ebWPJmcy_gl4Qf48GfmnSGLZumDfs62fpG2BGA/export?format=csv&gid=1602908530",
    ),
  GEOGRAPHIC_SHEET_CSV_URL: z
    .string()
    .default(
      "https://docs.google.com/spreadsheets/d/1qAuw2ebWPJmcy_gl4Qf48GfmnSGLZumDfs62fpG2BGA/export?format=csv&gid=1582301730",
    ),
  WHATSAPP_MIN_DELAY_SECONDS: z.coerce.number().int().min(1).default(183),
  WHATSAPP_MAX_DELAY_SECONDS: z.coerce.number().int().min(1).default(304),
  WHATSAPP_RECENT_CONTACT_BLOCK_DAYS: z.coerce.number().int().min(1).default(7),
  OLIST_API_TOKEN: z.string().optional(),
  OLIST_API_BASE_URL: z.string().default("https://api.tiny.com.br/api2"),
  OLIST_SYNC_START_DATE: z.string().default("2026-01-01"),
  // Janela de segurança (dias) que a sync incremental sempre revarre, mesmo que
  // o cursor esteja mais recente — garante que vendas de hoje nunca fiquem de
  // fora por cursor adiantado ou falha de sync.
  OLIST_SYNC_SAFETY_DAYS: z.coerce.number().int().min(1).max(30).default(2),
  STARTUP_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Reconstrucao completa diaria dos read-models (orders/order_items/snapshots) a
  // partir do sales_raw. Rede de seguranca contra drift: se um sync for interrompido
  // e deixar pedidos de algum cliente sem reconstruir, o rebuild diario autocorrige.
  DAILY_REBUILD_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DAILY_REBUILD_HOUR: z.coerce.number().int().min(0).max(23).default(4),
  // Limpeza de rotina dos payloads crus de auditoria (raw_payload, provider_payload,
  // response_payload) que incham as tabelas de mensagem. NULLifica essas colunas em
  // linhas mais antigas que PAYLOAD_RETENTION_DAYS, mantendo texto/metadados. Só toca
  // colunas que o runtime NÃO lê. Roda 1x/dia, em lotes, sem travar escrita.
  PAYLOAD_CLEANUP_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  PAYLOAD_CLEANUP_HOUR: z.coerce.number().int().min(0).max(23).default(3),
  PAYLOAD_RETENTION_DAYS: z.coerce.number().int().min(7).default(90),
  // A mídia (foto/áudio/vídeo) é guardada em base64 dentro de media_json (~737KB/linha
  // = os 21GB de whatsapp_monitor_messages). Após esta janela, removemos só a chave
  // mediaBase64 (o chat cai pro mediaUrl). Mídia mais nova que isso continua inline.
  MEDIA_BASE64_RETENTION_DAYS: z.coerce.number().int().min(7).default(30),
  WORKER_OLIST_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WORKER_OLIST_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  WORKER_GEOGRAPHIC_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WORKER_GEOGRAPHIC_SYNC_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
  WORKER_WHATSAPP_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WORKER_WHATSAPP_SYNC_INTERVAL_HOURS: z.coerce.number().int().positive().default(12),
  WORKER_CREDIT_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  WORKER_CREDIT_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  WORKER_SENTIMENT_AGGREGATION_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WORKER_SENTIMENT_AGGREGATION_INTERVAL_HOURS: z.coerce.number().int().positive().default(6),
  WORKER_WHATSAPP_ACTIVITY_ROLLUP_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WORKER_WHATSAPP_ACTIVITY_ROLLUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  WORKER_WHATSAPP_WEBHOOK_WATCHDOG_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WORKER_WHATSAPP_WEBHOOK_WATCHDOG_INTERVAL_MINUTES: z.coerce.number().int().positive().default(10),
  WHATSAPP_ACTIVITY_ROLLUP_REFRESH_DAYS: z.coerce.number().int().min(2).max(120).default(3),
  // Quão "velho" o rollup de hoje pode estar antes de uma visita ao dashboard
  // disparar um refresh em background. Era fixo em 5min (refazia a query pesada
  // a cada acesso); 15min reduz a CPU sem o painel ficar perceptivelmente atrasado.
  WHATSAPP_ACTIVITY_ROLLUP_STALE_MINUTES: z.coerce.number().int().positive().default(15),
  WHATSAPP_ACTIVITY_ROLLUP_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  WHATSAPP_INCOMING_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  WHATSAPP_ACTIVITY_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(90),
  WHATSAPP_ROLLUP_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(90),
  EVENTS_RESOLVED_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  EVENTS_LOW_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(60),
  EVENTS_SENTIMENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  DATABASE_CLEANUP_BATCH_SIZE: z.coerce.number().int().min(100).max(50_000).default(5_000),
  SUPABASE_DATABASE_URL: z.string().optional(),
  SUPABASE_TABLE_2026: z.string().default("f_vendas_2026"),
  // Janela de seguranca (dias) que a sync do Supabase sempre revarre, mesmo que o
  // cursor (maior data ja importada) esteja a frente — garante que vendas lancadas
  // com data retroativa nunca fiquem de fora. Dedup por fingerprint evita duplicar.
  SUPABASE_SYNC_SAFETY_DAYS: z.coerce.number().int().min(0).max(365).default(60),
  SUPABASE_URL: z.string().default(""),
  SUPABASE_ANON_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  VITE_SUPABASE_URL: z.string().default(""),
  VITE_SUPABASE_ANON_KEY: z.string().default(""),
  HISTORICAL_FILES: z.string().default(""),
  // Dropbox API
  DROPBOX_ACCESS_TOKEN: z.string().optional(),
  DROPBOX_REFRESH_TOKEN: z.string().optional(),
  DROPBOX_APP_KEY: z.string().optional(),
  DROPBOX_APP_SECRET: z.string().optional(),
  // Caminho no Dropbox (ex: /XP SALDO TEMPORARIO)
  DROPBOX_CUSTOMER_CREDIT_PATH: z.string().default("/XP SALDO TEMPORARIO"),
  CUSTOMER_CREDIT_WORKBOOK_DIR: z
    .string()
    .default("C:\\Users\\Felipe\\Dropbox\\XP SALDO TEMPORARIO"),
  CUSTOMER_CREDIT_WORKBOOK_PREFIX: z.string().default("SALDO VENDAS"),
  INVENTORY_SHEET_SOURCE_NAME: z.string().default("APP Orçamento Facil Expor telas"),
  INVENTORY_SHEET_CSV_URL: z
    .string()
    .default(
      "https://docs.google.com/spreadsheets/d/1qAuw2ebWPJmcy_gl4Qf48GfmnSGLZumDfs62fpG2BGA/export?format=csv&gid=1219258954",
    ),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  META_ADS_ACCESS_TOKEN: z.string().optional(),
  META_ADS_ACCOUNT_ID: z.string().default(""),
  META_ADS_API_VERSION: z.string().default("v23.0"),
  META_ADS_CURRENCY: z.string().default("BRL"),
  META_ADS_TIMEZONE: z.string().default("America/Sao_Paulo"),
  META_ADS_INVOICE_SUMMARY_PATH: z.string().default(""),
  PROSPECTING_DAILY_TARGET: z.coerce.number().int().positive().default(5),
  PROSPECTING_SEARCH_PAGE_SIZE: z.coerce.number().int().min(1).max(10).default(10),
  PROSPECTING_SNAPSHOT_CACHE_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  PROSPECTING_DETAIL_CACHE_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 30),
  PROSPECTING_TEXT_SEARCH_DAILY_LIMIT: z.coerce.number().int().positive().default(125),
  PROSPECTING_TEXT_SEARCH_MONTHLY_LIMIT: z.coerce.number().int().positive().default(4000),
  PROSPECTING_PLACE_DETAILS_DAILY_LIMIT: z.coerce.number().int().positive().default(25),
  PROSPECTING_PLACE_DETAILS_MONTHLY_LIMIT: z.coerce.number().int().positive().default(800),
  PROSPECTING_TIMEZONE: z.string().default("America/Sao_Paulo"),
  EVOLUTION_PROCESS_GROUP_MESSAGES: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const env = envSchema.parse(process.env);

export const webOrigins = env.WEB_ORIGIN.split(",")
  .map((value) => value.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const historicalFiles = env.HISTORICAL_FILES.split(";")
  .map((value) => value.trim())
  .filter(Boolean);

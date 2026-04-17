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
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default(""),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("12h"),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(6).default("change-me"),
  EVOLUTION_API_BASE_URL: z.string().default(""),
  EVOLUTION_API_KEY: z.string().default(""),
  EVOLUTION_INSTANCE_NAME: z.string().default(""),
  WHATSAPP_DEFAULT_WORKBOOK_PATH: z.string().default("C:\\Users\\Felipe\\Desktop\\Grupos clientes e não clientes JID.xlsx"),
  WHATSAPP_MIN_DELAY_SECONDS: z.coerce.number().int().min(1).default(183),
  WHATSAPP_MAX_DELAY_SECONDS: z.coerce.number().int().min(1).default(304),
  WHATSAPP_RECENT_CONTACT_BLOCK_DAYS: z.coerce.number().int().min(1).default(7),
  OLIST_API_TOKEN: z.string().optional(),
  OLIST_API_BASE_URL: z.string().default("https://api.tiny.com.br/api2"),
  OLIST_SYNC_START_DATE: z.string().default("2026-01-01"),
  SUPABASE_DATABASE_URL: z.string().optional(),
  SUPABASE_TABLE_2026: z.string().default("fvendas2026"),
  HISTORICAL_FILES: z.string().default(""),
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
});

export const env = envSchema.parse(process.env);

export const webOrigins = env.WEB_ORIGIN.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const historicalFiles = env.HISTORICAL_FILES.split(";")
  .map((value) => value.trim())
  .filter(Boolean);

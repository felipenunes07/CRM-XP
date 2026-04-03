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
  OLIST_API_TOKEN: z.string().optional(),
  OLIST_API_BASE_URL: z.string().default("https://api.tiny.com.br/api2"),
  OLIST_SYNC_START_DATE: z.string().default("2026-01-01"),
  SUPABASE_DATABASE_URL: z.string().optional(),
  SUPABASE_TABLE_2026: z.string().default("fvendas2026"),
  HISTORICAL_FILES: z.string().default(""),
});

export const env = envSchema.parse(process.env);

export const webOrigins = env.WEB_ORIGIN.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const historicalFiles = env.HISTORICAL_FILES.split(";")
  .map((value) => value.trim())
  .filter(Boolean);

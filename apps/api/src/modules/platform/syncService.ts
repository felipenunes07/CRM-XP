import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import { syncOlistIncremental } from "../ingestion/olistSyncService.js";
import { importSupabase2026 } from "../ingestion/supabaseImporter.js";

const DAILY_SYNC_KEY = "primary_daily_sync_date";
const DAILY_SYNC_TIMEZONE = "America/Sao_Paulo";
const DAILY_SYNC_HOUR = 6;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

let activeSync: Promise<unknown> | null = null;

function getLocalParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_SYNC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0"),
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

async function runPrimarySyncInternal(reason: string) {
  logger.info("primary sync started", { reason });

  if (env.SUPABASE_DATABASE_URL && !env.SUPABASE_DATABASE_URL.includes("[YOUR-PASSWORD]")) {
    const result = await importSupabase2026();
    await setCursor(DAILY_SYNC_KEY, getLocalParts().dateKey);
    logger.info("primary sync completed", { reason, source: "supabase_2026", result });
    return {
      source: "supabase_2026",
      result,
    };
  }

  if (env.OLIST_API_TOKEN) {
    const result = await syncOlistIncremental();
    await setCursor(DAILY_SYNC_KEY, getLocalParts().dateKey);
    logger.info("primary sync completed", { reason, source: "olist_v2", result });
    return {
      source: "olist_v2",
      result,
    };
  }

  throw new Error("Nenhuma fonte de sincronizacao ativa foi configurada.");
}

export async function runPrimarySync(reason: string) {
  if (activeSync) {
    return activeSync;
  }

  activeSync = runPrimarySyncInternal(reason).finally(() => {
    activeSync = null;
  });

  return activeSync;
}

async function shouldRunDailySync() {
  const localNow = getLocalParts();
  if (localNow.hour < DAILY_SYNC_HOUR) {
    return false;
  }

  const lastRunDate = await getCursor(DAILY_SYNC_KEY);
  return lastRunDate !== localNow.dateKey;
}

export function startDailySyncScheduler() {
  const checkAndRun = async () => {
    try {
      await runPrimarySync("startup-sync");
    } catch (error) {
      logger.error("startup sync failed", { error: String(error) });
    }
  };

  void checkAndRun();

  logger.info("startup sync triggered");

  return {
    async close() {
      // No interval to close
    },
  };
}

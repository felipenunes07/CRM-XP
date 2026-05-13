import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import { syncOlistIncremental } from "../ingestion/olistSyncService.js";
import { importSupabase2026 } from "../ingestion/supabaseImporter.js";

const DAILY_SYNC_KEY = "primary_daily_sync_date";
const HOURLY_SYNC_KEY = "primary_hourly_sync_timestamp";
const DAILY_SYNC_TIMEZONE = "America/Sao_Paulo";
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const SYNC_WINDOW_START_HOUR = 8;  // 6 AM
const SYNC_WINDOW_END_HOUR = 18;   // 10 PM

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
    const local = getLocalParts();
    await setCursor(DAILY_SYNC_KEY, local.dateKey);
    await setCursor(HOURLY_SYNC_KEY, new Date().toISOString());
    logger.info("primary sync completed", { reason, source: "supabase_2026", result });
    return {
      source: "supabase_2026",
      result,
    };
  }

  if (env.OLIST_API_TOKEN) {
    const result = await syncOlistIncremental();
    const local = getLocalParts();
    await setCursor(DAILY_SYNC_KEY, local.dateKey);
    await setCursor(HOURLY_SYNC_KEY, new Date().toISOString());
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

async function shouldRunPeriodicSync() {
  const localNow = getLocalParts();

  // 1. Check window (Optional, but helps save Supabase at night)
  if (localNow.hour < SYNC_WINDOW_START_HOUR || localNow.hour > SYNC_WINDOW_END_HOUR) {
    return false;
  }

  // 2. Check if we already ran the daily sync (at 6 AM or first time today)
  const lastDailyRun = await getCursor(DAILY_SYNC_KEY);
  if (lastDailyRun !== localNow.dateKey && localNow.hour >= SYNC_WINDOW_START_HOUR) {
    return true;
  }

  // 3. Check hourly interval
  const lastHourlyRun = await getCursor(HOURLY_SYNC_KEY);
  if (!lastHourlyRun) {
    return true;
  }

  const lastRunTime = new Date(lastHourlyRun).getTime();
  const nowTime = Date.now();

  return nowTime - lastRunTime >= SYNC_INTERVAL_MS;
}

export function startDailySyncScheduler() {
  if (!env.STARTUP_SYNC_ENABLED) {
    logger.info("startup sync disabled");
    return {
      async close() {
        return;
      },
    };
  }

  const check = async () => {
    try {
      const shouldRun = await shouldRunPeriodicSync();
      if (shouldRun) {
        logger.info("triggering scheduled periodic sync");
        await runPrimarySync("scheduled-periodic-sync");
      }
    } catch (error) {
      logger.error("scheduled periodic sync check failed", { error: String(error) });
    }
  };

  // Run immediately on startup
  void check();

  // Then check periodically
  const interval = setInterval(check, CHECK_INTERVAL_MS);

  logger.info("periodic sync scheduler initialized", {
    checkIntervalMinutes: CHECK_INTERVAL_MS / 60000,
    syncIntervalHours: SYNC_INTERVAL_MS / 3600000,
    window: `${SYNC_WINDOW_START_HOUR}h - ${SYNC_WINDOW_END_HOUR}h`
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}

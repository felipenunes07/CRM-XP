import { Client } from "pg";
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import { syncOlistIncremental } from "../ingestion/olistSyncService.js";
import { getOlistApiToken } from "../ingestion/olistTokenProvider.js";
import { importSupabase2026 } from "../ingestion/supabaseImporter.js";
import { refreshDashboardDailyMetrics } from "../analytics/analyticsService.js";
import { clearDashboardCache } from "../crm/dashboardService.js";
import { clearExecutiveDashboardCache } from "../crm/executiveDashboardService.js";

const DAILY_SYNC_KEY = "primary_daily_sync_date";
const HOURLY_SYNC_KEY = "primary_hourly_sync_timestamp";
const DAILY_SYNC_TIMEZONE = "America/Sao_Paulo";
export const PRIMARY_SYNC_INTERVAL_MINUTES = 5;
const SYNC_INTERVAL_MS = PRIMARY_SYNC_INTERVAL_MINUTES * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const PRIMARY_SYNC_ADVISORY_LOCK_ID = 742_026_814;
const SYNC_WINDOW_START_HOUR = 8;  // 8 AM
const SYNC_WINDOW_END_HOUR = 18;   // 6 PM
const SUPABASE_SALES_CHANGE_DEBOUNCE_MS = 2_000;
const SUPABASE_SALES_CHANGE_CHANNEL = "crm_sales_changed";
const SUPABASE_LISTENER_RECONNECT_MS = 15_000;

let activeSync: Promise<unknown> | null = null;

interface PrimarySyncSchedulerOptions {
  enabled: boolean;
  reason: string;
  checkIntervalMs?: number;
  runImmediately?: boolean;
  shouldRun?: () => Promise<boolean>;
  runSync?: (reason: string) => Promise<unknown>;
}

export type PrimarySyncSource = "olist_v2" | "supabase_2026";

export function resolvePrimarySyncSource(input: {
  olistConfigured: boolean;
  supabaseConfigured: boolean;
}): PrimarySyncSource | null {
  if (input.olistConfigured) return "olist_v2";
  if (input.supabaseConfigured) return "supabase_2026";
  return null;
}

export function isSupabaseSalesChangeListenerConfigured(connectionString?: string | null) {
  const value = String(connectionString ?? "").trim();
  return Boolean(value && !value.includes("[YOUR-PASSWORD]"));
}

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

  const supabaseConfigured = Boolean(
    env.SUPABASE_DATABASE_URL && !env.SUPABASE_DATABASE_URL.includes("[YOUR-PASSWORD]"),
  );
  const source = resolvePrimarySyncSource({
    olistConfigured: Boolean(await getOlistApiToken()),
    supabaseConfigured,
  });

  const completeSync = async (completedSource: PrimarySyncSource, result: unknown) => {
    const local = getLocalParts();
    await setCursor(DAILY_SYNC_KEY, local.dateKey);
    await setCursor(HOURLY_SYNC_KEY, new Date().toISOString());
    await refreshDashboardDailyMetrics();
    await clearDashboardCache();
    clearExecutiveDashboardCache();
    logger.info("primary sync completed", { reason, source: completedSource, result });
    return {
      source: completedSource,
      result,
    };
  };

  if (source === "olist_v2") {
    try {
      const result = await syncOlistIncremental({
        // O CRM ja possui o historico vindo do Supabase. Se ainda nao houver
        // cursor da Olist, buscamos somente a janela recente para que a primeira
        // atualizacao da TV termine dentro do limite do agendador.
        initialLookbackDays: env.OLIST_SYNC_SAFETY_DAYS,
      });
      return await completeSync("olist_v2", result);
    } catch (error) {
      if (!supabaseConfigured) throw error;
      logger.warn("olist primary sync failed; using supabase fallback", {
        reason,
        error: String(error),
      });
    }
  }

  if (supabaseConfigured) {
    const result = await importSupabase2026();
    return await completeSync("supabase_2026", result);
  }

  throw new Error("Nenhuma fonte de sincronizacao ativa foi configurada.");
}

export async function runPrimarySync(reason: string) {
  if (activeSync) {
    return activeSync;
  }

  const syncPromise = (async () => {
    const lockClient = await pool.connect();
    let lockAcquired = false;

    try {
      const lockResult = await lockClient.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        [PRIMARY_SYNC_ADVISORY_LOCK_ID],
      );
      lockAcquired = Boolean(lockResult.rows[0]?.acquired);
      if (!lockAcquired) {
        logger.info("primary sync skipped because another process is already syncing", { reason });
        return { skipped: true, reason: "already-running-in-another-process" };
      }

      return await runPrimarySyncInternal(reason);
    } finally {
      if (lockAcquired) {
        await lockClient.query("SELECT pg_advisory_unlock($1)", [PRIMARY_SYNC_ADVISORY_LOCK_ID]).catch((error) => {
          logger.warn("failed to release primary sync advisory lock", { reason, error: String(error) });
        });
      }
      lockClient.release();
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("A sincronizacao excedeu o limite de 10 minutos.")), 10 * 60 * 1000)
  );

  activeSync = Promise.race([syncPromise, timeoutPromise]).finally(() => {
    activeSync = null;
  });

  return activeSync;
}

async function shouldRunPeriodicSync() {
  // 0. Check if weekend / determine window dynamic hours (America/Sao_Paulo)
  const localDayOfWeek = new Date().toLocaleDateString("en-US", {
    timeZone: DAILY_SYNC_TIMEZONE,
    weekday: "short"
  });

  let startHour = 8;
  let endHour = 18;

  if (localDayOfWeek === "Sun") {
    return false; // Domingo nunca sincroniza
  } else if (localDayOfWeek === "Sat") {
    startHour = 9;  // Sábado das 9h
    endHour = 13;   // às 13h
  } else {
    startHour = 8;  // Segunda a Sexta das 8h
    endHour = 18;   // às 18h
  }

  const localNow = getLocalParts();

  // 1. Check window (America/Sao_Paulo time)
  if (localNow.hour < startHour || localNow.hour > endHour) {
    return false;
  }

  // 2. Check if we already ran the daily sync (first time today within startHour)
  const lastDailyRun = await getCursor(DAILY_SYNC_KEY);
  if (lastDailyRun !== localNow.dateKey && localNow.hour >= startHour) {
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

export function startPrimarySyncScheduler({
  enabled,
  reason,
  checkIntervalMs = CHECK_INTERVAL_MS,
  runImmediately = true,
  shouldRun = shouldRunPeriodicSync,
  runSync = runPrimarySync,
}: PrimarySyncSchedulerOptions) {
  if (!enabled) {
    logger.info("primary sync scheduler disabled", { reason });
    return {
      async close() {
        return;
      },
    };
  }

  const check = async () => {
    try {
      const shouldRunNow = await shouldRun();
      if (shouldRunNow) {
        logger.info("triggering scheduled periodic sync", { reason });
        await runSync(reason);
      }
    } catch (error) {
      logger.error("scheduled periodic sync check failed", { reason, error: String(error) });
    }
  };

  if (runImmediately) {
    void check();
  }

  const interval = setInterval(check, checkIntervalMs);

  logger.info("periodic sync scheduler initialized", {
    reason,
    checkIntervalMinutes: checkIntervalMs / 60000,
    syncIntervalHours: SYNC_INTERVAL_MS / 3600000,
    window: `segunda-sexta ${SYNC_WINDOW_START_HOUR}h-${SYNC_WINDOW_END_HOUR}h; sabado 9h-13h`
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}

export function startDailySyncScheduler() {
  return startPrimarySyncScheduler({
    // Em alguns ambientes EasyPanel somente o processo da API permanece ativo.
    // O lock distribuido acima impede duplicidade quando o worker tambem existe.
    enabled: env.STARTUP_SYNC_ENABLED || env.WORKER_OLIST_SYNC_ENABLED,
    reason: "scheduled-periodic-sync",
  });
}

export function startSupabaseSalesChangeListener() {
  if (!isSupabaseSalesChangeListenerConfigured(env.SUPABASE_DATABASE_URL)) {
    logger.info("supabase sales change listener disabled because database credentials are missing");
    return {
      async close() {
        return;
      },
    };
  }

  let debounceTimer: NodeJS.Timeout | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let client: Client | null = null;
  let closed = false;
  let initialSyncTriggered = false;

  const scheduleSync = (reason: string) => {
    if (closed) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      runPrimarySync(reason).catch((error) => {
        logger.error("supabase sales change sync failed", { reason, error: String(error) });
      });
    }, SUPABASE_SALES_CHANGE_DEBOUNCE_MS);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, SUPABASE_LISTENER_RECONNECT_MS);
  };

  const connect = async () => {
    if (closed) return;
    const nextClient = new Client({
      connectionString: env.SUPABASE_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
    });
    client = nextClient;
    nextClient.on("notification", (message) => {
      if (message.channel === SUPABASE_SALES_CHANGE_CHANNEL) {
        scheduleSync("supabase-sales-change");
      }
    });
    nextClient.on("error", (error) => {
      logger.warn("supabase sales change listener error", { error: String(error) });
      if (client === nextClient) client = null;
      scheduleReconnect();
    });
    nextClient.on("end", () => {
      if (client === nextClient) client = null;
      scheduleReconnect();
    });

    try {
      await nextClient.connect();
      await nextClient.query(`LISTEN ${SUPABASE_SALES_CHANGE_CHANNEL}`);
      logger.info("supabase sales change listener connected", {
        table: env.SUPABASE_TABLE_2026,
      });
      if (!initialSyncTriggered) {
        initialSyncTriggered = true;
        // Atualiza imediatamente ao iniciar/reimplantar o backend, sem aguardar
        // a proxima janela de 15 minutos do agendador de contingencia.
        scheduleSync("supabase-sales-listener-startup");
      }
    } catch (error) {
      logger.warn("failed to connect supabase sales change listener", { error: String(error) });
      if (client === nextClient) client = null;
      await nextClient.end().catch(() => undefined);
      scheduleReconnect();
    }
  };

  void connect();

  return {
    async close() {
      closed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const activeClient = client;
      client = null;
      if (activeClient) await activeClient.end().catch(() => undefined);
    },
  };
}

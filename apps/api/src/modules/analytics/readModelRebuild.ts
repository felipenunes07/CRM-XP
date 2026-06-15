/**
 * Reconstrucao completa dos read-models (customers, orders, order_items,
 * snapshots) a partir do sales_raw — para TODOS os clientes, nao so os que
 * mudaram no ultimo sync.
 *
 * Existe porque rebuildReadModels() so reprocessa clientes com linha nova em cada
 * sync. Se um sync for interrompido (timeout) depois de gravar no sales_raw mas
 * antes de terminar a reconstrucao, os pedidos daqueles clientes ficam furados
 * para sempre (syncs futuros veem "0 novas linhas" e nunca mais os tocam). O
 * total de telas/pecas do dashboard fica abaixo do sales_raw/Supabase.
 *
 * - rebuildAllReadModels(): reprocessa todo mundo, com trava anti-concorrencia.
 * - startDailyRebuildScheduler(): roda rebuildAllReadModels 1x/dia na madrugada,
 *   autocorrigindo qualquer drift sem intervencao manual.
 */
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import { rebuildReadModels, refreshDashboardDailyMetrics } from "./analyticsService.js";
import { clearDashboardCache } from "../crm/dashboardService.js";

const BATCH_SIZE = 200;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // checa a cada 30 min
const REBUILD_TIMEZONE = "America/Sao_Paulo";
const REBUILD_CURSOR_KEY = "daily_rebuild_date";

// Garante que dois rebuilds completos (ex.: script manual + agendador diario)
// nunca rodem ao mesmo tempo, evitando DELETE/INSERT concorrentes em orders.
let activeRebuild: Promise<{ customers: number }> | null = null;

export function rebuildAllReadModels(
  onProgress?: (done: number, total: number) => void,
): Promise<{ customers: number }> {
  if (activeRebuild) {
    return activeRebuild;
  }

  activeRebuild = (async () => {
    const { rows } = await pool.query<{ customer_code: string }>(
      `SELECT DISTINCT customer_code
         FROM sales_raw
        WHERE COALESCE(customer_code, '') <> ''
        ORDER BY customer_code`,
    );
    const codes = rows.map((row) => row.customer_code);

    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
      await rebuildReadModels(codes.slice(i, i + BATCH_SIZE));
      onProgress?.(Math.min(i + BATCH_SIZE, codes.length), codes.length);
    }

    await refreshDashboardDailyMetrics();
    await clearDashboardCache();
    return { customers: codes.length };
  })().finally(() => {
    activeRebuild = null;
  });

  return activeRebuild;
}

function getLocalParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: REBUILD_TIMEZONE,
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

export function startDailyRebuildScheduler() {
  if (!env.DAILY_REBUILD_ENABLED) {
    logger.info("daily read-model rebuild scheduler disabled");
    return {
      async close() {
        return;
      },
    };
  }

  const check = async () => {
    try {
      const now = getLocalParts();
      if (now.hour !== env.DAILY_REBUILD_HOUR) {
        return;
      }
      const lastRun = await getCursor(REBUILD_CURSOR_KEY);
      if (lastRun === now.dateKey) {
        return; // ja rodou hoje
      }

      logger.info("daily read-model rebuild started", { dateKey: now.dateKey });
      const result = await rebuildAllReadModels();
      await setCursor(REBUILD_CURSOR_KEY, now.dateKey);
      logger.info("daily read-model rebuild completed", { dateKey: now.dateKey, ...result });
    } catch (error) {
      logger.error("daily read-model rebuild failed", { error: String(error) });
    }
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  void check();

  logger.info("daily read-model rebuild scheduler initialized", {
    hour: env.DAILY_REBUILD_HOUR,
    timezone: REBUILD_TIMEZONE,
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}

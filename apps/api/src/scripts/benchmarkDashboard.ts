/**
 * Mede a mesma funcao que atende GET /api/dashboard/metrics, com o cache
 * controlado. Rodar apos um deploy para comparar cache frio e quente sem
 * invalidar dashboards de outros usuarios.
 *
 *   DASHBOARD_BENCHMARK_RUNS=5 npm run db:benchmark:dashboard -w @olist-crm/api
 */
import { pool, redis } from "../db/client.js";
import { getDashboardMetrics } from "../modules/crm/dashboardService.js";

const cacheKey = "dashboard_metrics:v2:default:all";
const requestedRuns = Number(process.env.DASHBOARD_BENCHMARK_RUNS ?? 5);
const runs = Number.isFinite(requestedRuns) ? Math.max(1, Math.min(20, Math.floor(requestedRuns))) : 5;

type Measurement = {
  cache: "cold" | "warm";
  run: number;
  ms: number;
  status: "ok" | string;
};

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    min: sorted[0] ?? 0,
    median: sorted.length % 2 === 0
      ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
      : (sorted[middle] ?? 0),
    max: sorted.at(-1) ?? 0,
  };
}

async function measure(cache: Measurement["cache"], run: number): Promise<Measurement> {
  const start = performance.now();
  try {
    await getDashboardMetrics();
    return { cache, run, ms: Math.round(performance.now() - start), status: "ok" };
  } catch (error) {
    return {
      cache,
      run,
      ms: Math.round(performance.now() - start),
      status: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results: Measurement[] = [];

  for (let run = 1; run <= runs; run += 1) {
    // A chave e a mesma que a rota usa e e a unica invalidada pelo teste.
    await redis.del(cacheKey);
    results.push(await measure("cold", run));
    results.push(await measure("warm", run));
  }

  console.table(results);
  for (const cache of ["cold", "warm"] as const) {
    const timings = results.filter((result) => result.cache === cache && result.status === "ok").map((result) => result.ms);
    console.log(`${cache}:`, summarize(timings));
  }

  if (results.some((result) => result.status !== "ok")) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit();
    await pool.end();
  });

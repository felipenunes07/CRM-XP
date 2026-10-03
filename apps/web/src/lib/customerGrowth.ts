export type GrowthTrend = "up" | "down" | "stable" | "new" | "stopped";

export interface GrowthSummary {
  previousAvg: number;
  recentAvg: number;
  // Variacao percentual da media recente sobre a anterior (null quando nao ha base).
  changePct: number | null;
  // Diferenca absoluta por mes entre as duas medias.
  delta: number;
  // Meses seguidos, terminando no ultimo mes, em que o valor subiu.
  upStreak: number;
  downStreak: number;
  trend: GrowthTrend;
}

// Variacao minima (em %) para considerar que o cliente subiu ou caiu.
export const GROWTH_THRESHOLD_PCT = 15;

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function streak(values: number[], direction: 1 | -1) {
  let count = 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const current = values[index] ?? 0;
    const previous = values[index - 1] ?? 0;
    if ((current - previous) * direction > 0) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

// Compara a metade mais recente com a metade anterior, contando a partir do
// primeiro mes em que o cliente comprou o produto. Assim um produto que o
// cliente comecou a comprar no meio do periodo (ex.: bateria) tambem mostra
// quem esta caindo, em vez de todo mundo aparecer como "novo".
export function summarizeGrowth(values: number[]): GrowthSummary {
  const firstPurchase = values.findIndex((value) => value > 0);
  const active = firstPurchase === -1 ? [] : values.slice(firstPurchase);
  const upStreak = streak(values, 1);
  const downStreak = streak(values, -1);

  if (active.length < 2) {
    const recentAvg = active[0] ?? 0;
    return {
      previousAvg: 0,
      recentAvg,
      changePct: null,
      delta: recentAvg,
      upStreak,
      downStreak,
      trend: recentAvg > 0 ? "new" : "stable",
    };
  }

  const half = Math.floor(active.length / 2);
  const previousAvg = average(active.slice(0, active.length - half));
  const recentAvg = average(active.slice(active.length - half));
  const delta = recentAvg - previousAvg;
  const changePct = previousAvg > 0 ? (delta / previousAvg) * 100 : null;

  let trend: GrowthTrend = "stable";
  if (recentAvg === 0) {
    trend = "stopped";
  } else if (changePct !== null && changePct >= GROWTH_THRESHOLD_PCT) {
    trend = "up";
  } else if (changePct !== null && changePct <= -GROWTH_THRESHOLD_PCT) {
    trend = "down";
  }

  return { previousAvg, recentAvg, changePct, delta, upStreak, downStreak, trend };
}

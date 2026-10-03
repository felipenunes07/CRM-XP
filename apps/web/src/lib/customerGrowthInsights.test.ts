import { describe, expect, it } from "vitest";
import type { CustomerGrowthMetric, CustomerGrowthResponse } from "./api";
import { computeGrowthInsights } from "./customerGrowthInsights";

const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

function customer(id: string, series: Partial<Record<CustomerGrowthMetric, number[]>>) {
  const zero = months.map(() => 0);
  const screenXp = series.screenXp ?? zero;
  const screenDe = series.screenDe ?? zero;
  const battery = series.battery ?? zero;
  const dock = series.dock ?? zero;
  return {
    customerId: id,
    customerCode: id.toUpperCase(),
    displayName: `Cliente ${id}`,
    series: {
      screenXp,
      screenDe,
      screenVv: series.screenVv ?? zero,
      battery,
      dock,
      pieces: series.pieces ?? months.map((_, index) => (screenXp[index] ?? 0) + (screenDe[index] ?? 0) + (battery[index] ?? 0) + (dock[index] ?? 0)),
    },
  };
}

describe("computeGrowthInsights", () => {
  const data: CustomerGrowthResponse = {
    months,
    customers: [
      customer("a", { screenXp: [40, 40, 40, 20, 15, 10], screenDe: [0, 0, 0, 5, 10, 20] }),
      customer("b", { screenXp: [20, 20, 20, 20, 20, 20], battery: [2, 2, 3, 3, 4, 5] }),
      customer("c", { screenXp: [10, 10, 10, 10, 0, 0] }),
    ],
  };
  const insights = computeGrowthInsights(data);

  it("summarizes each product across all customers", () => {
    const battery = insights.products.find((product) => product.metric === "battery");
    expect(battery?.monthlyTotals).toEqual([2, 2, 3, 3, 4, 5]);
    expect(battery?.summary.trend).toBe("up");
    expect(battery?.recentBuyers).toBe(1);
    expect(battery?.monthlyBuyers).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("counts buyers per month, not per period", () => {
    const xp = insights.products.find((product) => product.metric === "screenXp");
    // c para de comprar nos 2 ultimos meses: 3,3,3,3,2,2 clientes por mes.
    expect(xp?.monthlyBuyers).toEqual([3, 3, 3, 3, 2, 2]);
    expect(xp?.previousBuyers).toBe(3);
    expect(xp?.recentBuyers).toBe(2);
  });

  it("finds customers that stopped buying in the last months", () => {
    expect(insights.wentQuiet.customers.map((entry) => entry.customerId)).toEqual(["c"]);
  });

  it("suggests battery for customers buying screens without batteries", () => {
    expect(insights.screensWithoutBattery.customers.map((entry) => entry.customerId)).toEqual(["a"]);
    expect(insights.screensWithoutDock.total).toBe(2);
  });

  it("detects customers moving from XP to DE screens", () => {
    expect(insights.xpToDe.customers.map((entry) => entry.customerId)).toEqual(["a"]);
  });

  it("lists big customers that are falling", () => {
    expect(insights.bigFalling.customers.map((entry) => entry.customerId)).toEqual(["a", "c"]);
    expect(insights.bigFalling.lostPerMonth).toBeLessThan(0);
  });
});

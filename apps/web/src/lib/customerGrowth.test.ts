import { describe, expect, it } from "vitest";
import { summarizeGrowth } from "./customerGrowth";

describe("summarizeGrowth", () => {
  it("compares the recent half of the period with the previous half", () => {
    const summary = summarizeGrowth([2, 2, 2, 4, 4, 4]);
    expect(summary.previousAvg).toBe(2);
    expect(summary.recentAvg).toBe(4);
    expect(summary.changePct).toBe(100);
    expect(summary.trend).toBe("up");
  });

  it("flags small customers that grow every month", () => {
    const summary = summarizeGrowth([1, 2, 3, 4, 5, 6]);
    expect(summary.upStreak).toBe(5);
    expect(summary.downStreak).toBe(0);
    expect(summary.trend).toBe("up");
  });

  it("detects customers that are falling", () => {
    const summary = summarizeGrowth([30, 28, 25, 12, 10, 8]);
    expect(summary.trend).toBe("down");
    expect(summary.downStreak).toBe(5);
  });

  it("treats small variations as stable", () => {
    expect(summarizeGrowth([10, 11, 10, 10, 11, 10]).trend).toBe("stable");
  });

  it("starts counting from the first month the customer bought the product", () => {
    // Comecou a comprar no 4o mes e caiu depois: deve aparecer em queda, nao como novo.
    const falling = summarizeGrowth([0, 0, 0, 40, 20, 5]);
    expect(falling.previousAvg).toBe(30);
    expect(falling.recentAvg).toBe(5);
    expect(falling.trend).toBe("down");

    expect(summarizeGrowth([0, 0, 0, 10, 30, 60]).trend).toBe("up");
  });

  it("marks customers that only bought in the last month or stopped buying", () => {
    expect(summarizeGrowth([0, 0, 0, 0, 0, 5]).trend).toBe("new");
    expect(summarizeGrowth([5, 4, 6, 0, 0, 0]).trend).toBe("stopped");
  });

  it("does not call a single big order growth when the last month falls back", () => {
    // Comprou 701 em um mes e 10 no seguinte: pico isolado, nao crescimento.
    expect(summarizeGrowth([0, 0, 50, 0, 701, 10]).trend).toBe("irregular");
    // Caiu na media, mas o ultimo mes voltou ao nivel anterior.
    expect(summarizeGrowth([20, 20, 20, 0, 0, 25]).trend).toBe("irregular");
  });
});

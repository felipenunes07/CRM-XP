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

  it("marks customers that started or stopped buying", () => {
    expect(summarizeGrowth([0, 0, 0, 3, 0, 5]).trend).toBe("new");
    expect(summarizeGrowth([5, 4, 6, 0, 0, 0]).trend).toBe("stopped");
  });
});

import { describe, expect, it } from "vitest";
import {
  resolveInventoryBuyRecommendation,
  resolveInventoryDemandStatus,
  resolveInventoryQuadrant,
  resolveInventoryStaleAction,
  resolveInventoryStockStatus,
} from "./inventoryIntelligenceService.js";

describe("resolveInventoryDemandStatus", () => {
  it("classifies no-sales, warm and hot demand bands", () => {
    expect(resolveInventoryDemandStatus(0, 0)).toBe("NO_SALES");
    expect(resolveInventoryDemandStatus(52, 4)).toBe("WARM");
    expect(resolveInventoryDemandStatus(210, 8)).toBe("HOT");
    expect(resolveInventoryDemandStatus(12, 2)).toBe("COLD");
  });
});

describe("resolveInventoryStockStatus", () => {
  it("classifies negative, out, low, healthy and high stock states", () => {
    expect(resolveInventoryStockStatus(-3, null)).toBe("NEGATIVE");
    expect(resolveInventoryStockStatus(0, null)).toBe("OUT");
    expect(resolveInventoryStockStatus(8, 40)).toBe("LOW");
    expect(resolveInventoryStockStatus(18, 11)).toBe("LOW");
    expect(resolveInventoryStockStatus(24, 32)).toBe("HEALTHY");
    expect(resolveInventoryStockStatus(70, 90)).toBe("HIGH");
  });
});

describe("resolveInventoryQuadrant", () => {
  it("routes items to the expected decision quadrant", () => {
    expect(
      resolveInventoryQuadrant({
        stockCurrent: 0,
        coverageDays: null,
        sales90: 95,
        orders90: 10,
      }),
    ).toBe("REPLENISH_URGENT");

    expect(
      resolveInventoryQuadrant({
        stockCurrent: 42,
        coverageDays: 51,
        sales90: 110,
        orders90: 14,
      }),
    ).toBe("DRIVE_NOW");

    expect(
      resolveInventoryQuadrant({
        stockCurrent: 85,
        coverageDays: null,
        sales90: 0,
        orders90: 0,
      }),
    ).toBe("STALLED");

    expect(
      resolveInventoryQuadrant({
        stockCurrent: 18,
        coverageDays: null,
        sales90: 5,
        orders90: 1,
      }),
    ).toBe("MONITOR");
  });
});

describe("resolveInventoryBuyRecommendation", () => {
  it("prioritizes urgent buying only when demand exists and coverage is short", () => {
    expect(resolveInventoryBuyRecommendation({ stockUnits: 0, coverageDays: null, sales90: 35 })).toBe("BUY_NOW");
    expect(resolveInventoryBuyRecommendation({ stockUnits: 24, coverageDays: 14, sales90: 80 })).toBe("BUY_NOW");
    expect(resolveInventoryBuyRecommendation({ stockUnits: 36, coverageDays: 22, sales90: 55 })).toBe("WATCH");
    expect(resolveInventoryBuyRecommendation({ stockUnits: 90, coverageDays: 120, sales90: 0 })).toBe("DO_NOT_BUY");
  });
});

describe("resolveInventoryStaleAction", () => {
  it("assigns the correct stale-stock action by days without sale", () => {
    expect(resolveInventoryStaleAction(35)).toBe("MONITOR");
    expect(resolveInventoryStaleAction(64)).toBe("COMMERCIAL_PUSH");
    expect(resolveInventoryStaleAction(98)).toBe("PROMOTION");
    expect(resolveInventoryStaleAction(143)).toBe("LIQUIDATE_REVIEW");
    expect(resolveInventoryStaleAction(null)).toBe("LIQUIDATE_REVIEW");
  });
});

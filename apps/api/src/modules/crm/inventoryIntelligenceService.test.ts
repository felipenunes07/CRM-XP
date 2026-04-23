import { describe, expect, it } from "vitest";
import {
  buildInventorySeriesByModel,
  mapRestockItem,
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

describe("buildInventorySeriesByModel", () => {
  it("keeps restock history tied to the sku itself", () => {
    const { seriesByModel } = buildInventorySeriesByModel(
      new Map([["SKU-1", "SKU-1"]]),
      [
        { date: "2026-04-21", sku: "SKU-1", stockQuantity: 5 },
        { date: "2026-04-22", sku: "SKU-1", stockQuantity: 7 },
      ],
      [],
    );

    expect(seriesByModel.get("SKU-1")).toEqual([
      {
        date: "2026-04-21",
        totalStockUnits: 0,
        activeModelCount: 0,
        salesUnits: 0,
        restockUnits: 0,
        stockUnits: 5,
        activeSkuCount: 1,
      },
      {
        date: "2026-04-22",
        totalStockUnits: 0,
        activeModelCount: 0,
        salesUnits: 0,
        restockUnits: 2,
        stockUnits: 7,
        activeSkuCount: 1,
      },
    ]);
    expect(seriesByModel.has("MT E6I")).toBe(false);
  });
});

describe("mapRestockItem", () => {
  function createModel(overrides: Record<string, unknown> = {}) {
    return {
      sku: "SKU-1",
      modelKey: "SKU-1",
      modelLabel: "MT E6S",
      brand: "MT",
      family: "E6S",
      productKind: "TELA" as const,
      stockUnits: 10,
      activeSkuCount: 1,
      totalSkuCount: 1,
      sales7: 0,
      sales30: 5,
      sales90: 12,
      orders30: 2,
      orders90: 4,
      lastSaleAt: null,
      daysSinceLastSale: null,
      lastRestockAt: null,
      coverageDays: 28,
      deltaIn: 0,
      deltaOut: 0,
      trappedValue: 0,
      trappedValueEstimated: false,
      buyPriority: 1,
      buyRecommendation: "BUY_NOW",
      holdSales: false,
      qualityLabels: [],
      sampleSkus: [],
      depositNames: [],
      supplierNames: [],
      reservedStock: 0,
      currentItems: [],
      ...overrides,
    } as any;
  }

  it("does not include buy-now models when no restock was actually detected", () => {
    expect(mapRestockItem(createModel(), [], "2026-04-23")).toBeNull();
  });

  it("uses the current snapshot delta when the daily series collapsed the intraday entry", () => {
    const item = mapRestockItem(
      createModel({
        buyRecommendation: "WATCH",
        deltaIn: 4,
        lastRestockAt: "2026-04-23",
      }),
      [
        {
          date: "2026-04-23",
          totalStockUnits: 0,
          activeModelCount: 0,
          salesUnits: 0,
          restockUnits: 0,
          stockUnits: 10,
          activeSkuCount: 1,
        },
      ],
      "2026-04-23",
    );

    expect(item).toMatchObject({
      sku: "SKU-1",
      lastRestockAt: "2026-04-23",
      restockUnits: 4,
      stockBefore: 6,
      stockAfter: 10,
      status: "ARRIVED_TODAY",
    });
  });
});

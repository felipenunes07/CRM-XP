import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PacklistSnapshot } from "./packlistService.js";

const mocks = vi.hoisted(() => ({ query: vi.fn(), inventory: vi.fn(), packlist: vi.fn() }));
vi.mock("../../db/client.js", () => ({ pool: { query: mocks.query } }));
vi.mock("./inventoryService.js", () => ({ getInventorySnapshotWithItems: mocks.inventory }));
vi.mock("./packlistService.js", () => ({ getPacklistSnapshot: mocks.packlist }));
import { getInventoryBuying } from "./inventoryIntelligenceService.js";

let revision = 0;
const snapshot = (): PacklistSnapshot => ({
  meta: { sourceUpdatedAt: "2026-11-06T18:00:00Z", importedAt: `2026-11-07T12:${String(++revision).padStart(2, "0")}:00Z`, lastError: null, receivedLots: 103, pendingLots: 1 },
  data: { receivedLots: 103, lots: [{ id: "LOT-1", status: "IN_TRANSIT", departureDate: "2026-09-18", arrivalDate: "2026-11-17", inferredYear: true, quantities: { "0002-1": 60 } }] },
});

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  vi.clearAllMocks();
  mocks.inventory.mockResolvedValue({ snapshot: { id: "stock", importedAt: "2026-11-07T10:00:00Z" }, items: [
    { sku: "0001-1", model: "IP-11 ORI", color: "PRETO", quality: "ORI", price: 50, stockQuantity: 5 },
    { sku: "0002-1", model: "IP-12 ORI", color: "PRETO", quality: "ORI", price: 50, stockQuantity: 20 },
  ] });
  mocks.packlist.mockResolvedValue(snapshot());
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('AS sales90') ? [
    { sku: "0001-1", sales30: 30, sales90: 90, orders30: 5, orders90: 15 },
    { sku: "0002-1", sales30: 30, sales90: 90, orders30: 5, orders90: 15 },
  ] : [] }));
});
afterEach(() => vi.useRealTimers());

describe("buying API dataset with Packlist and system stock/sales", () => {
  it("joins by SKU, uses system demand/stock and avoids buying an already covered SKU", async () => {
    const response = await getInventoryBuying();
    expect(response.items.find((item) => item.sku === "0001-1")).toMatchObject({ stockUnits: 5, sales90: 90, buyRecommendation: "BUY_NOW", replenishment: { incomingUnits: 0, suggestedBuyUnits: 55, urgentAir: true } });
    expect(response.items.find((item) => item.sku === "0002-1")).toMatchObject({ stockUnits: 20, buyRecommendation: "DO_NOT_BUY", replenishment: { scheduledUnits: 60, suggestedBuyUnits: 0 } });
    expect(response.packlist?.pendingLots).toBe(1);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("FROM order_items oi") && sql.includes("JOIN orders"))).toBe(true);
  });

  it("invalidates the analytics cache when a new Packlist snapshot removes a received lot", async () => {
    await getInventoryBuying();
    const updated = snapshot(); updated.data!.lots = []; updated.meta.pendingLots = 0;
    mocks.packlist.mockResolvedValue(updated);
    const result = await getInventoryBuying();
    expect(result.items.find((item) => item.sku === "0002-1")).toMatchObject({ buyRecommendation: "BUY_NOW", replenishment: { incomingUnits: 0, suggestedBuyUnits: 40 } });
  });

  it("keeps an unavailable Packlist distinct from a valid snapshot with no shipments", async () => {
    mocks.packlist.mockResolvedValue({ data: null, meta: { importedAt: null, sourceUpdatedAt: null, receivedLots: 0, pendingLots: 0, lastError: "Não foi possível ler" } });
    const result = await getInventoryBuying();
    expect(result.items.every((item) => item.replenishment === null)).toBe(true);
    expect(result.items.find((item) => item.sku === "0002-1")?.buyRecommendation).toBe("WATCH");
    expect(result.packlist?.lastError).toBe("Não foi possível ler");
  });

  it("flags incoming SKUs outside the catalog without allocating them to another model", async () => {
    const updated = snapshot(); updated.data!.lots[0]!.quantities = { "OTHER-SKU": 60 };
    mocks.packlist.mockResolvedValue(updated);
    const result = await getInventoryBuying();
    expect(result.packlist?.unmatchedSkuCount).toBe(1);
    expect(result.items.every((item) => item.replenishment?.incomingUnits === 0)).toBe(true);
  });
});

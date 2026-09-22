import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db/client.js", () => ({ pool: { query: queryMock } }));
vi.mock("../../lib/env.js", () => ({ env: { GEOGRAPHIC_SHEET_CSV_URL: "" } }));

import { getGeographicSalesStats } from "./geographicService.js";

beforeEach(() => queryMock.mockReset());

describe("geographic model filter", () => {
  it("applies the same model and quality to state, city and customer totals", async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const result = await getGeographicSalesStats({ model: " K40s ", quality: " ori " });

    expect(result.summary.totalPieces).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(3);
    for (const [sql, params] of queryMock.mock.calls) {
      expect(sql).toContain("inventory_snapshot_items");
      expect(sql).toContain("product.quality");
      expect(params).toEqual(["K40S", "ORI"]);
    }
  });

  it("keeps the original all-model query when no product filter is chosen", async () => {
    queryMock.mockResolvedValue({ rows: [] });

    await getGeographicSalesStats();

    for (const [sql, params] of queryMock.mock.calls) {
      expect(sql).not.toContain("inventory_snapshot_items");
      expect(params).toEqual([]);
    }
  });
});

import { describe, expect, it } from "vitest";
import { getInventorySalesPresetRange } from "./InventorySalesTab";

describe("getInventorySalesPresetRange", () => {
  it("monta o atalho de seis meses ate o dia informado", () => {
    expect(getInventorySalesPresetRange(6, new Date(2026, 8, 13))).toEqual({
      dateFrom: "2026-04-01",
      dateTo: "2026-09-13",
    });
  });

  it("atravessa a virada do ano no atalho de doze meses", () => {
    expect(getInventorySalesPresetRange(12, new Date(2026, 8, 13))).toEqual({
      dateFrom: "2025-10-01",
      dateTo: "2026-09-13",
    });
  });
});

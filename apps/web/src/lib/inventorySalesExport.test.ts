import { describe, expect, it } from "vitest";
import { buildInventorySalesExportRows } from "./inventorySalesExport";

describe("buildInventorySalesExportRows", () => {
  it("mantém os totais e calcula o preço médio de cada grupo filtrado", () => {
    const [row] = buildInventorySalesExportRows([
      {
        label: "Samsung",
        units: 12,
        revenue: 618.6,
        stockUnits: 8,
        lastSaleAt: "2026-09-13",
        skuCount: 3,
      },
    ]);

    expect(row).toMatchObject(["Samsung", 12, 618.6, expect.any(Number), 8, "2026-09-13", 3]);
    expect(row?.[3]).toBeCloseTo(51.55, 2);
  });

  it("deixa o preço médio vazio quando não houve venda", () => {
    expect(
      buildInventorySalesExportRows([
        {
          label: "Sem venda",
          units: 0,
          revenue: 0,
          stockUnits: 4,
          lastSaleAt: null,
          skuCount: 1,
        },
      ])[0]?.[3],
    ).toBeNull();
  });
});

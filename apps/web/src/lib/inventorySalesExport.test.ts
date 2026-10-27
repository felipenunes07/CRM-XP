import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildInventorySalesExportRows, buildInventorySalesWorkbook } from "./inventorySalesExport";
import type { InventorySalesReportItem } from "@olist-crm/shared";

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

it("exporta todos os SKUs filtrados mesmo quando o resumo tem uma única marca", async () => {
  const item = (sku: string, units: number): InventorySalesReportItem => ({
    sku, modelKey: null, modelLabel: `Modelo ${sku}`, brand: "IPHONE", factory: "VV", family: "IPHONE",
    category: "TELA", quality: "ORI", color: null, inCatalog: true, stockUnits: 5,
    totalUnits: units, totalRevenue: units * 10, totalOrders: 1, lastSaleAt: "2026-10-27",
    previousUnits: 0, previousRevenue: 0, monthlyUnits: [units], monthlyRevenue: [units * 10],
  });
  const workbook = await buildInventorySalesWorkbook({
    groups: [{ label: "IPHONE", units: 5, revenue: 50, stockUnits: 10, lastSaleAt: "2026-10-27", skuCount: 2 }],
    items: [item("A", 2), item("B", 3)], months: ["2026-10"], groupLabel: "Marca",
    dateFrom: "2026-10-01", dateTo: "2026-10-27", filters: [["Vendedora", "Todas"]],
  });
  const reopened = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(reopened.Sheets["Detalhes por SKU"]!, { header: 1 });
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain("Peças 2026-10");
  expect(rows.slice(1).map((row) => row[0])).toEqual(["B", "A"]);
  expect(rows.slice(1).reduce((sum, row) => sum + Number(row[8]), 0)).toBe(5);
});

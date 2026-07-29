import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InventoryModelsResponse } from "@olist-crm/shared";
import { InventoryScreensTab } from "./InventoryScreensTab";

const inventoryData: InventoryModelsResponse = {
  snapshot: null,
  filters: {
    brands: ["IPHONE", "SAMSUNG"],
    families: ["A15", "IP 13"],
    qualities: ["INCELL", "OLED"],
  },
  items: [
    {
      sku: "IP13-OLED",
      modelKey: "TELA::IP13-OLED",
      modelLabel: "iPhone 13 OLED",
      brand: "IPHONE",
      family: "13",
      productKind: "TELA",
      stockUnits: 42,
      activeSkuCount: 1,
      totalSkuCount: 1,
      sales30: 10,
      sales90: 30,
      lastSaleAt: null,
      daysSinceLastSale: null,
      qualityLabels: ["OLED"],
      sampleSkus: ["IP13-OLED"],
      buyRecommendation: "WATCH",
    },
    {
      sku: "A15-INCELL",
      modelKey: "TELA::A15-INCELL",
      modelLabel: "Samsung A15 Incell",
      brand: "SAMSUNG",
      family: "A15",
      productKind: "TELA",
      stockUnits: 0,
      activeSkuCount: 0,
      totalSkuCount: 1,
      sales30: 4,
      sales90: 12,
      lastSaleAt: null,
      daysSinceLastSale: null,
      qualityLabels: ["INCELL"],
      sampleSkus: ["A15-INCELL"],
      buyRecommendation: "BUY_NOW",
    },
    {
      sku: "DOC-IP13",
      modelKey: "DOC_DE_CARGA::DOC-IP13",
      modelLabel: "DOC de Carga iPhone 13",
      brand: "IPHONE",
      family: "13",
      productKind: "DOC_DE_CARGA",
      stockUnits: 90,
      activeSkuCount: 1,
      totalSkuCount: 1,
      sales30: 6,
      sales90: 18,
      lastSaleAt: null,
      daysSinceLastSale: null,
      qualityLabels: [],
      sampleSkus: ["DOC-IP13"],
      buyRecommendation: "DO_NOT_BUY",
    },
  ],
};

describe("InventoryScreensTab", () => {
  it("shows only screen items with stock by default and exposes brand filters", () => {
    const markup = renderToStaticMarkup(
      <InventoryScreensTab data={inventoryData} isError={false} isLoading={false} onOpenDetails={vi.fn()} />,
    );

    expect(markup).toContain("iPhone 13 OLED");
    expect(markup).toContain("42");
    expect(markup).toContain("IPHONE");
    expect(markup).toContain("SAMSUNG");
    expect(markup).not.toContain("Samsung A15 Incell");
    expect(markup).not.toContain("DOC de Carga iPhone 13");
    expect(markup).toContain("Mostrar somente telas com estoque");
  });
});

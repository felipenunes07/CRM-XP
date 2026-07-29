import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InventoryModelDetailResponse, InventoryModelsResponse } from "@olist-crm/shared";
import { MemoryRouter } from "react-router-dom";
import { InventoryStockTab } from "./InventoryStockTab";

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
    {
      sku: "BAT-IP13",
      modelKey: "BATERIA::BAT-IP13",
      modelLabel: "Bateria iPhone 13",
      brand: "IPHONE",
      family: "13",
      productKind: "BATERIA",
      stockUnits: 18,
      activeSkuCount: 1,
      totalSkuCount: 1,
      sales30: 3,
      sales90: 9,
      lastSaleAt: null,
      daysSinceLastSale: null,
      qualityLabels: [],
      sampleSkus: ["BAT-IP13"],
      buyRecommendation: "WATCH",
    },
  ],
};

const modelDetail: InventoryModelDetailResponse = {
  snapshot: null,
  model: {
    sku: "IP13-OLED",
    modelKey: "TELA::IP13-OLED",
    modelLabel: "iPhone 13 OLED",
    brand: "IPHONE",
    family: "13",
    productKind: "TELA",
    stockUnits: 42,
    activeSkuCount: 1,
    totalSkuCount: 1,
    sales7: 3,
    sales30: 10,
    sales90: 30,
    orders30: 4,
    orders90: 12,
    lastSaleAt: "2026-07-28",
    daysSinceLastSale: 1,
    lastRestockAt: "2026-07-20",
    coverageDays: 42,
    deltaIn: 0,
    deltaOut: 0,
    trappedValue: 0,
    trappedValueEstimated: false,
    buyPriority: 30,
    buyRecommendation: "WATCH",
    holdSales: false,
    qualityLabels: ["OLED"],
    sampleSkus: ["IP13-OLED"],
  },
  dailySeries: [],
  benchmarks: {
    lowStockAvgSales: null,
    highStockAvgSales: null,
    shortMixAvgSales: null,
    wideMixAvgSales: null,
  },
  highlights: [],
  skus: [],
  deposits: [],
  topCustomers: [
    {
      customerId: "customer-1",
      customerCode: "C-001",
      customerDisplayName: "Loja Central",
      totalQuantity: 120,
      totalOrders: 8,
      quantity12Months: 72,
      orders12Months: 6,
      observedMonths: 12,
      averageMonthlyQuantity: 6,
      firstPurchaseAt: "2025-02-10",
      lastPurchaseAt: "2026-07-20",
      lastAttendant: "Amanda",
    },
  ],
};

describe("InventoryStockTab", () => {
  it("shows the general stock using the same filter and table language as sales by model", () => {
    const markup = renderToStaticMarkup(
      <InventoryStockTab
        data={inventoryData}
        detail={undefined}
        isDetailError={false}
        isDetailLoading={false}
        isError={false}
        isLoading={false}
        onSelectModel={vi.fn()}
        selectedModelKey={null}
      />,
    );

    expect(markup).toContain("Quantidade por modelo");
    expect(markup).toContain("Tipo de produto");
    expect(markup).toContain("Telas");
    expect(markup).toContain("DOCs");
    expect(markup).toContain("Baterias");
    expect(markup).toContain("iPhone 13 OLED");
    expect(markup).toContain("DOC de Carga iPhone 13");
    expect(markup).toContain("Bateria iPhone 13");
    expect(markup).not.toContain("Samsung A15 Incell");
    expect(markup).not.toContain(">Família<");
    expect(markup).not.toContain("SKUs com saldo");
  });

  it("shows customer buying frequency when a stock model is selected", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <InventoryStockTab
          data={inventoryData}
          detail={modelDetail}
          isDetailError={false}
          isDetailLoading={false}
          isError={false}
          isLoading={false}
          onSelectModel={vi.fn()}
          selectedModelKey="TELA::IP13-OLED"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Clientes que mais compram iPhone 13 OLED");
    expect(markup).toContain("Loja Central");
    expect(markup).toContain("Total comprado");
    expect(markup).toContain("Média mensal");
    expect(markup).toContain("6</strong><span>peças/mês");
    expect(markup).toContain("Tempo sem comprar");
    expect(markup).toContain("Amanda");
  });
});

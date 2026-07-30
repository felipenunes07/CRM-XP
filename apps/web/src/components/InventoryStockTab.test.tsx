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

const selectedDetail = {
  topCustomers: [
    {
      customerId: "customer-1",
      customerCode: "C-001",
      customerDisplayName: "Loja Central",
      phone: "5511999999999",
      totalQuantity: 120,
      totalOrders: 8,
      totalRevenue: 9600,
      quantity12Months: 72,
      orders12Months: 6,
      revenue12Months: 5760,
      quantity90Days: 24,
      orders90Days: 2,
      revenue90Days: 1920,
      previous90DaysQuantity: 18,
      quantity30Days: 8,
      orders30Days: 1,
      revenue30Days: 640,
      observedMonths: 12,
      averageMonthlyQuantity: 6,
      averageOrderQuantity: 15,
      averageUnitPrice: 80,
      averageDaysBetweenPurchases: 30,
      predictedNextPurchaseAt: "2026-08-19",
      trend90dPercent: 33.3,
      firstPurchaseAt: "2025-02-10",
      lastPurchaseAt: "2026-07-20",
      lastAttendant: "Amanda",
      customerTotalSpent: 68000,
      customerAverageTicket: 2100,
      customerStatus: "ACTIVE",
      customerPriorityScore: 82,
      monthlyHistory: [],
    },
  ],
} as unknown as InventoryModelDetailResponse;

describe("InventoryStockTab", () => {
  it("shows the general stock using the same filter and table language as sales by model", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <InventoryStockTab
          data={inventoryData}
          detail={undefined}
          isDetailError={false}
          isDetailLoading={false}
          isError={false}
          isLoading={false}
          onSelectModel={vi.fn()}
          selectedModelKey={null}
        />
      </MemoryRouter>,
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

  it("shows a compact top-10 dropdown and keeps the full analysis on a separate route", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <InventoryStockTab
          data={inventoryData}
          detail={selectedDetail}
          isDetailError={false}
          isDetailLoading={false}
          isError={false}
          isLoading={false}
          onSelectModel={vi.fn()}
          selectedModelKey="TELA::IP13-OLED"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Analisar");
    expect(markup).toContain("/estoque/modelos/TELA%3A%3AIP13-OLED");
    expect(markup).toContain("Top 10 clientes de iPhone 13 OLED");
    expect(markup).toContain("Loja Central");
    expect(markup).toContain("Análise completa");
    expect(markup).not.toContain("Pipeline estimado");
  });
});

import type { InventoryModelDetailResponse } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryModelAnalysisContent } from "./InventoryModelAnalysisPage";

const detail: InventoryModelDetailResponse = {
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
    {
      customerId: "customer-2",
      customerCode: "C-002",
      customerDisplayName: "Celular Express",
      totalQuantity: 80,
      totalOrders: 5,
      quantity12Months: 48,
      orders12Months: 4,
      observedMonths: 12,
      averageMonthlyQuantity: 4,
      firstPurchaseAt: "2025-05-10",
      lastPurchaseAt: "2026-06-01",
      lastAttendant: "Thaís",
    },
  ],
};

describe("InventoryModelAnalysisContent", () => {
  afterEach(() => vi.useRealTimers());

  it("shows a separate, action-oriented customer analysis for the selected model", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <InventoryModelAnalysisContent detail={detail} />
      </MemoryRouter>,
    );

    expect(markup).toContain("Análise comercial do modelo");
    expect(markup).toContain("Clientes que mais compram iPhone 13 OLED");
    expect(markup).toContain("Loja Central");
    expect(markup).toContain("Celular Express");
    expect(markup).toContain("Média mensal");
    expect(markup).toContain("Compra recente");
    expect(markup).toContain("Reativar agora");
    expect(markup).toContain("1 cliente está esfriando");
    expect(markup).toContain("/clientes/customer-1");
    expect(markup).not.toContain("Fechar");
  });
});

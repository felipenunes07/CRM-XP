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
    },
    {
      customerId: "customer-2",
      customerCode: "C-002",
      customerDisplayName: "Celular Express",
      phone: null,
      totalQuantity: 80,
      totalOrders: 5,
      totalRevenue: 6400,
      quantity12Months: 48,
      orders12Months: 4,
      revenue12Months: 3840,
      quantity90Days: 6,
      orders90Days: 1,
      revenue90Days: 480,
      previous90DaysQuantity: 18,
      quantity30Days: 0,
      orders30Days: 0,
      revenue30Days: 0,
      observedMonths: 12,
      averageMonthlyQuantity: 4,
      averageOrderQuantity: 16,
      averageUnitPrice: 80,
      averageDaysBetweenPurchases: 35,
      predictedNextPurchaseAt: "2026-07-06",
      trend90dPercent: -66.7,
      firstPurchaseAt: "2025-05-10",
      lastPurchaseAt: "2026-06-01",
      lastAttendant: "Thaís",
      customerTotalSpent: 42000,
      customerAverageTicket: 1800,
      customerStatus: "ATTENTION",
      customerPriorityScore: 91,
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
    expect(markup).toContain("Top 2 clientes para vender iPhone 13 OLED");
    expect(markup).toContain("Loja Central");
    expect(markup).toContain("Celular Express");
    expect(markup).toContain("Ritmo de compra");
    expect(markup).toContain("Recompra atrasada");
    expect(markup).toContain("Pipeline estimado");
    expect(markup).toContain("Pedido potencial");
    expect(markup).toContain("Vender agora");
    expect(markup).toContain("Queda de consumo");
    expect(markup).toContain("/clientes/customer-1");
    expect(markup).not.toContain("Fechar");
  });
});

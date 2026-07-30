import type { InventoryModelDetailResponse } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCustomerBehaviorSeries,
  buildModelHistoryAnalysis,
  InventoryModelAnalysisContent,
} from "./InventoryModelAnalysisPage";

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
  dailySeries: [
    {
      date: "2026-07-20",
      totalStockUnits: 100,
      activeModelCount: 1,
      salesUnits: 0,
      restockUnits: 0,
      stockUnits: 100,
      activeSkuCount: 1,
    },
    {
      date: "2026-07-21",
      totalStockUnits: 96,
      activeModelCount: 1,
      salesUnits: 4,
      restockUnits: 0,
      stockUnits: 96,
      stockIsEstimated: true,
      activeSkuCount: 1,
    },
    {
      date: "2026-07-22",
      totalStockUnits: 110,
      activeModelCount: 1,
      salesUnits: 2,
      restockUnits: 16,
      stockUnits: 110,
      activeSkuCount: 1,
    },
  ],
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
      monthlyHistory: [
        { month: "2026-06", quantity: 16, orders: 1, revenue: 1280 },
        { month: "2026-07", quantity: 8, orders: 1, revenue: 640 },
      ],
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
      monthlyHistory: [
        { month: "2026-05", quantity: 18, orders: 1, revenue: 1440 },
        { month: "2026-06", quantity: 6, orders: 1, revenue: 480 },
      ],
    },
  ],
};

detail.topInactiveCustomers = [
  {
    ...detail.topCustomers[1]!,
    customerId: "customer-inactive",
    customerDisplayName: "Cliente Inativo Histórico",
    customerStatus: "INACTIVE",
  },
];

describe("InventoryModelAnalysisContent", () => {
  afterEach(() => vi.useRealTimers());

  it("shows a practical sales view with only the essential customer columns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <InventoryModelAnalysisContent detail={detail} />
      </MemoryRouter>,
    );

    expect(markup).toContain("Modelo selecionado");
    expect(markup).toContain("Clientes para vender");
    expect(markup).toContain("Histórico do modelo");
    expect(markup).toContain("Quem mais compra este modelo");
    expect(markup).toContain("Maior volume histórico");
    expect(markup).toContain("Total comprado");
    expect(markup).toContain("Média mensal");
    expect(markup).toContain("Analisar");
    expect(markup).toContain("Inativos (1)");
    expect(markup).toContain("Loja Central");
    expect(markup).toContain("Celular Express");
    expect(markup).toContain("Recompra atrasada");
    expect(markup).toContain("Próximo pedido");
    expect(markup).toContain("WhatsApp");
    expect(markup).toContain("/clientes/customer-1");
    expect(markup).not.toContain("Ritmo de compra");
    expect(markup).not.toContain("30d / 90d");
    expect(markup).not.toContain("Pipeline estimado");
    expect(markup).not.toContain("Queda de consumo");
    expect(markup).not.toContain("Fechar");
  });

  it("keeps model sales history and comparisons in a separate tab", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <InventoryModelAnalysisContent detail={detail} initialTab="history" />
      </MemoryRouter>,
    );

    expect(markup).toContain("Movimento, saldo e velocidade de venda");
    expect(markup).toContain("Receita em 12 meses");
    expect(markup).toContain("Entradas identificadas");
    expect(markup).toContain("Média móvel 7d");
    expect(markup).toContain("Saldo confirmado");
    expect(markup).toContain("saldos estimados entre leituras");
    expect(markup).toContain("O que o histórico mostra");
    expect(markup).toContain("Comparações históricas");
    expect(markup).toContain("Com estoque baixo");
    expect(markup).toContain("Com mais variações");
  });

  it("keeps estimated stock continuous while preserving confirmed spreadsheet readings", () => {
    const analysis = buildModelHistoryAnalysis(detail.dailySeries, "all");

    expect(analysis.points).toHaveLength(3);
    expect(analysis.points[0]?.measuredStockUnits).toBe(100);
    expect(analysis.points[1]?.stockUnits).toBe(96);
    expect(analysis.points[1]?.measuredStockUnits).toBeNull();
    expect(analysis.points[2]?.measuredStockUnits).toBe(110);
    expect(analysis.totalSales).toBe(6);
    expect(analysis.totalRestock).toBe(16);
    expect(analysis.currentStock).toBe(110);
  });

  it("builds a complete 12-month customer behavior series with a moving average", () => {
    const series = buildCustomerBehaviorSeries(
      [
        { month: "2026-06", quantity: 12, orders: 2, revenue: 960 },
        { month: "2026-07", quantity: 18, orders: 3, revenue: 1440 },
      ],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(series).toHaveLength(12);
    expect(series.at(-2)?.quantity).toBe(12);
    expect(series.at(-1)?.quantity).toBe(18);
    expect(series.at(-1)?.average3Months).toBe(10);
  });
});

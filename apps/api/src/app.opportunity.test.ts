import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getInventoryBuyingMock,
  getInventorySnapshotMock,
  getInventoryOverviewMock,
  getInventoryRestockMock,
  getInventoryStaleMock,
  refreshInventorySnapshotMock,
  getInventoryIntelligenceMock,
  getInventoryIntelligenceDetailMock,
  getInventoryModelDetailMock,
  getInventoryModelsMock,
  getCustomerCreditOpportunitiesMock,
  getCustomerOpportunityMock,
} = vi.hoisted(() => ({
  getInventoryBuyingMock: vi.fn(),
  getInventorySnapshotMock: vi.fn(),
  getInventoryOverviewMock: vi.fn(),
  getInventoryRestockMock: vi.fn(),
  getInventoryStaleMock: vi.fn(),
  refreshInventorySnapshotMock: vi.fn(),
  getInventoryIntelligenceMock: vi.fn(),
  getInventoryIntelligenceDetailMock: vi.fn(),
  getInventoryModelDetailMock: vi.fn(),
  getInventoryModelsMock: vi.fn(),
  getCustomerCreditOpportunitiesMock: vi.fn(),
  getCustomerOpportunityMock: vi.fn(),
}));

vi.mock("./modules/crm/inventoryService.js", async () => {
  const actual = await vi.importActual<typeof import("./modules/crm/inventoryService.js")>(
    "./modules/crm/inventoryService.js",
  );

  return {
    ...actual,
    getInventorySnapshot: getInventorySnapshotMock,
    refreshInventorySnapshot: refreshInventorySnapshotMock,
  };
});

vi.mock("./modules/crm/inventoryIntelligenceService.js", async () => {
  const actual = await vi.importActual<typeof import("./modules/crm/inventoryIntelligenceService.js")>(
    "./modules/crm/inventoryIntelligenceService.js",
  );

  return {
    ...actual,
    getInventoryBuying: getInventoryBuyingMock,
    getInventoryIntelligence: getInventoryIntelligenceMock,
    getInventoryIntelligenceDetail: getInventoryIntelligenceDetailMock,
    getInventoryModelDetail: getInventoryModelDetailMock,
    getInventoryModels: getInventoryModelsMock,
    getInventoryOverview: getInventoryOverviewMock,
    getInventoryRestock: getInventoryRestockMock,
    getInventoryStale: getInventoryStaleMock,
  };
});

vi.mock("./modules/crm/opportunityService.js", async () => {
  const actual = await vi.importActual<typeof import("./modules/crm/opportunityService.js")>(
    "./modules/crm/opportunityService.js",
  );

  return {
    ...actual,
    getCustomerCreditOpportunities: getCustomerCreditOpportunitiesMock,
    getCustomerOpportunity: getCustomerOpportunityMock,
  };
});

import { createApp } from "./app.js";

describe("inventory and opportunity routes", () => {
  afterEach(() => {
    getInventoryBuyingMock.mockReset();
    getInventorySnapshotMock.mockReset();
    getInventoryOverviewMock.mockReset();
    getInventoryRestockMock.mockReset();
    getInventoryStaleMock.mockReset();
    refreshInventorySnapshotMock.mockReset();
    getInventoryIntelligenceMock.mockReset();
    getInventoryIntelligenceDetailMock.mockReset();
    getInventoryModelDetailMock.mockReset();
    getInventoryModelsMock.mockReset();
    getCustomerCreditOpportunitiesMock.mockReset();
    getCustomerOpportunityMock.mockReset();
  });

  it("returns the active inventory snapshot", async () => {
    getInventorySnapshotMock.mockResolvedValue({
      id: "inventory-snapshot-1",
      sourceName: "APP Orçamento Facil Expor telas",
      sourceUrl: "https://docs.google.com/sheets/export",
      importedAt: "2026-04-17T12:00:00.000Z",
      totalRows: 200,
      inStockRows: 120,
      matchedSkuRows: 200,
    });

    const response = await request(createApp()).get("/api/inventory/snapshot");

    expect(response.status).toBe(200);
    expect(response.body.totalRows).toBe(200);
    expect(getInventorySnapshotMock).toHaveBeenCalledWith();
  });

  it("refreshes the inventory snapshot", async () => {
    refreshInventorySnapshotMock.mockResolvedValue({
      id: "inventory-snapshot-2",
      sourceName: "APP Orçamento Facil Expor telas",
      sourceUrl: "https://docs.google.com/sheets/export",
      importedAt: "2026-04-17T13:00:00.000Z",
      totalRows: 210,
      inStockRows: 125,
      matchedSkuRows: 210,
    });

    const response = await request(createApp()).post("/api/inventory/refresh");

    expect(response.status).toBe(200);
    expect(response.body.inStockRows).toBe(125);
    expect(refreshInventorySnapshotMock).toHaveBeenCalledWith();
  });

  it("returns inventory intelligence with parsed filters", async () => {
    getInventoryIntelligenceMock.mockResolvedValue({
      snapshot: null,
      previousSnapshot: null,
      summary: {
        activeSkus: 10,
        totalUnits: 450,
        hotRuptureCount: 2,
        lowCoverageCount: 3,
        newArrivalCount: 4,
        stagnantCount: 1,
        negativeStockCount: 0,
      },
      filters: {
        brands: ["SAMSUNG"],
        families: ["A05"],
        qualities: ["PREMIER"],
        stockStatuses: ["NEGATIVE", "OUT", "LOW", "HEALTHY", "HIGH"],
        demandStatuses: ["NO_SALES", "COLD", "WARM", "HOT"],
        depositNames: ["Loja"],
        sellers: ["Maria"],
      },
      appliedFilters: {
        brand: "SAMSUNG",
        family: null,
        quality: null,
        stockStatus: "LOW",
        demandStatus: "WARM",
        newArrivalOnly: true,
        depositName: "Loja",
        seller: "Maria",
      },
      matrix: [],
      tables: {
        hotRuptures: [],
        lowCoverage: [],
        arrivals: [],
        departures: [],
        overstockCold: [],
      },
      sellerQueues: {
        pushStagnant: [],
        announceArrival: [],
        holdBack: [],
      },
    });

    const response = await request(createApp()).get(
      "/api/inventory/intelligence?brand=SAMSUNG&stockStatus=LOW&demandStatus=WARM&newArrivalOnly=true&depositName=Loja&seller=Maria",
    );

    expect(response.status).toBe(200);
    expect(response.body.summary.totalUnits).toBe(450);
    expect(getInventoryIntelligenceMock).toHaveBeenCalledWith({
      brand: "SAMSUNG",
      family: undefined,
      quality: undefined,
      stockStatus: "LOW",
      demandStatus: "WARM",
      newArrivalOnly: true,
      depositName: "Loja",
      seller: "Maria",
    });
  });

  it("returns the inventory detail for a sku", async () => {
    getInventoryIntelligenceDetailMock.mockResolvedValue({
      snapshot: null,
      item: {
        sku: "1308-1",
        model: "SAMSUNG A05S",
        brand: "SAMSUNG",
        family: "A05S",
        productKind: "TELA",
        color: "PRETO",
        quality: "PREMIER",
        price: 12,
        promotionLabel: null,
        stockCurrent: 115,
        previousStock: 100,
        deltaNet: 15,
        deltaEntry: 15,
        deltaExit: 0,
        sales30: 20,
        sales90: 64,
        orders30: 8,
        orders90: 21,
        coverageDays: 161.7,
        stockStatus: "HIGH",
        demandStatus: "HOT",
        quadrant: "DRIVE_NOW",
        isHotRupture: false,
        isLowCoverage: false,
        isOverstockCold: false,
        isNewArrival: true,
        isStrongOutgoing: false,
        depositNames: ["Loja"],
        sellerNames: ["Maria"],
        enrichment: null,
      },
      stockHistory: [],
      familyItems: [],
      suggestedCustomers: [],
    });

    const response = await request(createApp()).get("/api/inventory/items/1308-1");

    expect(response.status).toBe(200);
    expect(response.body.item.sku).toBe("1308-1");
    expect(getInventoryIntelligenceDetailMock).toHaveBeenCalledWith("1308-1");
  });

  it("returns the inventory overview payload", async () => {
    getInventoryOverviewMock.mockResolvedValue({
      snapshot: null,
      previousSnapshot: null,
      cards: [],
      dailySeries: [],
      highlights: ["Quando o estoque total subiu, a venda tambem subiu."],
      totals: {
        totalStockUnits: 183725,
        activeModelCount: 214,
        activeSkuCount: 716,
        sales30: 1280,
        sales90: 4120,
        trappedValue: 92543.5,
      },
    });

    const response = await request(createApp()).get("/api/inventory/overview");

    expect(response.status).toBe(200);
    expect(response.body.totals.activeSkuCount).toBe(716);
    expect(getInventoryOverviewMock).toHaveBeenCalledWith();
  });

  it("returns separated buying, restock, stale and model payloads", async () => {
    getInventoryBuyingMock.mockResolvedValue({
      snapshot: null,
      items: [
        {
          modelKey: "TELA::SAMSUNG::A05S",
          modelLabel: "SAMSUNG A05S",
          brand: "SAMSUNG",
          family: "A05S",
          productKind: "TELA",
          stockUnits: 18,
          activeSkuCount: 2,
          totalSkuCount: 4,
          sales7: 11,
          sales30: 42,
          sales90: 118,
          orders30: 9,
          orders90: 24,
          lastSaleAt: "2026-04-20",
          daysSinceLastSale: 1,
          lastRestockAt: "2026-04-18",
          coverageDays: 13.7,
          deltaIn: 8,
          deltaOut: -3,
          trappedValue: 918,
          trappedValueEstimated: false,
          buyPriority: 287,
          buyRecommendation: "BUY_NOW",
          holdSales: true,
          qualityLabels: ["PREMIER"],
          sampleSkus: ["1308-1"],
        },
      ],
    });

    getInventoryRestockMock.mockResolvedValue({
      snapshot: null,
      counts: {
        arrivedToday: 1,
        backToSelling: 2,
        noReactionYet: 3,
        restockAgain: 4,
      },
      items: [],
    });

    getInventoryStaleMock.mockResolvedValue({
      snapshot: null,
      counts: {
        stale30: 10,
        stale60: 8,
        stale90: 6,
        stale120: 3,
      },
      items: [],
    });

    getInventoryModelsMock.mockResolvedValue({
      snapshot: null,
      filters: {
        brands: ["SAMSUNG"],
        families: ["A05S"],
        qualities: ["PREMIER"],
      },
      items: [],
    });

    getInventoryModelDetailMock.mockResolvedValue({
      snapshot: null,
      model: null,
      dailySeries: [],
      benchmarks: {
        lowStockAvgSales: null,
        highStockAvgSales: null,
        shortMixAvgSales: null,
        wideMixAvgSales: null,
      },
      highlights: [],
      skus: [],
      topCustomers: [],
      deposits: [],
    });

    const [buyingResponse, restockResponse, staleResponse, modelsResponse, modelDetailResponse] = await Promise.all([
      request(createApp()).get("/api/inventory/buying"),
      request(createApp()).get("/api/inventory/restock"),
      request(createApp()).get("/api/inventory/stale"),
      request(createApp()).get("/api/inventory/models"),
      request(createApp()).get("/api/inventory/models/TELA::SAMSUNG::A05S"),
    ]);

    expect(buyingResponse.status).toBe(200);
    expect(buyingResponse.body.items[0].buyRecommendation).toBe("BUY_NOW");
    expect(restockResponse.status).toBe(200);
    expect(restockResponse.body.counts.arrivedToday).toBe(1);
    expect(staleResponse.status).toBe(200);
    expect(staleResponse.body.counts.stale90).toBe(6);
    expect(modelsResponse.status).toBe(200);
    expect(modelsResponse.body.filters.brands).toEqual(["SAMSUNG"]);
    expect(modelDetailResponse.status).toBe(200);
    expect(getInventoryModelDetailMock).toHaveBeenCalledWith("TELA::SAMSUNG::A05S");
  });

  it("returns the queue of saldo and credit opportunities", async () => {
    getCustomerCreditOpportunitiesMock.mockResolvedValue({
      creditSnapshot: null,
      inventorySnapshot: null,
      summary: {
        totalCustomers: 1,
        prioritizedCustomers: 1,
        totalTargetAmount: 1153,
        totalSuggestedAmount: 1100,
        customersWithBalance: 1,
        customersWithAvailableCredit: 1,
      },
      items: [
        {
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Luiz Goiania",
          primarySource: "CREDIT_BALANCE",
          targetAmount: 1153,
          creditBalanceAmount: 1153,
          availableCreditAmount: 600,
          suggestedAmount: 1100,
          remainingGapAmount: 53,
          coverageRatio: 0.95,
          matchedProductCount: 4,
          suggestedLineCount: 3,
          topModelsInStock: ["A02S", "J4 Plus"],
          lastPurchaseAt: "2026-04-10",
          daysSinceLastPurchase: 7,
          lastAttendant: "Maria",
        },
      ],
    });

    const response = await request(createApp()).get("/api/customer-credit/opportunities");

    expect(response.status).toBe(200);
    expect(response.body.summary.totalCustomers).toBe(1);
    expect(response.body.items[0].customerCode).toBe("CL001");
  });

  it("returns the opportunity detail for a customer", async () => {
    getCustomerOpportunityMock.mockResolvedValue({
      customerId: "customer-1",
      customerCode: "CL001",
      customerDisplayName: "Luiz Goiania",
      creditSnapshot: null,
      inventorySnapshot: null,
      isEligible: true,
      reason: null,
      primarySource: "CREDIT_BALANCE",
      targetAmount: 1153,
      creditBalanceAmount: 1153,
      availableCreditAmount: 600,
      suggestedAmount: 1100,
      remainingGapAmount: 53,
      coverageRatio: 0.95,
      availableProducts: [],
      suggestedLines: [],
      messagePreview: {
        templateId: null,
        templateTitle: null,
        itemsSummary: "A02S (2x)",
        usedFallback: true,
        messageText: "Olá, Luiz Goiania 😊",
      },
    });

    const response = await request(createApp()).get("/api/customers/customer-1/opportunity");

    expect(response.status).toBe(200);
    expect(response.body.customerCode).toBe("CL001");
    expect(getCustomerOpportunityMock).toHaveBeenCalledWith("customer-1");
  });
});

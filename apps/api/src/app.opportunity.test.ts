import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getInventorySnapshotMock,
  refreshInventorySnapshotMock,
  getCustomerCreditOpportunitiesMock,
  getCustomerOpportunityMock,
} = vi.hoisted(() => ({
  getInventorySnapshotMock: vi.fn(),
  refreshInventorySnapshotMock: vi.fn(),
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
    getInventorySnapshotMock.mockReset();
    refreshInventorySnapshotMock.mockReset();
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

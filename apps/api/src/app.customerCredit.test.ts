import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getCustomerCreditOverviewMock,
  refreshCustomerCreditOverviewMock,
  getCustomerCreditDetailMock,
} = vi.hoisted(() => ({
  getCustomerCreditOverviewMock: vi.fn(),
  refreshCustomerCreditOverviewMock: vi.fn(),
  getCustomerCreditDetailMock: vi.fn(),
}));

vi.mock("./modules/crm/customerCreditService.js", async () => {
  const actual = await vi.importActual<typeof import("./modules/crm/customerCreditService.js")>(
    "./modules/crm/customerCreditService.js",
  );

  return {
    ...actual,
    getCustomerCreditOverview: getCustomerCreditOverviewMock,
    refreshCustomerCreditOverview: refreshCustomerCreditOverviewMock,
    getCustomerCreditDetail: getCustomerCreditDetailMock,
  };
});

import { createApp } from "./app.js";

describe("customer credit routes", () => {
  afterEach(() => {
    getCustomerCreditOverviewMock.mockReset();
    refreshCustomerCreditOverviewMock.mockReset();
    getCustomerCreditDetailMock.mockReset();
  });

  it("returns the customer credit overview", async () => {
    getCustomerCreditOverviewMock.mockResolvedValue({
      snapshot: {
        id: "snapshot-1",
        sourceFileName: "SALDO VENDAS - 14.04.xlsx",
        sourceFilePath: "C:/Dropbox/SALDO VENDAS - 14.04.xlsx",
        sourceFileUpdatedAt: "2026-04-14T12:00:00.000Z",
        sourceFileSizeBytes: 100,
        importedAt: "2026-04-14T12:05:00.000Z",
        totalRows: 2,
        matchedRows: 1,
        unmatchedRows: 1,
      },
      summary: {
        totalLinkedCustomers: 1,
        totalUnmatchedRows: 1,
        totalDebtAmount: 150,
        totalCreditBalanceAmount: 0,
        customersOwing: 1,
        customersWithCreditLimit: 1,
        customersWithUnusedCredit: 0,
        customersCritical: 0,
        customersAttention: 1,
        customersMonitoring: 0,
        customersOverCredit: 0,
        customersOverdue: 1,
      },
      linkedRows: [],
      unmatchedRows: [],
    });

    const response = await request(createApp()).get("/api/customer-credit/overview");

    expect(response.status).toBe(200);
    expect(response.body.summary.totalDebtAmount).toBe(150);
    expect(getCustomerCreditOverviewMock).toHaveBeenCalledWith();
  });

  it("refreshes the customer credit snapshot for admin and manager users", async () => {
    refreshCustomerCreditOverviewMock.mockResolvedValue({
      snapshot: null,
      summary: {
        totalLinkedCustomers: 0,
        totalUnmatchedRows: 0,
        totalDebtAmount: 0,
        totalCreditBalanceAmount: 0,
        customersOwing: 0,
        customersWithCreditLimit: 0,
        customersWithUnusedCredit: 0,
        customersCritical: 0,
        customersAttention: 0,
        customersMonitoring: 0,
        customersOverCredit: 0,
        customersOverdue: 0,
      },
      linkedRows: [],
      unmatchedRows: [],
    });

    const response = await request(createApp()).post("/api/customer-credit/refresh");

    expect(response.status).toBe(200);
    expect(refreshCustomerCreditOverviewMock).toHaveBeenCalledWith();
  });

  it("returns the credit detail for a single customer", async () => {
    getCustomerCreditDetailMock.mockResolvedValue({
      snapshot: null,
      row: {
        id: "row-1",
        customerId: "customer-1",
        customerCode: "CL001",
        customerDisplayName: "Loja 1",
        sourceDisplayName: "Loja 1",
        matched: true,
        balanceAmount: -120,
        debtAmount: 120,
        creditBalanceAmount: 0,
        creditLimit: 5000,
        availableCreditAmount: 4880,
        withinCreditLimit: true,
        operationalState: "OWES",
        riskLevel: "ATENCAO",
        observation: "Pagamento vencido",
        lastOrderDate: "2026-04-10",
        lastPaymentDate: "2026-04-02",
        daysSinceLastOrder: 4,
        daysSinceLastPayment: 12,
        riskScore: 7,
        flags: ["Pagamento Vencido"],
        hasOverCredit: false,
        hasOverduePayment: true,
        hasSeverelyOverduePayment: false,
        hasNoPayment: false,
        hasNoOrder: false,
        hasNegativeCredit: false,
        hasDebtWithoutCredit: false,
      },
    });

    const response = await request(createApp()).get("/api/customers/customer-1/credit");

    expect(response.status).toBe(200);
    expect(response.body.row.customerCode).toBe("CL001");
    expect(getCustomerCreditDetailMock).toHaveBeenCalledWith("customer-1");
  });
});

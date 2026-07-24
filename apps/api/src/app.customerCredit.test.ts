import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getCustomerCreditOverviewMock,
  refreshCustomerCreditOverviewMock,
  getCustomerCreditDetailMock,
  updateCustomerCreditSettingsMock,
} = vi.hoisted(() => ({
  getCustomerCreditOverviewMock: vi.fn(),
  refreshCustomerCreditOverviewMock: vi.fn(),
  getCustomerCreditDetailMock: vi.fn(),
  updateCustomerCreditSettingsMock: vi.fn(),
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
    updateCustomerCreditSettings: updateCustomerCreditSettingsMock,
  };
});

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (request: any, _response: unknown, next: () => void) => {
    request.user = { id: "user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" };
    next();
  },
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  requirePermission: () => (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import { createApp } from "./app.js";

describe("customer credit routes", () => {
  afterEach(() => {
    getCustomerCreditOverviewMock.mockReset();
    refreshCustomerCreditOverviewMock.mockReset();
    getCustomerCreditDetailMock.mockReset();
    updateCustomerCreditSettingsMock.mockReset();
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
      orders: [
        {
          id: "order-1",
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Loja 1",
          sourceDisplayName: "Loja 1",
          orderNumber: "37732",
          orderDate: "2026-02-27",
          totalAmount: 1635,
          units: 15,
          seller: "Thais",
          doc: "EXPOR",
          status: "OK",
          lineCount: 2,
        },
      ],
      payments: [
        {
          id: "payment-1",
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Loja 1",
          sourceDisplayName: "Loja 1",
          paymentNumber: "89205",
          paymentDate: "2026-05-12",
          amount: 7217,
          paymentType: "TROCAS",
          observation: "",
        },
      ],
      totalOrders: 1,
      totalPayments: 1,
    });

    const response = await request(createApp()).get(
      "/api/customers/customer-1/credit?ordersOffset=50&paymentsOffset=100&pageSize=150",
    );

    expect(response.status).toBe(200);
    expect(response.body.row.customerCode).toBe("CL001");
    expect(response.body.orders[0].orderNumber).toBe("37732");
    expect(response.body.payments[0].paymentType).toBe("TROCAS");
    expect(getCustomerCreditDetailMock).toHaveBeenCalledWith("customer-1", {
      ordersOffset: 50,
      paymentsOffset: 100,
      pageSize: 150,
    });
  });

  it("updates manual credit settings for the customer", async () => {
    updateCustomerCreditSettingsMock.mockResolvedValue({
      snapshot: null,
      row: {
        customerId: "customer-1",
        creditLimit: 80000,
        paymentTerm: 30,
      },
      orders: [],
      payments: [],
      totalOrders: 0,
      totalPayments: 0,
    });

    const response = await request(createApp())
      .patch("/api/customers/customer-1/credit-settings")
      .send({ creditLimit: 80000, paymentTerm: 30 });

    expect(response.status).toBe(200);
    expect(response.body.row.creditLimit).toBe(80000);
    expect(updateCustomerCreditSettingsMock).toHaveBeenCalledWith(
      "customer-1",
      { creditLimit: 80000, paymentTerm: 30 },
      expect.objectContaining({ id: "user-1", role: "ADMIN" }),
    );
  });
});

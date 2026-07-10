import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCustomerDefectCustomerDetailMock, getCustomerDefectOverviewMock, getCustomerDefectProductsMock, refreshCustomerDefectOverviewMock } = vi.hoisted(() => ({
  getCustomerDefectCustomerDetailMock: vi.fn(),
  getCustomerDefectOverviewMock: vi.fn(),
  getCustomerDefectProductsMock: vi.fn(),
  refreshCustomerDefectOverviewMock: vi.fn(),
}));

vi.mock("./modules/crm/customerDefectService.js", () => ({
  getCustomerDefectCustomerDetail: getCustomerDefectCustomerDetailMock,
  getCustomerDefectOverview: getCustomerDefectOverviewMock,
  getCustomerDefectProducts: getCustomerDefectProductsMock,
  refreshCustomerDefectOverview: refreshCustomerDefectOverviewMock,
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (request: any, _response: unknown, next: () => void) => {
    request.user = { id: "user-1", email: "admin@example.com", name: "Admin", role: "ADMIN" };
    next();
  },
  requirePermission: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import { createApp } from "./app.js";

describe("customer defect routes", () => {
  afterEach(() => {
    getCustomerDefectCustomerDetailMock.mockReset();
    getCustomerDefectOverviewMock.mockReset();
    getCustomerDefectProductsMock.mockReset();
    refreshCustomerDefectOverviewMock.mockReset();
  });

  it("returns the customer defect overview", async () => {
    getCustomerDefectOverviewMock.mockResolvedValue({
      snapshot: {
        id: "snapshot-1",
        sourceFileName: "坏品表 PLANILHA DEFEITOS 2026.xlsx",
        sourceFilePath: "C:/Users/Felipe/Dropbox/DEFEITOS - XP/坏品表 PLANILHA DEFEITOS 2026.xlsx",
        sourceFileUpdatedAt: "2026-07-04T13:03:36.000Z",
        sourceFileSizeBytes: 25670412,
        sourceFiles: [],
        importedAt: "2026-07-04T14:00:00.000Z",
        periodStartDate: "2025-11-10",
        periodEndDate: "2026-07-04",
        totalRows: 2,
        matchedRows: 1,
        unmatchedRows: 1,
      },
      summary: {
        totalCustomers: 2,
        matchedCustomers: 1,
        unmatchedCustomers: 1,
        totalRevenue: 10000,
        totalPurchasedPieces: 500,
        totalReturnedPieces: 12,
        totalReplacementPieces: 2,
        totalReturnedAmount: 960,
        overallReturnRate: 0.024,
        highReturnCustomers: 1,
        zeroPurchaseReturnCustomers: 1,
      },
      rows: [],
      unmatchedRows: [],
    });

    const response = await request(createApp()).get("/api/customer-defects/overview");

    expect(response.status).toBe(200);
    expect(response.body.summary.totalReturnedPieces).toBe(12);
    expect(getCustomerDefectOverviewMock).toHaveBeenCalledWith();
  });

  it("returns customer defect detail rows", async () => {
    getCustomerDefectCustomerDetailMock.mockResolvedValue({
      snapshot: {
        id: "snapshot-1",
        sourceFileName: "defeitos.xlsx",
        sourceFilePath: "/DEFEITOS - XP/defeitos.xlsx",
        sourceFileUpdatedAt: "2026-07-04T13:03:36.000Z",
        sourceFileSizeBytes: 1,
        sourceFiles: [],
        importedAt: "2026-07-04T14:00:00.000Z",
        periodStartDate: "2023-05-17",
        periodEndDate: "2026-07-04",
        totalRows: 1,
        matchedRows: 1,
        unmatchedRows: 0,
      },
      row: {
        id: "row-1",
        customerId: "customer-1",
        customerCode: "CL098",
        customerDisplayName: "X Tec",
        sourceDisplayName: "X TEC",
        matched: true,
        revenue: 19442,
        orderCount: 8,
        purchasedPieces: 326,
        returnedPieces: 38,
        replacementPieces: 27,
        returnedAmount: 1892,
        returnRate: 0.116564,
        defectSkuCount: 25,
        firstDefectDate: "2023-06-19",
        lastDefectDate: "2023-10-06",
        yearlyBreakdown: [],
      },
      defectRows: [
        {
          defectDate: "2023-10-06",
          returnedPieces: 1,
          replacementPieces: 0,
          returnedAmount: 51,
          sku: "0578-1",
          description: "LCD",
        },
      ],
    });

    const response = await request(createApp()).get("/api/customer-defects/customers/CL098");

    expect(response.status).toBe(200);
    expect(response.body.defectRows).toHaveLength(1);
    expect(getCustomerDefectCustomerDetailMock).toHaveBeenCalledWith("CL098");
  });

  it("returns annual defect metrics by model and quality", async () => {
    getCustomerDefectProductsMock.mockResolvedValue({
      snapshot: { id: "snapshot-1" },
      year: 2026,
      periodStartDate: "2026-01-01",
      periodEndDate: "2026-07-10",
      summary: { products: 1, soldPieces: 100, returnedPieces: 5, returnedAmount: 250, returnRate: 0.05 },
      vvSummary: { products: 1, soldPieces: 80, returnedPieces: 0, returnedAmount: 0, returnRate: 0 },
      qualities: [],
      rows: [],
    });

    const response = await request(createApp()).get("/api/customer-defects/products?year=2026");

    expect(response.status).toBe(200);
    expect(response.body.vvSummary.returnRate).toBe(0);
    expect(getCustomerDefectProductsMock).toHaveBeenCalledWith(2026);
  });

  it("refreshes the customer defect snapshot for admin and manager users", async () => {
    refreshCustomerDefectOverviewMock.mockResolvedValue({
      snapshot: null,
      summary: {
        totalCustomers: 0,
        matchedCustomers: 0,
        unmatchedCustomers: 0,
        totalRevenue: 0,
        totalPurchasedPieces: 0,
        totalReturnedPieces: 0,
        totalReplacementPieces: 0,
        totalReturnedAmount: 0,
        overallReturnRate: null,
        highReturnCustomers: 0,
        zeroPurchaseReturnCustomers: 0,
      },
      rows: [],
      unmatchedRows: [],
    });

    const response = await request(createApp()).post("/api/customer-defects/refresh");

    expect(response.status).toBe(200);
    expect(refreshCustomerDefectOverviewMock).toHaveBeenCalledWith();
  });
});

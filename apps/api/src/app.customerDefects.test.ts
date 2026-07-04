import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCustomerDefectOverviewMock, refreshCustomerDefectOverviewMock } = vi.hoisted(() => ({
  getCustomerDefectOverviewMock: vi.fn(),
  refreshCustomerDefectOverviewMock: vi.fn(),
}));

vi.mock("./modules/crm/customerDefectService.js", () => ({
  getCustomerDefectOverview: getCustomerDefectOverviewMock,
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
    getCustomerDefectOverviewMock.mockReset();
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

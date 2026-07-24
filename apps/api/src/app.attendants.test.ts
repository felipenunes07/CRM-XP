import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAttendantsOverviewMock, getAttendantPortfolioMock } = vi.hoisted(() => ({
  getAttendantsOverviewMock: vi.fn(),
  getAttendantPortfolioMock: vi.fn(),
}));

vi.mock("./modules/crm/attendantService.js", () => ({
  getAttendantsOverview: getAttendantsOverviewMock,
  getAttendantPortfolio: getAttendantPortfolioMock,
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  requirePermission: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import { createApp } from "./app.js";

describe("GET /api/attendants", () => {
  afterEach(() => {
    getAttendantsOverviewMock.mockReset();
    getAttendantPortfolioMock.mockReset();
  });

  it("returns the detailed assigned portfolio for an attendant", async () => {
    getAttendantPortfolioMock.mockResolvedValue({
      attendant: "Suelen",
      windowMonths: 12,
      periodStart: "2025-07-01",
      periodEnd: "2026-07-24",
      customers: [{
        customerId: "customer-1",
        customerCode: "XP001",
        displayName: "Cliente Exemplo",
        status: "ATTENTION",
        periodPieces: 18,
        periodOrders: 2,
        periodRevenue: 1500,
        lastOrderAt: "2026-05-10",
        daysSinceLastPurchase: 75,
        totalOrders: 6,
        totalSpent: 4200,
        priorityScore: 82,
      }],
    });

    const response = await request(createApp()).get("/api/attendants/Suelen/portfolio?windowMonths=12");

    expect(response.status).toBe(200);
    expect(response.body.customers[0].periodPieces).toBe(18);
    expect(getAttendantPortfolioMock).toHaveBeenCalledWith("Suelen", 12);
  });

  it("returns the attendants overview for a valid monthly window", async () => {
    getAttendantsOverviewMock.mockResolvedValue({
      windowMonths: 24,
      summary: {
        totalAttendants: 2,
        activeAttendants: 2,
        currentPeriodRevenue: 3000,
        currentPeriodOrders: 10,
        currentPeriodPieces: 25,
        currentPeriodCustomers: 8,
        previousPeriodRevenue: 2500,
        revenueGrowthRatio: 0.2,
        currentPeriodStart: "2026-04-01",
        currentPeriodEnd: "2026-04-10",
        previousPeriodStart: "2026-03-01",
        previousPeriodEnd: "2026-03-10",
      },
      attendants: [],
    });

    const response = await request(createApp()).get("/api/attendants?windowMonths=24");

    expect(response.status).toBe(200);
    expect(response.body.summary.totalAttendants).toBe(2);
    expect(getAttendantsOverviewMock).toHaveBeenCalledWith(24);
  });

  it("rejects unsupported monthly windows before reaching the service", async () => {
    const response = await request(createApp()).get("/api/attendants?windowMonths=7");

    expect(response.status).toBe(400);
    expect(getAttendantsOverviewMock).not.toHaveBeenCalled();
  });
});

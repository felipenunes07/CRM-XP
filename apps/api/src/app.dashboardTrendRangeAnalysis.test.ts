import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getTrendRangeAnalysisMock } = vi.hoisted(() => ({
  getTrendRangeAnalysisMock: vi.fn(),
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  requireRole:
    () =>
    (_request: unknown, _response: unknown, next: () => void) =>
      next(),
}));

vi.mock("./modules/crm/dashboardService.js", () => ({
  getAgendaItems: vi.fn(),
  getDashboardMetrics: vi.fn(),
  getTrendRangeAnalysis: getTrendRangeAnalysisMock,
  saveMonthlyTarget: vi.fn(),
  getMonthlyTargets: vi.fn(),
  getChartAnnotations: vi.fn(),
  saveChartAnnotation: vi.fn(),
  deleteChartAnnotation: vi.fn(),
}));

import { createApp } from "./app.js";

describe("GET /api/dashboard/trend-range-analysis", () => {
  afterEach(() => {
    getTrendRangeAnalysisMock.mockReset();
  });

  it("returns the period loss analysis for a valid date range", async () => {
    getTrendRangeAnalysisMock.mockResolvedValue({
      selection: {
        startDate: "2026-01-10",
        endDate: "2026-02-20",
      },
      summary: {
        startDate: "2026-01-10",
        endDate: "2026-02-20",
        totalCustomers: 3,
        attentionCustomers: 1,
        inactiveCustomers: 2,
        neverReturnedCustomers: 2,
        averageTicket: 420,
        estimatedMonthlyRevenueLoss: 1200,
        estimatedMonthlyPiecesLoss: 70,
      },
      lostCustomers: [],
      recoveredSummary: {
        recoveredCustomers: 1,
        recoveredRevenue: 500,
        recoveredPieces: 4,
      },
      monthlyLossSeries: [],
    });

    const response = await request(createApp()).get(
      "/api/dashboard/trend-range-analysis?startDate=2026-01-10&endDate=2026-02-20",
    );

    expect(response.status).toBe(200);
    expect(response.body.summary.totalCustomers).toBe(3);
    expect(getTrendRangeAnalysisMock).toHaveBeenCalledWith("2026-01-10", "2026-02-20");
  });

  it("rejects invalid dates before reaching the service", async () => {
    const response = await request(createApp()).get(
      "/api/dashboard/trend-range-analysis?startDate=2026-1-10&endDate=2026-02-20",
    );

    expect(response.status).toBe(400);
    expect(getTrendRangeAnalysisMock).not.toHaveBeenCalled();
  });
});

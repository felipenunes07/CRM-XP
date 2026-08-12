import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getExecutiveDashboardMetricsMock } = vi.hoisted(() => ({
  getExecutiveDashboardMetricsMock: vi.fn(),
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  requirePermission:
    () =>
    (_request: unknown, _response: unknown, next: () => void) =>
      next(),
  requireRole:
    () =>
    (_request: unknown, _response: unknown, next: () => void) =>
      next(),
}));

vi.mock("./modules/crm/executiveDashboardService.js", () => ({
  getExecutiveDashboardMetrics: getExecutiveDashboardMetricsMock,
}));

import { createApp } from "./app.js";

describe("GET /api/dashboard/executive", () => {
  afterEach(() => {
    getExecutiveDashboardMetricsMock.mockReset();
  });

  it("returns the filtered executive dashboard", async () => {
    getExecutiveDashboardMetricsMock.mockResolvedValue({
      selection: { year: 2026, month: 8, day: 12 },
      summary: { totalItems: 2450 },
    });

    const response = await request(createApp()).get("/api/dashboard/executive?year=2026&month=8&day=12");

    expect(response.status).toBe(200);
    expect(response.body.summary.totalItems).toBe(2450);
    expect(getExecutiveDashboardMetricsMock).toHaveBeenCalledWith({ year: 2026, month: 8, day: 12 });
  });

  it("rejects an out-of-range month before querying the service", async () => {
    const response = await request(createApp()).get("/api/dashboard/executive?year=2026&month=13");

    expect(response.status).toBe(400);
    expect(getExecutiveDashboardMetricsMock).not.toHaveBeenCalled();
  });
});

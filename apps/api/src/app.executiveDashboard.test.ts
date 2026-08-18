import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getExecutiveDashboardMetricsMock, requireAuthMock, runPrimarySyncMock } = vi.hoisted(() => ({
  getExecutiveDashboardMetricsMock: vi.fn(),
  runPrimarySyncMock: vi.fn(),
  requireAuthMock: vi.fn((_request: unknown, response: { status: (code: number) => { json: (body: unknown) => void } }) => {
    response.status(401).json({ message: "Autenticacao obrigatoria" });
  }),
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: requireAuthMock,
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

vi.mock("./modules/platform/syncService.js", () => ({
  runPrimarySync: runPrimarySyncMock,
}));

import { createApp } from "./app.js";

describe("GET /api/dashboard/executive", () => {
  afterEach(() => {
    getExecutiveDashboardMetricsMock.mockReset();
    runPrimarySyncMock.mockReset();
  });

  it("returns the filtered executive dashboard", async () => {
    getExecutiveDashboardMetricsMock.mockResolvedValue({
      selection: { year: 2026, month: 8, day: 12 },
      summary: { totalItems: 2450 },
    });

    const response = await request(createApp()).get("/api/dashboard/executive?year=2026&month=8&day=12");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body.summary.totalItems).toBe(2450);
    expect(response.headers["cache-control"]).not.toContain("public");
    expect(requireAuthMock).not.toHaveBeenCalled();
    expect(getExecutiveDashboardMetricsMock).toHaveBeenCalledWith({ year: 2026, month: 8, day: 12 });
  });

  it("rejects an out-of-range month before querying the service", async () => {
    const response = await request(createApp()).get("/api/dashboard/executive?year=2026&month=13");

    expect(response.status).toBe(400);
    expect(getExecutiveDashboardMetricsMock).not.toHaveBeenCalled();
  });

  it("runs a real source sync from the public TV refresh button without login", async () => {
    runPrimarySyncMock.mockResolvedValue({ source: "olist_v2", result: { recordsSeen: 181 } });

    const response = await request(createApp()).post("/api/dashboard/executive/refresh");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body.source).toBe("olist_v2");
    expect(requireAuthMock).not.toHaveBeenCalled();
    expect(runPrimarySyncMock).toHaveBeenCalledWith("public-executive-dashboard-refresh");
  });

  it("throttles repeated public refresh requests", async () => {
    runPrimarySyncMock.mockResolvedValue({ source: "olist_v2" });
    const app = createApp();

    const first = await request(app).post("/api/dashboard/executive/refresh");
    const second = await request(app).post("/api/dashboard/executive/refresh");

    expect(first.status).toBe(200);
    expect(second.status).toBe(202);
    expect(second.body).toMatchObject({ skipped: true, reason: "cooldown" });
    expect(runPrimarySyncMock).toHaveBeenCalledTimes(1);
  });
});

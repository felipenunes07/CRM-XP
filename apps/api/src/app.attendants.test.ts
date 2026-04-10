import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAttendantsOverviewMock } = vi.hoisted(() => ({
  getAttendantsOverviewMock: vi.fn(),
}));

vi.mock("./modules/crm/attendantService.js", () => ({
  getAttendantsOverview: getAttendantsOverviewMock,
}));

import { createApp } from "./app.js";

describe("GET /api/attendants", () => {
  afterEach(() => {
    getAttendantsOverviewMock.mockReset();
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

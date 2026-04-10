import { describe, expect, it } from "vitest";
import type { AttendantListItem } from "@olist-crm/shared";
import {
  buildAttendantComparisonWindows,
  buildGrowthRatio,
  buildGrowthRatios,
  buildMetricSnapshot,
  sortAttendants,
} from "./attendantService.js";

describe("attendantService helpers", () => {
  it("builds the current, previous and monthly windows from a reference date", () => {
    expect(buildAttendantComparisonWindows(new Date("2026-04-10T12:00:00Z"), 12)).toEqual({
      currentPeriodStart: "2026-04-01",
      currentPeriodEnd: "2026-04-10",
      previousPeriodStart: "2026-03-01",
      previousPeriodEnd: "2026-03-10",
      trendStartMonth: "2025-04-01",
      trendEndMonth: "2026-03-01",
    });
  });

  it("calculates derived metrics without dividing by zero", () => {
    expect(
      buildMetricSnapshot({
        revenue: 0,
        orders: 0,
        pieces: 0,
        uniqueCustomers: 0,
        lastOrderAt: null,
      }),
    ).toEqual({
      revenue: 0,
      orders: 0,
      pieces: 0,
      uniqueCustomers: 0,
      avgTicket: 0,
      piecesPerOrder: 0,
      revenuePerCustomer: 0,
      lastOrderAt: null,
    });
  });

  it("returns null growth when the previous base does not exist", () => {
    expect(buildGrowthRatio(100, 0)).toBeNull();
    expect(
      buildGrowthRatios(
        {
          revenue: 100,
          orders: 2,
          pieces: 10,
          uniqueCustomers: 1,
          avgTicket: 50,
          piecesPerOrder: 5,
          revenuePerCustomer: 100,
          lastOrderAt: "2026-04-10",
        },
        {
          revenue: 0,
          orders: 0,
          pieces: 0,
          uniqueCustomers: 0,
          avgTicket: 0,
          piecesPerOrder: 0,
          revenuePerCustomer: 0,
          lastOrderAt: null,
        },
      ).revenue,
    ).toBeNull();
  });

  it("sorts attendants by current revenue, then orders, then name", () => {
    const baseItem = {
      currentPeriod: {
        revenue: 0,
        orders: 0,
        pieces: 0,
        uniqueCustomers: 0,
        avgTicket: 0,
        piecesPerOrder: 0,
        revenuePerCustomer: 0,
        lastOrderAt: null,
      },
      previousPeriod: {
        revenue: 0,
        orders: 0,
        pieces: 0,
        uniqueCustomers: 0,
        avgTicket: 0,
        piecesPerOrder: 0,
        revenuePerCustomer: 0,
        lastOrderAt: null,
      },
      growth: {
        revenue: null,
        orders: null,
        pieces: null,
        uniqueCustomers: null,
        avgTicket: null,
        piecesPerOrder: null,
        revenuePerCustomer: null,
      },
      portfolio: {
        totalCustomers: 0,
        statusCounts: {
          ACTIVE: 0,
          ATTENTION: 0,
          INACTIVE: 0,
        },
      },
      monthlyTrend: [],
      topCustomers: [],
      topProducts: [],
    } satisfies Omit<AttendantListItem, "attendant">;

    expect(
      sortAttendants([
        { attendant: "Thais", ...baseItem, currentPeriod: { ...baseItem.currentPeriod, revenue: 1000, orders: 4 } },
        { attendant: "Amanda", ...baseItem, currentPeriod: { ...baseItem.currentPeriod, revenue: 1000, orders: 5 } },
        { attendant: "Suelen", ...baseItem, currentPeriod: { ...baseItem.currentPeriod, revenue: 1200, orders: 2 } },
      ]).map((item) => item.attendant),
    ).toEqual(["Suelen", "Amanda", "Thais"]);
  });
});

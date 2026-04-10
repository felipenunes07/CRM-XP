import { describe, expect, it } from "vitest";
import type { AttendantListItem } from "@olist-crm/shared";
import {
  buildTrendChartData,
  getInitialSelectedAttendants,
  sortAttendantsForBoard,
  toggleComparedAttendant,
} from "./attendantsPage.helpers";

function createAttendant(attendant: string, revenue: number, trendRevenue: number[]): AttendantListItem {
  return {
    attendant,
    currentPeriod: {
      revenue,
      orders: revenue / 100,
      pieces: revenue / 50,
      uniqueCustomers: revenue / 200,
      avgTicket: 100,
      piecesPerOrder: 2,
      revenuePerCustomer: 300,
      lastOrderAt: "2026-04-10",
    },
    previousPeriod: {
      revenue: revenue / 2,
      orders: revenue / 200,
      pieces: revenue / 100,
      uniqueCustomers: revenue / 300,
      avgTicket: 80,
      piecesPerOrder: 1.5,
      revenuePerCustomer: 210,
      lastOrderAt: "2026-03-10",
    },
    growth: {
      revenue: 0.5,
      orders: 0.4,
      pieces: 0.3,
      uniqueCustomers: 0.2,
      avgTicket: 0.1,
      piecesPerOrder: 0.1,
      revenuePerCustomer: 0.1,
    },
    portfolio: {
      totalCustomers: 10,
      statusCounts: {
        ACTIVE: 4,
        ATTENTION: 3,
        INACTIVE: 3,
      },
    },
    monthlyTrend: trendRevenue.map((value, index) => ({
      month: `2026-0${index + 1}`,
      revenue: value,
      orders: Math.round(value / 100),
      pieces: Math.round(value / 50),
      uniqueCustomers: Math.round(value / 200),
    })),
    topCustomers: [],
    topProducts: [],
  };
}

describe("attendantsPage helpers", () => {
  const attendants = [
    createAttendant("Suelen", 9000, [3000, 4000, 9000]),
    createAttendant("Thais", 12000, [5000, 7000, 12000]),
    createAttendant("Amanda", 7000, [2000, 5000, 7000]),
    createAttendant("Lucas", 4500, [1200, 2000, 4500]),
  ];

  it("selects the top 3 attendants by clientes atendidos on first load", () => {
    expect(getInitialSelectedAttendants(attendants, 3)).toEqual(["Thais", "Suelen", "Amanda"]);
  });

  it("keeps leaderboard sorting aligned with the requested key", () => {
    expect(sortAttendantsForBoard(attendants, "customers").map((item) => item.attendant)).toEqual([
      "Thais",
      "Suelen",
      "Amanda",
      "Lucas",
    ]);

    const rankingSample: AttendantListItem[] = [
      {
        ...attendants[0]!,
        currentPeriod: { ...attendants[0]!.currentPeriod, orders: 12, uniqueCustomers: 6 },
        portfolio: { totalCustomers: 20, statusCounts: { ACTIVE: 16, ATTENTION: 2, INACTIVE: 2 } },
      },
      {
        ...attendants[1]!,
        currentPeriod: { ...attendants[1]!.currentPeriod, orders: 9, uniqueCustomers: 3 },
        portfolio: { totalCustomers: 18, statusCounts: { ACTIVE: 9, ATTENTION: 4, INACTIVE: 5 } },
      },
      {
        ...attendants[2]!,
        currentPeriod: { ...attendants[2]!.currentPeriod, orders: 6, uniqueCustomers: 6 },
        portfolio: { totalCustomers: 10, statusCounts: { ACTIVE: 8, ATTENTION: 1, INACTIVE: 1 } },
      },
    ];

    expect(sortAttendantsForBoard(rankingSample, "recurrence").map((item) => item.attendant)).toEqual([
      "Thais",
      "Suelen",
      "Amanda",
    ]);

    expect(sortAttendantsForBoard(rankingSample, "activeShare").map((item) => item.attendant)).toEqual([
      "Amanda",
      "Suelen",
      "Thais",
    ]);

    expect(sortAttendantsForBoard(attendants, "name").map((item) => item.attendant)).toEqual([
      "Amanda",
      "Lucas",
      "Suelen",
      "Thais",
    ]);
  });

  it("caps comparison selection at 5 attendants", () => {
    const baseSelection = ["Suelen", "Thais", "Amanda", "Lucas", "Camila"];

    expect(toggleComparedAttendant(baseSelection, "Lina", 5)).toEqual(baseSelection);
    expect(toggleComparedAttendant(baseSelection, "Amanda", 5)).toEqual(["Suelen", "Thais", "Lucas", "Camila"]);
  });

  it("builds merged monthly series for the selected attendants and metric", () => {
    const { data, series } = buildTrendChartData(attendants, ["Thais", "Amanda"], "revenue");

    expect(series).toHaveLength(2);
    expect(data).toHaveLength(3);
    expect(data[0]?.month).toBe("2026-01");
    expect(Number(data[0]?.[series[0]!.dataKey])).toBe(5000);
    expect(Number(data[2]?.[series[1]!.dataKey])).toBe(7000);
  });
});

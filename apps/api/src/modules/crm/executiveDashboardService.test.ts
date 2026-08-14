import { describe, expect, it } from "vitest";
import {
  fillExecutiveDashboardSellers,
  fillExecutiveMonthlyCustomers,
  resolveExecutiveDashboardDailyPeriod,
  resolveExecutiveDashboardPeriod,
} from "./executiveDashboardService.js";

describe("resolveExecutiveDashboardPeriod", () => {
  it("uses the whole month when the day filter is omitted", () => {
    const period = resolveExecutiveDashboardPeriod(
      { year: 2026, month: 4 },
      new Date("2026-08-12T12:00:00.000Z"),
    );

    expect(period).toMatchObject({
      year: 2026,
      month: 4,
      day: null,
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      endDateExclusive: "2026-05-01",
      previousMonthStart: "2026-03-01",
      previousMonthEndExclusive: "2026-04-01",
      previousYearStart: "2025-04-01",
      previousYearEndExclusive: "2025-05-01",
    });
  });

  it("compares a selected day with the equivalent clamped day", () => {
    const period = resolveExecutiveDashboardPeriod({ year: 2026, month: 3, day: 31 });

    expect(period.startDate).toBe("2026-03-31");
    expect(period.endDateExclusive).toBe("2026-04-01");
    expect(period.previousMonthStart).toBe("2026-02-28");
    expect(period.previousMonthEndExclusive).toBe("2026-03-01");
    expect(period.previousYearStart).toBe("2025-03-31");
  });

  it("rejects a day that does not exist in the selected month", () => {
    expect(() => resolveExecutiveDashboardPeriod({ year: 2026, month: 2, day: 31 })).toThrow(
      "Dia inválido para o mês selecionado",
    );
  });

  it("shows every month from January through the selected month, including zero-sales months", () => {
    expect(fillExecutiveMonthlyCustomers(5, [
      { month: 1, unique_customers: 286 },
      { month: 3, unique_customers: 320 },
      { month: 5, unique_customers: 81 },
    ])).toEqual([
      { month: 1, uniqueCustomers: 286 },
      { month: 2, uniqueCustomers: 0 },
      { month: 3, uniqueCustomers: 320 },
      { month: 4, uniqueCustomers: 0 },
      { month: 5, uniqueCustomers: 81 },
    ]);
  });

  it("uses the latest sale day for daily indicators when the day filter is open", () => {
    const month = resolveExecutiveDashboardPeriod({ year: 2026, month: 8 });
    const daily = resolveExecutiveDashboardDailyPeriod(month, "2026-08-12");

    expect(daily).toMatchObject({
      day: 12,
      startDate: "2026-08-12",
      endDateExclusive: "2026-08-13",
    });
  });

  it("keeps the explicitly selected day for daily indicators", () => {
    const selected = resolveExecutiveDashboardPeriod({ year: 2026, month: 8, day: 7 });
    const daily = resolveExecutiveDashboardDailyPeriod(selected, "2026-08-12");

    expect(daily.startDate).toBe("2026-08-07");
  });

  it("keeps active sellers and their WhatsApp photos when daily sales are zero", () => {
    const sellers = fillExecutiveDashboardSellers(
      [
        { attendant: "Amanda", profile_picture_url: "https://photos.test/amanda.jpg" },
        { attendant: "Suelen", profile_picture_url: "https://photos.test/suelen.jpg" },
        { attendant: "Tamires", profile_picture_url: "https://photos.test/tamires.jpg" },
        { attendant: "Thais", profile_picture_url: "https://photos.test/thais.jpg" },
      ],
      [
        {
          attendant: "Amanda Oliveira",
          profile_picture_url: null,
          total_orders: 1,
          unique_customers: 1,
          total_revenue: 225,
          total_items: 5,
          screen_items: 5,
          battery_items: 0,
          charging_dock_items: 0,
        },
        {
          attendant: "Seller without an active WhatsApp instance",
          profile_picture_url: null,
          total_orders: 3,
          unique_customers: 3,
          total_revenue: 500,
          total_items: 20,
          screen_items: 20,
          battery_items: 0,
          charging_dock_items: 0,
        },
      ],
    );

    expect(sellers).toHaveLength(4);
    expect(sellers[0]).toMatchObject({
      attendant: "Amanda",
      profilePictureUrl: "https://photos.test/amanda.jpg",
      screenItems: 5,
    });

    for (const name of ["Suelen", "Tamires", "Thais"]) {
      expect(sellers.find((seller) => seller.attendant === name)).toMatchObject({
        profilePictureUrl: `https://photos.test/${name.toLocaleLowerCase("pt-BR")}.jpg`,
        totalOrders: 0,
        uniqueCustomers: 0,
        screenItems: 0,
      });
    }
  });
});

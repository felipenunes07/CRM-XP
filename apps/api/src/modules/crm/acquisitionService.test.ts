import { describe, expect, it } from "vitest";
import { buildAcquisitionMetrics } from "./acquisitionService.js";

describe("acquisitionService helpers", () => {
  it("combines first-purchase history with monthly meta spend", () => {
    const metrics = buildAcquisitionMetrics(
      [
        {
          customerId: "1",
          customerCode: "C001",
          displayName: "Cliente Abril A",
          firstOrderDate: "2026-04-16",
          firstOrderAmount: 100,
          firstItemCount: 1,
          firstAttendant: "Amanda",
        },
        {
          customerId: "2",
          customerCode: "C002",
          displayName: "Cliente Abril B",
          firstOrderDate: "2026-04-05",
          firstOrderAmount: 200,
          firstItemCount: 2,
          firstAttendant: "Bianca",
        },
        {
          customerId: "3",
          customerCode: "C003",
          displayName: "Cliente Marco",
          firstOrderDate: "2026-03-10",
          firstOrderAmount: 150,
          firstItemCount: 1,
          firstAttendant: "Carla",
        },
        {
          customerId: "4",
          customerCode: "C004",
          displayName: "Cliente Historico",
          firstOrderDate: "2024-01-05",
          firstOrderAmount: 90,
          firstItemCount: 1,
          firstAttendant: null,
        },
      ],
      "2026-04-16",
      30,
      [
        { month: "2026-04", spend: 1000, currency: "BRL" },
        { month: "2026-03", spend: 500, currency: "BRL" },
        { month: "2024-01", spend: 300, currency: "BRL" },
      ],
      null,
      null,
      { amount: 0, items: 0, orders: 0, performance: [] },
      new Map(),
      new Map(),
      [],
      []
    );

    expect(metrics.summary).toMatchObject({
      today: 1,
      yesterday: 0,
      currentMonth: 2,
      previousMonth: 1,
      historicalTotal: 4,
      currentMonthSpend: 1000,
      previousMonthSpend: 500,
      currentMonthCac: 500,
      previousMonthCac: 500,
    });

    expect(metrics.monthlySeries.find((entry) => entry.month === "2026-04")).toEqual({
      month: "2026-04",
      newCustomers: 2,
      spend: 1000,
      cac: 500,
    });

    expect(metrics.monthlySeries.find((entry) => entry.month === "2026-02")).toEqual({
      month: "2026-02",
      newCustomers: 0,
      spend: 0,
      cac: null,
    });
  });

  it("starts the monthly series at the earliest spend month when ads predate purchases", () => {
    const metrics = buildAcquisitionMetrics(
      [
        {
          customerId: "1",
          customerCode: "C001",
          displayName: "Primeira Compra",
          firstOrderDate: "2026-04-01",
          firstOrderAmount: 120,
          firstItemCount: 1,
          firstAttendant: "Amanda",
        },
      ],
      "2026-04-16",
      30,
      [{ month: "2026-02", spend: 700, currency: "BRL" }],
      null,
      null,
      { amount: 0, items: 0, orders: 0, performance: [] },
      new Map(),
      new Map(),
      [],
      []
    );

    expect(metrics.monthlySeries.slice(0, 3)).toEqual([
      { month: "2026-02", newCustomers: 0, spend: 700, cac: null },
      { month: "2026-03", newCustomers: 0, spend: 0, cac: null },
      { month: "2026-04", newCustomers: 1, spend: 0, cac: 0 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { mergeCustomerAnalyticsTimeline } from "./customerAnalyticsService.js";

describe("mergeCustomerAnalyticsTimeline", () => {
  it("combines sales and payments while keeping months with only one source", () => {
    expect(mergeCustomerAnalyticsTimeline(
      [
        { month: "2026-01", salesAmount: 1000, orderCount: 2, pieces: 30 },
        { month: "2026-03", salesAmount: 2000, orderCount: 3, pieces: 45 },
      ],
      [
        { month: "2026-02", paymentAmount: 800, paymentCount: 1 },
        { month: "2026-03", paymentAmount: 1500, paymentCount: 2 },
      ],
    )).toEqual([
      { month: "2026-01", salesAmount: 1000, orderCount: 2, pieces: 30, paymentAmount: 0, paymentCount: 0 },
      { month: "2026-02", salesAmount: 0, orderCount: 0, pieces: 0, paymentAmount: 800, paymentCount: 1 },
      { month: "2026-03", salesAmount: 2000, orderCount: 3, pieces: 45, paymentAmount: 1500, paymentCount: 2 },
    ]);
  });

  it("fills months without movements so charts do not hide inactive periods", () => {
    expect(mergeCustomerAnalyticsTimeline(
      [
        { month: "2026-01", salesAmount: 100, orderCount: 1, pieces: 2 },
        { month: "2026-03", salesAmount: 300, orderCount: 2, pieces: 4 },
      ],
      [],
    )).toEqual([
      { month: "2026-01", salesAmount: 100, orderCount: 1, pieces: 2, paymentAmount: 0, paymentCount: 0 },
      { month: "2026-02", salesAmount: 0, orderCount: 0, pieces: 0, paymentAmount: 0, paymentCount: 0 },
      { month: "2026-03", salesAmount: 300, orderCount: 2, pieces: 4, paymentAmount: 0, paymentCount: 0 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildTrendRangeAnalysisResponse,
  normalizeTrendRangeSelection,
  pickTrendRangeWorstStatus,
} from "./dashboardService.js";

describe("dashboardService trend range helpers", () => {
  it("normalizes the dragged range order before querying", () => {
    expect(normalizeTrendRangeSelection("2026-03-20", "2026-01-10")).toEqual({
      startDate: "2026-01-10",
      endDate: "2026-03-20",
    });
  });

  it("keeps the worst status when a customer passed through attention and inactive", () => {
    expect(pickTrendRangeWorstStatus(["ATTENTION", "INACTIVE", "ATTENTION"])).toBe("INACTIVE");
    expect(pickTrendRangeWorstStatus(["ATTENTION"])).toBe("ATTENTION");
  });

  it("builds the summary, lost customers list and monthly loss series", () => {
    const response = buildTrendRangeAnalysisResponse(
      { startDate: "2026-01-10", endDate: "2026-02-20" },
      [
        {
          customer_id: "customer-1",
          customer_code: "CL001",
          display_name: "Alpha Store",
          worst_status: "ATTENTION",
          first_critical_date: "2026-01-15",
          last_purchase_at: "2025-12-15",
          days_since_last_purchase: 130,
          total_orders: 10,
          total_spent: 4000,
          avg_ticket: 400,
          last_attendant: "Amanda",
          baseline_monthly_revenue: 300,
          baseline_monthly_pieces: 30,
          has_orders_after_range: false,
          revenue_after_range: 0,
          pieces_after_range: 0,
        },
        {
          customer_id: "customer-2",
          customer_code: "CL002",
          display_name: "Beta Mobile",
          worst_status: "INACTIVE",
          first_critical_date: "2026-01-12",
          last_purchase_at: "2025-11-01",
          days_since_last_purchase: 174,
          total_orders: 5,
          total_spent: 2500,
          avg_ticket: 500,
          last_attendant: "Suelen",
          baseline_monthly_revenue: 200,
          baseline_monthly_pieces: 18,
          has_orders_after_range: true,
          revenue_after_range: 640,
          pieces_after_range: 6,
        },
      ],
      [
        {
          month: "2026-03-01",
          expected_revenue: 500,
          actual_revenue: 120,
          expected_pieces: 48,
          actual_pieces: 10,
        },
        {
          month: "2026-04-01",
          expected_revenue: 500,
          actual_revenue: 640,
          expected_pieces: 48,
          actual_pieces: 55,
        },
      ],
    );

    expect(response.summary.totalCustomers).toBe(2);
    expect(response.summary.attentionCustomers).toBe(1);
    expect(response.summary.inactiveCustomers).toBe(1);
    expect(response.summary.neverReturnedCustomers).toBe(1);
    expect(response.summary.averageTicket).toBeCloseTo(433.33, 2);
    expect(response.summary.estimatedMonthlyRevenueLoss).toBe(300);
    expect(response.summary.estimatedMonthlyPiecesLoss).toBe(30);
    expect(response.recoveredSummary).toEqual({
      recoveredCustomers: 1,
      recoveredRevenue: 640,
      recoveredPieces: 6,
    });
    expect(response.lostCustomers).toHaveLength(1);
    expect(response.lostCustomers[0]?.customerId).toBe("customer-1");
    expect(response.monthlyLossSeries).toEqual([
      {
        month: "2026-03-01",
        expectedRevenue: 500,
        actualRevenue: 120,
        lostRevenue: 380,
        expectedPieces: 48,
        actualPieces: 10,
        lostPieces: 38,
      },
      {
        month: "2026-04-01",
        expectedRevenue: 500,
        actualRevenue: 640,
        lostRevenue: 0,
        expectedPieces: 48,
        actualPieces: 55,
        lostPieces: 0,
      },
    ]);
  });
});

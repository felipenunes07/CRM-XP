import type { CustomerAnalyticsTimelinePoint } from "@olist-crm/shared";
import { describe, expect, it } from "vitest";
import { calculateCustomerSalesTrend } from "./CustomerAnalyticsPage";

function point(month: string, salesAmount: number): CustomerAnalyticsTimelinePoint {
  return { month, salesAmount, orderCount: 1, pieces: 10, paymentAmount: 0, paymentCount: 0 };
}

describe("calculateCustomerSalesTrend", () => {
  it("identifies when the recent purchase average increased", () => {
    const result = calculateCustomerSalesTrend([
      point("2026-01", 100), point("2026-02", 100), point("2026-03", 100),
      point("2026-04", 200), point("2026-05", 200), point("2026-06", 200),
    ]);

    expect(result.direction).toBe("up");
    expect(result.label).toBe("Comprando mais");
    expect(result.percent).toBe(1);
  });
});

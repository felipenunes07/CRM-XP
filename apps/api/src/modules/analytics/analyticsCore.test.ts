import { describe, expect, it } from "vitest";
import { computeCustomerSnapshot } from "./analyticsCore.js";

describe("computeCustomerSnapshot", () => {
  it("classifies active recurring customers and predicts a next purchase", () => {
    const snapshot = computeCustomerSnapshot({
      orderDates: [new Date("2026-01-01"), new Date("2026-01-31"), new Date("2026-03-02")],
      orderTotals: [1000, 1100, 1200],
      maxSpent: 3300,
      maxOrders: 3,
      highValueThreshold: 2500,
      now: new Date("2026-03-10"),
    });

    expect(snapshot.status).toBe("ACTIVE");
    expect(snapshot.avgGap).toBe(30);
    expect(snapshot.predictedNextPurchaseAt?.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(snapshot.insightTags).toContain("alto_valor");
    expect(snapshot.valueScore).toBeGreaterThan(80);
  });

  it("flags churn risk when the customer stopped buying and prediction is overdue", () => {
    const snapshot = computeCustomerSnapshot({
      orderDates: [new Date("2025-10-01"), new Date("2025-10-20"), new Date("2025-11-10"), new Date("2025-11-28")],
      orderTotals: [500, 520, 510, 530],
      maxSpent: 4000,
      maxOrders: 8,
      highValueThreshold: 3000,
      now: new Date("2026-04-02"),
    });

    expect(snapshot.status).toBe("INACTIVE");
    expect(snapshot.insightTags).toContain("reativacao");
    expect(snapshot.insightTags).toContain("compra_prevista_vencida");
    expect(snapshot.priorityScore).toBeGreaterThan(50);
  });
});

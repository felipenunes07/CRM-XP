import { describe, expect, it } from "vitest";
import { requiresSynchronousDashboardMetricsRepair } from "./dashboardService.js";

describe("dashboard freshness repair policy", () => {
  it("repairs the first-ever dashboard before serving it", () => {
    expect(requiresSynchronousDashboardMetricsRepair(0, 90)).toBe(true);
    expect(requiresSynchronousDashboardMetricsRepair(20, 0)).toBe(true);
  });

  it("keeps a populated dashboard responsive while it refreshes in background", () => {
    expect(requiresSynchronousDashboardMetricsRepair(20, 89)).toBe(false);
  });
});

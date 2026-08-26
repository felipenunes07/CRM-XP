import type { ItemsSoldTrendPoint } from "@olist-crm/shared";
import { describe, expect, it, vi } from "vitest";
import { buildItemsSoldTrendQuery, loadDashboardItemsSoldTrends } from "./dashboardService.js";

describe("dashboard items sold trend", () => {
  it("limits orders before joining and classifying their items", () => {
    const query = buildItemsSoldTrendQuery();

    expect(query.params).toEqual([]);
    expect(query.sql).toContain("WITH selected_orders AS MATERIALIZED");
    expect(query.sql).toContain("JOIN selected_orders selected ON selected.id = oi.order_id");
    expect(query.sql).toContain("raw_order_items AS MATERIALIZED");
    expect(query.sql).toContain("FROM selected_orders o");
    expect(query.sql).toContain("o.customer_code ~ '^CL[0-9]+'");
  });

  it("applies the customer prefix while selecting orders", () => {
    const query = buildItemsSoldTrendQuery("CL");

    expect(query.params).toEqual(["CL"]);
    expect(query.sql).toContain("c.customer_code ~ ('^' || $1 || '[0-9]+')");
  });

  it("reuses the global request when there is no customer prefix", () => {
    const points: ItemsSoldTrendPoint[] = [];
    const loader = vi.fn(async () => points);

    const requests = loadDashboardItemsSoldTrends(undefined, loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(requests.itemsSoldTrend).toBe(requests.globalItemsSoldTrend);
  });

  it("loads filtered and global trends separately when a prefix is selected", () => {
    const loader = vi.fn(async () => [] as ItemsSoldTrendPoint[]);

    loadDashboardItemsSoldTrends("KH", loader);

    expect(loader).toHaveBeenNthCalledWith(1, undefined);
    expect(loader).toHaveBeenNthCalledWith(2, "KH");
  });

  it("keeps the dashboard available when the trend query times out", async () => {
    const loader = vi.fn(async () => {
      throw new Error("Query read timeout");
    });

    const requests = loadDashboardItemsSoldTrends(undefined, loader);

    await expect(requests.itemsSoldTrend).resolves.toEqual([]);
    await expect(requests.globalItemsSoldTrend).resolves.toEqual([]);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

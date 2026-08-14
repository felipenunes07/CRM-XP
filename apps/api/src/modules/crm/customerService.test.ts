import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerDocInsightListItem } from "@olist-crm/shared";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db/client.js", () => ({
  pool: { query: queryMock },
}));

import {
  getCustomerDetail,
  listCustomers,
  mapCustomerOrderItems,
  sortCustomerDocInsights,
} from "./customerService.js";

beforeEach(() => {
  queryMock.mockReset();
});

function createInsight(
  displayName: string,
  docQuantity: number,
  docOrderCount: number,
  docRevenue: number,
): CustomerDocInsightListItem {
  return {
    id: displayName.toLowerCase().replace(/\s+/g, "-"),
    customerCode: displayName.slice(0, 3).toUpperCase(),
    displayName,
    status: "ACTIVE",
    docQuantity,
    docOrderCount,
    docRevenue,
    lastDocPurchaseAt: "2026-04-10",
    state: null,
    city: null,
  };
}

describe("sortCustomerDocInsights", () => {
  it("sorts by quantity, then orders, then revenue, then display name", () => {
    const ranking = sortCustomerDocInsights([
      createInsight("Zulu Cell", 120, 5, 1500),
      createInsight("Alpha Doc", 120, 5, 1800),
      createInsight("Beta Tela", 120, 6, 900),
      createInsight("Gama Store", 140, 2, 500),
    ]);

    expect(ranking.map((item) => item.displayName)).toEqual([
      "Gama Store",
      "Beta Tela",
      "Alpha Doc",
      "Zulu Cell",
    ]);
  });
});

describe("mapCustomerOrderItems", () => {
  it("maps the product lines with quantities and values", () => {
    expect(mapCustomerOrderItems([
      {
        id: "item-1",
        sku: "IP13-OLED",
        itemDescription: "Tela iPhone 13 OLED",
        quantity: "3",
        unitPrice: "125.50",
        lineTotal: "376.50",
      },
      null,
    ])).toEqual([
      {
        id: "item-1",
        sku: "IP13-OLED",
        itemDescription: "Tela iPhone 13 OLED",
        quantity: 3,
        unitPrice: 125.5,
        lineTotal: 376.5,
      },
    ]);
  });
});

describe("customer queries", () => {
  it("keeps the customer list independent from a customer id parameter", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await listCustomers({ limit: 5 });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[1]).toEqual([]);
    expect(String(queryMock.mock.calls[0]?.[0])).not.toContain("WITH recent_orders");
  });

  it("limits orders before aggregating their product lines", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          customer_id: "customer-1",
          customer_code: "CLI-1",
          display_name: "Cliente teste",
          total_orders: 0,
          internal_notes: "",
          labels: [],
          insight_tags: [],
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getCustomerDetail("customer-1");

    const orderQuery = String(queryMock.mock.calls[1]?.[0]);
    expect(orderQuery).toContain("WITH recent_orders AS MATERIALIZED");
    expect(orderQuery).toContain("LIMIT 20");
    expect(orderQuery).toContain("jsonb_agg");
  });
});

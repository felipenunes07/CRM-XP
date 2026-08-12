import { describe, expect, it } from "vitest";
import type { GeographicSalesResponse } from "@olist-crm/shared";
import { filterGeographicDataBySeller } from "./GeographicView";

const source: GeographicSalesResponse = {
  summary: {
    totalStates: 2,
    totalCities: 3,
    totalCustomers: 3,
    totalOrders: 6,
    totalPieces: 24,
    totalRevenue: 2400,
  },
  stateStats: [],
  cityStats: [],
  customerStats: [
    {
      customerId: "1",
      customerCode: "C-1",
      displayName: "Loja Sul",
      state: "PR",
      city: "Curitiba",
      sellerName: "Amanda",
      status: "ACTIVE",
      daysSinceLastPurchase: 5,
      orderCount: 2,
      totalPieces: 10,
      totalRevenue: 1000,
    },
    {
      customerId: "2",
      customerCode: "C-2",
      displayName: "Loja Norte",
      state: "SP",
      city: "Campinas",
      sellerName: "Amanda",
      status: "ATTENTION",
      daysSinceLastPurchase: 45,
      orderCount: 3,
      totalPieces: 12,
      totalRevenue: 1200,
    },
    {
      customerId: "3",
      customerCode: "C-3",
      displayName: "Loja Centro",
      state: "SP",
      city: "São Paulo",
      sellerName: "Thais",
      status: "INACTIVE",
      daysSinceLastPurchase: 150,
      orderCount: 1,
      totalPieces: 2,
      totalRevenue: 200,
    },
  ],
};

describe("filterGeographicDataBySeller", () => {
  it("rebuilds state and city totals with only the selected seller portfolio", () => {
    const result = filterGeographicDataBySeller(source, "amanda");

    expect(result.summary).toEqual({
      totalStates: 2,
      totalCities: 2,
      totalCustomers: 2,
      totalOrders: 5,
      totalPieces: 22,
      totalRevenue: 2200,
    });
    expect(result.customerStats.map((customer) => customer.displayName)).toEqual(["Loja Sul", "Loja Norte"]);
    expect(result.stateStats.find((state) => state.state === "SP")).toMatchObject({
      customerCount: 1,
      attentionCustomerCount: 1,
      inactiveCustomerCount: 0,
      totalPieces: 12,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCustomersQueryParams,
  createInitialCustomersPageState,
  customersPageReducer,
} from "./customersPage.helpers";

describe("customersPageReducer", () => {
  it("keeps the portfolio filters when switching between tabs", () => {
    let state = createInitialCustomersPageState();

    state = customersPageReducer(state, {
      type: "updatePortfolioFilter",
      key: "search",
      value: "Vini Cell",
    });
    state = customersPageReducer(state, {
      type: "updatePortfolioFilter",
      key: "status",
      value: "ACTIVE",
    });
    state = customersPageReducer(state, {
      type: "updatePortfolioFilter",
      key: "ambassadorOnly",
      value: "true",
    });

    state = customersPageReducer(state, { type: "setView", view: "docInsights" });
    state = customersPageReducer(state, { type: "setView", view: "portfolio" });

    expect(state.activeView).toBe("portfolio");
    expect(state.portfolioFilters).toMatchObject({
      search: "Vini Cell",
      status: "ACTIVE",
      ambassadorOnly: "true",
    });
  });

  it("builds the customers query params from the preserved filters", () => {
    const params = buildCustomersQueryParams({
      search: "Cassio",
      status: "ATTENTION",
      sortBy: "faturamento",
      label: "VIP",
      excludeLabel: "Black list",
      ambassadorOnly: "true",
    });

    expect(params).toEqual({
      search: "Cassio",
      status: "ATTENTION",
      sortBy: "faturamento",
      labels: "VIP",
      excludeLabels: "Black list",
      isAmbassador: true,
      limit: 120,
    });
  });
});

export type CustomersPageView = "portfolio" | "docInsights";
export type CustomerPortfolioSortBy = "priority" | "faturamento" | "recencia";

export interface CustomerPortfolioFilters {
  search: string;
  status: string;
  sortBy: CustomerPortfolioSortBy;
  label: string;
  excludeLabel: string;
  ambassadorOnly: string;
}

export interface CustomersPageState {
  activeView: CustomersPageView;
  portfolioFilters: CustomerPortfolioFilters;
}

export type CustomersPageAction =
  | { type: "setView"; view: CustomersPageView }
  | {
      type: "updatePortfolioFilter";
      key: "search" | "status" | "label" | "excludeLabel" | "ambassadorOnly";
      value: string;
    }
  | { type: "updatePortfolioFilter"; key: "sortBy"; value: CustomerPortfolioSortBy };

export function createInitialCustomersPageState(): CustomersPageState {
  return {
    activeView: "portfolio",
    portfolioFilters: {
      search: "",
      status: "",
      sortBy: "priority",
      label: "",
      excludeLabel: "",
      ambassadorOnly: "",
    },
  };
}

export function customersPageReducer(state: CustomersPageState, action: CustomersPageAction): CustomersPageState {
  if (action.type === "setView") {
    if (state.activeView === action.view) {
      return state;
    }

    return {
      ...state,
      activeView: action.view,
    };
  }

  if (state.portfolioFilters[action.key] === action.value) {
    return state;
  }

  return {
    ...state,
    portfolioFilters: {
      ...state.portfolioFilters,
      [action.key]: action.value,
    },
  };
}

export function buildCustomersQueryParams(filters: CustomerPortfolioFilters) {
  return {
    search: filters.search,
    status: filters.status,
    sortBy: filters.sortBy,
    labels: filters.label,
    excludeLabels: filters.excludeLabel,
    isAmbassador: filters.ambassadorOnly === "true" ? true : undefined,
    limit: 120,
  };
}

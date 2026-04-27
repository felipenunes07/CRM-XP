export type CustomersPageView = "portfolio" | "docInsights" | "creditPayment" | "geographic";
export type CustomerPortfolioSortBy = "priority" | "faturamento" | "recencia";
export type CreditKpiFilter = "owing" | "credit_balance" | "unused_credit" | "over_credit" | "";

export interface CustomerPortfolioFilters {
  search: string;
  status: string;
  sortBy: CustomerPortfolioSortBy;
  label: string;
  excludeLabel: string;
  ambassadorOnly: string;
}

export interface CustomerCreditFilters {
  search: string;
  riskLevel: string;
  operationalState: string;
  onlyWithCredit: string;
  onlyUnusedCredit: string;
  onlyOverdue: string;
}

export interface CustomersPageState {
  activeView: CustomersPageView;
  portfolioFilters: CustomerPortfolioFilters;
  creditFilters: CustomerCreditFilters;
  creditKpiFilter: CreditKpiFilter;
}

export type CustomersPageAction =
  | { type: "setView"; view: CustomersPageView }
  | { type: "setCreditKpiFilter"; value: CreditKpiFilter }
  | {
      type: "updatePortfolioFilter";
      key: "search" | "status" | "label" | "excludeLabel" | "ambassadorOnly";
      value: string;
    }
  | { type: "updatePortfolioFilter"; key: "sortBy"; value: CustomerPortfolioSortBy }
  | {
      type: "updateCreditFilter";
      key: keyof CustomerCreditFilters;
      value: string;
    }
  | { type: "setCreditInsight"; insight: "over_credit" | "unused_credit" | "overdue" }
  | { type: "clearCreditFilters" };

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
    creditFilters: {
      search: "",
      riskLevel: "",
      operationalState: "",
      onlyWithCredit: "",
      onlyUnusedCredit: "",
      onlyOverdue: "",
    },
    creditKpiFilter: "",
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

  if (action.type === "updateCreditFilter") {
    if (state.creditFilters[action.key] === action.value) {
      return state;
    }

    return {
      ...state,
      creditFilters: {
        ...state.creditFilters,
        [action.key]: action.value,
      },
    };
  }

  if (action.type === "setCreditKpiFilter") {
    return {
      ...state,
      creditKpiFilter: state.creditKpiFilter === action.value ? "" : action.value,
    };
  }
  
  if (action.type === "clearCreditFilters") {
    return {
      ...state,
      creditKpiFilter: "",
      creditFilters: {
        search: "",
        riskLevel: "",
        operationalState: "",
        onlyWithCredit: "",
        onlyUnusedCredit: "",
        onlyOverdue: "",
      },
    };
  }
  
  if (action.type === "setCreditInsight") {
    // 1. Reset everything to initial credit state
    const cleanState: CustomersPageState = {
      ...state,
      creditKpiFilter: "",
      creditFilters: {
        search: "",
        riskLevel: "",
        operationalState: "",
        onlyWithCredit: "",
        onlyUnusedCredit: "",
        onlyOverdue: "",
      },
    };

    // 2. Apply the chosen insight
    if (action.insight === "over_credit") {
      cleanState.creditKpiFilter = "over_credit";
    } else if (action.insight === "unused_credit") {
      cleanState.creditKpiFilter = "unused_credit";
    } else if (action.insight === "overdue") {
      cleanState.creditFilters.onlyOverdue = "true";
    }

    return cleanState;
  }

  if (state.portfolioFilters[action.key] !== action.value) {
    return {
      ...state,
      portfolioFilters: {
        ...state.portfolioFilters,
        [action.key]: action.value,
      },
    };
  }

  return state;
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

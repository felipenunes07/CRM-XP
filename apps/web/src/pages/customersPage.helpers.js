export function createInitialCustomersPageState() {
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
        creditPresentation: "cards",
    };
}
export function customersPageReducer(state, action) {
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
    if (action.type === "setCreditPresentation") {
        if (state.creditPresentation === action.value) {
            return state;
        }
        return {
            ...state,
            creditPresentation: action.value,
        };
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
export function buildCustomersQueryParams(filters) {
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

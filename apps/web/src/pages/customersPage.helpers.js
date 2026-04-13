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

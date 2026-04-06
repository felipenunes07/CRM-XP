function toSafeNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
        return 0;
    }
    return value;
}
export function formatCurrency(value) {
    const safeValue = toSafeNumber(value);
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
    }).format(safeValue);
}
export function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 0,
    }).format(toSafeNumber(value));
}
export function formatDate(value) {
    if (!value) {
        return "Sem registro";
    }
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(value));
}
export function formatDaysSince(value) {
    if (value === null || value === undefined) {
        return "Sem base";
    }
    if (value === 0) {
        return "Hoje";
    }
    if (value === 1) {
        return "1 dia";
    }
    return `${value} dias`;
}
export function formatPercent(value) {
    const safeValue = toSafeNumber(value);
    return `${new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(safeValue * 100)}%`;
}
export function statusLabel(status) {
    if (status === "ACTIVE")
        return "Ativo";
    if (status === "ATTENTION")
        return "Atenção";
    return "Inativo";
}

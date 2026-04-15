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
function extractCalendarDate(value) {
    const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matched) {
        return {
            year: matched[1],
            month: matched[2],
            day: matched[3],
        };
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return {
        year: String(parsed.getUTCFullYear()),
        month: String(parsed.getUTCMonth() + 1).padStart(2, "0"),
        day: String(parsed.getUTCDate()).padStart(2, "0"),
    };
}
export function formatDate(value) {
    if (!value) {
        return "Sem registro";
    }
    const date = extractCalendarDate(value);
    if (!date) {
        return "Sem registro";
    }
    return `${date.day}/${date.month}/${date.year}`;
}
export function formatShortDate(value) {
    if (!value) {
        return "--";
    }
    const date = extractCalendarDate(value);
    if (!date) {
        return "--";
    }
    return `${date.day}/${date.month}`;
}
export function formatDateTime(value) {
    if (!value) {
        return "Sem registro";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "Sem registro";
    }
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed);
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
        return "Atencao";
    return "Inativo";
}
export function calculateDaysSince(dateString) {
    if (!dateString)
        return null;
    const targetDate = new Date(dateString);
    if (Number.isNaN(targetDate.getTime()))
        return null;
    const today = new Date();
    // Normalize both to UTC midnight for comparison
    const d1 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const d2 = Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
    const diffMs = d1 - d2;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

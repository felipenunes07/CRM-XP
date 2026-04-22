let activeLocale = "pt-BR";
function toSafeNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
        return 0;
    }
    return value;
}
function isChineseLocale() {
    return activeLocale === "zh-CN";
}
function localizedLabel(pt, zh) {
    return isChineseLocale() ? zh : pt;
}
function buildUtcDate(parts) {
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}
export function setFormattingLocale(locale) {
    activeLocale = locale === "zh-CN" ? "zh-CN" : "pt-BR";
}
export function getFormattingLocale() {
    return activeLocale;
}
export function formatCurrency(value) {
    const safeValue = toSafeNumber(value);
    return new Intl.NumberFormat(activeLocale, {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
    }).format(safeValue);
}
export function formatNumber(value) {
    return new Intl.NumberFormat(activeLocale, {
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
        return localizedLabel("Sem registro", "无记录");
    }
    const date = extractCalendarDate(value);
    if (!date) {
        return localizedLabel("Sem registro", "无记录");
    }
    return new Intl.DateTimeFormat(activeLocale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(buildUtcDate(date));
}
export function formatShortDate(value) {
    if (!value) {
        return "--";
    }
    const date = extractCalendarDate(value);
    if (!date) {
        return "--";
    }
    return new Intl.DateTimeFormat(activeLocale, {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
    }).format(buildUtcDate(date));
}
export function formatDateTime(value) {
    if (!value) {
        return localizedLabel("Sem registro", "无记录");
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return localizedLabel("Sem registro", "无记录");
    }
    return new Intl.DateTimeFormat(activeLocale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsed);
}
export function formatDaysSince(value) {
    if (value === null || value === undefined) {
        return localizedLabel("Sem base", "无数据");
    }
    if (value === 0) {
        return localizedLabel("Hoje", "今天");
    }
    if (value === 1) {
        return localizedLabel("1 dia", "1天");
    }
    return isChineseLocale() ? `${value}天` : `${value} dias`;
}
export function formatPercent(value) {
    const safeValue = toSafeNumber(value);
    return `${new Intl.NumberFormat(activeLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(safeValue * 100)}%`;
}
export function statusLabel(status) {
    if (status === "ACTIVE")
        return localizedLabel("Ativo", "活跃");
    if (status === "ATTENTION")
        return localizedLabel("Atencao", "关注");
    return localizedLabel("Inativo", "沉默");
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

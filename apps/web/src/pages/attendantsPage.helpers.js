const trendColors = ["#2956d7", "#2f9d67", "#d09a29", "#d9534f", "#7a54ff"];
const fixedAttendantColors = {
    suelen: "#2956d7",
    thais: "#2f9d67",
    amanda: "#d09a29",
    lucas: "#d9534f",
    tamires: "#7a54ff",
};
function normalizeAttendantName(attendant) {
    return attendant.trim().toLocaleLowerCase("pt-BR");
}
function safeDivide(numerator, denominator) {
    if (!denominator) {
        return 0;
    }
    return numerator / denominator;
}
export function chartMetricLabel(metric) {
    if (metric === "orders") {
        return "Vendas";
    }
    if (metric === "pieces") {
        return "Pecas";
    }
    if (metric === "uniqueCustomers") {
        return "Clientes";
    }
    return "Faturamento";
}
export function getCurrentMetricValue(item, metric) {
    if (metric === "orders") {
        return item.currentPeriod.orders;
    }
    if (metric === "pieces") {
        return item.currentPeriod.pieces;
    }
    if (metric === "uniqueCustomers") {
        return item.currentPeriod.uniqueCustomers;
    }
    return item.currentPeriod.revenue;
}
export function getAttendantColor(attendant) {
    const fixedColor = fixedAttendantColors[normalizeAttendantName(attendant)];
    if (fixedColor) {
        return fixedColor;
    }
    const hash = normalizeAttendantName(attendant)
        .split("")
        .reduce((total, char) => total + char.charCodeAt(0), 0);
    return trendColors[hash % trendColors.length] ?? "#2956d7";
}
export function sortAttendantsForBoard(items, sortKey) {
    return [...items].sort((left, right) => {
        if (sortKey === "name") {
            return left.attendant.localeCompare(right.attendant, "pt-BR");
        }
        const leftValue = sortKey === "recurrence"
            ? safeDivide(left.currentPeriod.orders, left.currentPeriod.uniqueCustomers)
            : sortKey === "activeShare"
                ? safeDivide(left.portfolio.statusCounts.ACTIVE, left.portfolio.totalCustomers)
                : sortKey === "reactivationRisk"
                    ? safeDivide(left.portfolio.statusCounts.ATTENTION + left.portfolio.statusCounts.INACTIVE, left.portfolio.totalCustomers)
                    : sortKey === "orders"
                        ? left.currentPeriod.orders
                        : sortKey === "pieces"
                            ? left.currentPeriod.pieces
                            : sortKey === "customers"
                                ? left.currentPeriod.uniqueCustomers
                                : sortKey === "growth"
                                    ? (left.growth.uniqueCustomers ?? Number.NEGATIVE_INFINITY)
                                    : sortKey === "portfolio"
                                        ? left.portfolio.totalCustomers
                                        : left.currentPeriod.orders;
        const rightValue = sortKey === "recurrence"
            ? safeDivide(right.currentPeriod.orders, right.currentPeriod.uniqueCustomers)
            : sortKey === "activeShare"
                ? safeDivide(right.portfolio.statusCounts.ACTIVE, right.portfolio.totalCustomers)
                : sortKey === "reactivationRisk"
                    ? safeDivide(right.portfolio.statusCounts.ATTENTION + right.portfolio.statusCounts.INACTIVE, right.portfolio.totalCustomers)
                    : sortKey === "orders"
                        ? right.currentPeriod.orders
                        : sortKey === "pieces"
                            ? right.currentPeriod.pieces
                            : sortKey === "customers"
                                ? right.currentPeriod.uniqueCustomers
                                : sortKey === "growth"
                                    ? (right.growth.uniqueCustomers ?? Number.NEGATIVE_INFINITY)
                                    : sortKey === "portfolio"
                                        ? right.portfolio.totalCustomers
                                        : right.currentPeriod.orders;
        if (rightValue !== leftValue) {
            return rightValue - leftValue;
        }
        return left.attendant.localeCompare(right.attendant, "pt-BR");
    });
}
export function getInitialSelectedAttendants(items, maxSelections = 3) {
    return sortAttendantsForBoard(items, "customers")
        .slice(0, maxSelections)
        .map((item) => item.attendant);
}
export function toggleComparedAttendant(current, attendant, maxSelections = 5) {
    if (current.includes(attendant)) {
        return current.filter((entry) => entry !== attendant);
    }
    if (current.length >= maxSelections) {
        return current;
    }
    return [...current, attendant];
}
export function buildAttendantLineKey(attendant) {
    return `attendant_${attendant.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}`;
}
export function buildTrendChartData(items, selectedAttendants, metric) {
    const selectedItems = selectedAttendants
        .map((attendant) => items.find((item) => item.attendant === attendant))
        .filter((item) => Boolean(item));
    const monthOrder = new Set();
    selectedItems.forEach((item) => {
        item.monthlyTrend.forEach((point) => {
            monthOrder.add(point.month);
        });
    });
    const data = Array.from(monthOrder).map((month) => ({ month }));
    const rowByMonth = new Map(data.map((row) => [row.month, row]));
    const series = selectedItems.map((item, index) => {
        const dataKey = buildAttendantLineKey(item.attendant);
        item.monthlyTrend.forEach((point) => {
            const row = rowByMonth.get(point.month);
            if (!row) {
                return;
            }
            row[dataKey] =
                metric === "orders"
                    ? point.orders
                    : metric === "pieces"
                        ? point.pieces
                        : metric === "uniqueCustomers"
                            ? point.uniqueCustomers
                            : point.revenue;
        });
        data.forEach((row) => {
            if (row[dataKey] === undefined) {
                row[dataKey] = 0;
            }
        });
        return {
            attendant: item.attendant,
            dataKey,
            color: getAttendantColor(item.attendant) ?? trendColors[index % trendColors.length] ?? trendColors[0] ?? "#2956d7",
        };
    });
    return { data, series };
}

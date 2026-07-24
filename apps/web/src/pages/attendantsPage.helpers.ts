import type { AttendantListItem } from "@olist-crm/shared";

export type AttendantChartMetric =
  | "revenue"
  | "orders"
  | "pieces"
  | "uniqueCustomers"
  | "newCustomers"
  | "recoveredCustomers"
  | "lostCustomers"
  | "sentMessages"
  | "attendedConversations";
export type AttendantSortKey =
  | "orders"
  | "pieces"
  | "customers"
  | "growth"
  | "portfolio"
  | "recurrence"
  | "activeShare"
  | "reactivationRisk"
  | "name";

export interface AttendantTrendSeries {
  attendant: string;
  dataKey: string;
  color: string;
}

export type AttendantTrendChartRow = {
  month: string;
} & Record<string, number | string>;

const trendColors = ["#e83e8c", "#7656d6", "#d94848", "#55c98b", "#365fc7"];
const fixedAttendantColors: Record<string, string> = {
  suelen: "#e83e8c",
  thais: "#7656d6",
  amanda: "#d94848",
  tamires: "#55c98b",
};

function normalizeAttendantName(attendant: string) {
  return attendant.trim().toLocaleLowerCase("pt-BR");
}

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

export function chartMetricLabel(metric: AttendantChartMetric) {
  if (metric === "orders") {
    return "Vendas";
  }

  if (metric === "pieces") {
    return "Telas vendidas";
  }

  if (metric === "uniqueCustomers") {
    return "Clientes compradores";
  }

  if (metric === "newCustomers") {
    return "Clientes novos";
  }

  if (metric === "recoveredCustomers") {
    return "Clientes recuperados";
  }

  if (metric === "lostCustomers") {
    return "Clientes perdidos";
  }

  if (metric === "sentMessages") {
    return "Mensagens enviadas";
  }

  if (metric === "attendedConversations") {
    return "Clientes atendidos";
  }

  return "Faturamento";
}

export function getCurrentMetricValue(item: AttendantListItem, metric: AttendantChartMetric) {
  if (metric === "orders") {
    return item.currentPeriod.orders;
  }

  if (metric === "pieces") {
    return item.currentPeriod.pieces;
  }

  if (metric === "uniqueCustomers") {
    return item.currentPeriod.uniqueCustomers;
  }

  if (metric === "newCustomers") {
    return item.currentNewCustomers;
  }

  if (metric === "recoveredCustomers") {
    return item.currentRecoveredCustomers;
  }

  if (metric === "lostCustomers") {
    return item.currentLostCustomers;
  }

  if (metric === "sentMessages") {
    return item.currentActivity.sentMessages;
  }

  if (metric === "attendedConversations") {
    return item.currentActivity.attendedConversations;
  }

  return item.currentPeriod.revenue;
}

export function getAttendantColor(attendant: string) {
  const fixedColor = fixedAttendantColors[normalizeAttendantName(attendant)];
  if (fixedColor) {
    return fixedColor;
  }

  const hash = normalizeAttendantName(attendant)
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);

  return trendColors[hash % trendColors.length] ?? "#2956d7";
}

export function sortAttendantsForBoard(items: AttendantListItem[], sortKey: AttendantSortKey) {
  return [...items].sort((left, right) => {
    if (sortKey === "name") {
      return left.attendant.localeCompare(right.attendant, "pt-BR");
    }

    const leftValue =
      sortKey === "recurrence"
        ? safeDivide(left.currentPeriod.orders, left.currentPeriod.uniqueCustomers)
        : sortKey === "activeShare"
          ? safeDivide(left.portfolio.statusCounts.ACTIVE, left.portfolio.totalCustomers)
          : sortKey === "reactivationRisk"
            ? safeDivide(
                left.portfolio.statusCounts.ATTENTION + left.portfolio.statusCounts.INACTIVE,
                left.portfolio.totalCustomers,
              )
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

    const rightValue =
      sortKey === "recurrence"
        ? safeDivide(right.currentPeriod.orders, right.currentPeriod.uniqueCustomers)
        : sortKey === "activeShare"
          ? safeDivide(right.portfolio.statusCounts.ACTIVE, right.portfolio.totalCustomers)
          : sortKey === "reactivationRisk"
            ? safeDivide(
                right.portfolio.statusCounts.ATTENTION + right.portfolio.statusCounts.INACTIVE,
                right.portfolio.totalCustomers,
              )
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

export function getInitialSelectedAttendants(items: AttendantListItem[], maxSelections = 3) {
  return sortAttendantsForBoard(items, "customers")
    .slice(0, maxSelections)
    .map((item) => item.attendant);
}

export function toggleComparedAttendant(current: string[], attendant: string, maxSelections = 5) {
  if (current.includes(attendant)) {
    return current.filter((entry) => entry !== attendant);
  }

  if (current.length >= maxSelections) {
    return current;
  }

  return [...current, attendant];
}

export function buildAttendantLineKey(attendant: string) {
  return `attendant_${attendant.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}`;
}

export function buildTrendChartData(items: AttendantListItem[], selectedAttendants: string[], metric: AttendantChartMetric) {
  const selectedItems = selectedAttendants
    .map((attendant) => items.find((item) => item.attendant === attendant))
    .filter((item): item is AttendantListItem => Boolean(item));

  const monthOrder = new Set<string>();
  selectedItems.forEach((item) => {
    item.monthlyTrend.forEach((point) => {
      monthOrder.add(point.month);
    });
  });

  const data = Array.from(monthOrder).map((month) => ({ month } as AttendantTrendChartRow));
  const rowByMonth = new Map<string, AttendantTrendChartRow>(data.map((row) => [row.month, row]));

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
              : metric === "newCustomers"
                ? point.newCustomers
                : metric === "recoveredCustomers"
                  ? point.recoveredCustomers
                  : metric === "lostCustomers"
                    ? point.lostCustomers
                    : metric === "sentMessages"
                      ? point.sentMessages
                      : metric === "attendedConversations"
                        ? point.attendedConversations
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
    } satisfies AttendantTrendSeries;
  });

  return { data, series };
}

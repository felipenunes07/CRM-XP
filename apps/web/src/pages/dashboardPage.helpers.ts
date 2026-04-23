import type { TrendRangeSelection } from "@olist-crm/shared";

export function resolveTrendRangeSelection(
  anchorDate?: string | null,
  currentDate?: string | null,
): TrendRangeSelection | null {
  if (!anchorDate || !currentDate || anchorDate === currentDate) {
    return null;
  }

  return anchorDate <= currentDate
    ? { startDate: anchorDate, endDate: currentDate }
    : { startDate: currentDate, endDate: anchorDate };
}

export function isTrendRangeVisible(
  selection: TrendRangeSelection | null,
  availableDates: string[],
): boolean {
  if (!selection) {
    return false;
  }

  const dates = new Set(availableDates);
  return dates.has(selection.startDate) && dates.has(selection.endDate);
}

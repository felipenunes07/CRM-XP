export function resolveTrendRangeSelection(anchorDate, currentDate) {
    if (!anchorDate || !currentDate || anchorDate === currentDate) {
        return null;
    }
    return anchorDate <= currentDate
        ? { startDate: anchorDate, endDate: currentDate }
        : { startDate: currentDate, endDate: anchorDate };
}
export function isTrendRangeVisible(selection, availableDates) {
    if (!selection) {
        return false;
    }
    const dates = new Set(availableDates);
    return dates.has(selection.startDate) && dates.has(selection.endDate);
}

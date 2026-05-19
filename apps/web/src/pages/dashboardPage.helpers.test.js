import { describe, expect, it } from "vitest";
import { isTrendRangeVisible, resolveTrendRangeSelection } from "./dashboardPage.helpers";
describe("dashboardPage helpers", () => {
    it("creates an ordered range only when the drag covered more than one day", () => {
        expect(resolveTrendRangeSelection("2026-03-15", "2026-03-15")).toBeNull();
        expect(resolveTrendRangeSelection("2026-03-20", "2026-03-05")).toEqual({
            startDate: "2026-03-05",
            endDate: "2026-03-20",
        });
    });
    it("detects whether the selected range still exists inside the visible trend window", () => {
        expect(isTrendRangeVisible({ startDate: "2026-01-10", endDate: "2026-02-20" }, ["2026-01-10", "2026-01-11", "2026-02-20"])).toBe(true);
        expect(isTrendRangeVisible({ startDate: "2026-01-10", endDate: "2026-02-20" }, ["2026-02-20"])).toBe(false);
    });
});

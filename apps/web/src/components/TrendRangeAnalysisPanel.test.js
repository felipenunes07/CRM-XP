import { jsx as _jsx } from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TrendRangeAnalysisPanel } from "./TrendRangeAnalysisPanel";
vi.mock("../i18n", () => ({
    useUiLanguage: () => ({
        tx: (pt) => pt,
    }),
}));
describe("TrendRangeAnalysisPanel", () => {
    it("shows the empty recovered state when the cohort exists but everyone bought again", () => {
        const markup = renderToStaticMarkup(_jsx(MemoryRouter, { children: _jsx(TrendRangeAnalysisPanel, { isLoading: false, isError: false, onClearSelection: () => undefined, analysis: {
                    selection: {
                        startDate: "2026-01-10",
                        endDate: "2026-02-20",
                    },
                    summary: {
                        startDate: "2026-01-10",
                        endDate: "2026-02-20",
                        totalCustomers: 2,
                        attentionCustomers: 1,
                        inactiveCustomers: 1,
                        neverReturnedCustomers: 0,
                        averageTicket: 420,
                        estimatedMonthlyRevenueLoss: 0,
                        estimatedMonthlyPiecesLoss: 0,
                    },
                    lostCustomers: [],
                    recoveredSummary: {
                        recoveredCustomers: 2,
                        recoveredRevenue: 1300,
                        recoveredPieces: 14,
                    },
                    monthlyLossSeries: [],
                } }) }));
        expect(markup).toContain("Clientes que voltaram depois");
        expect(markup).toContain("Todos os clientes do recorte voltaram a comprar");
        expect(markup).toContain("2026");
    });
});

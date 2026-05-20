import { jsx as _jsx } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CustomerFinancialPageView } from "./CustomerFinancialPage";
const snapshot = {
    id: "snapshot-1",
    sourceFileName: "SALDO VENDAS - XP.xlsx",
    sourceFilePath: "/financeiro/SALDO VENDAS - XP.xlsx",
    sourceFileUpdatedAt: "2026-05-12T12:00:00.000Z",
    sourceFileSizeBytes: 2048,
    importedAt: "2026-05-13T10:00:00.000Z",
    totalRows: 2,
    matchedRows: 2,
    unmatchedRows: 0,
};
function buildCreditRow(overrides) {
    return {
        id: "row-1",
        customerId: "customer-1",
        customerCode: "CL475",
        customerDisplayName: "Fast Phone",
        sourceDisplayName: "Fast Phone",
        matched: true,
        balanceAmount: -6193.17,
        debtAmount: 6193.17,
        creditBalanceAmount: 0,
        creditLimit: 50000,
        availableCreditAmount: 43806.83,
        withinCreditLimit: true,
        operationalState: "OWES",
        riskLevel: "ATENCAO",
        observation: "Parcial falta R$ 6.193,17",
        lastOrderDate: "2026-02-27",
        lastPaymentDate: "2026-05-12",
        daysSinceLastOrder: 75,
        daysSinceLastPayment: 1,
        paymentTerm: 30,
        riskScore: 42,
        flags: ["Saldo em aberto"],
        hasOverCredit: false,
        hasOverduePayment: false,
        hasSeverelyOverduePayment: false,
        hasNoPayment: false,
        hasNoOrder: false,
        hasNegativeCredit: false,
        hasDebtWithoutCredit: false,
        ...overrides,
    };
}
const overview = {
    snapshot,
    summary: {
        totalLinkedCustomers: 2,
        totalUnmatchedRows: 0,
        totalDebtAmount: 6193.17,
        totalCreditBalanceAmount: 525.8,
        customersOwing: 1,
        customersWithCreditLimit: 2,
        customersWithUnusedCredit: 1,
        customersCritical: 0,
        customersAttention: 1,
        customersMonitoring: 0,
        customersOverCredit: 0,
        customersOverdue: 0,
    },
    linkedRows: [
        buildCreditRow({ customerId: "customer-1", customerCode: "CL475", customerDisplayName: "Fast Phone" }),
        buildCreditRow({
            id: "row-2",
            customerId: "customer-2",
            customerCode: "CL410",
            customerDisplayName: "Patrick Sos Celular",
            balanceAmount: 525.8,
            debtAmount: 0,
            creditBalanceAmount: 525.8,
            operationalState: "HAS_CREDIT_BALANCE",
            riskLevel: "OK",
            observation: "Saldo a favor",
        }),
    ],
    unmatchedRows: [],
};
const detail = {
    snapshot,
    row: overview.linkedRows[0],
    orders: [
        {
            id: "order-1",
            customerId: "customer-1",
            customerCode: "CL475",
            customerDisplayName: "Fast Phone",
            sourceDisplayName: "Fast Phone",
            orderNumber: "45670 2025/26533",
            orderDate: "2025-01-10",
            totalAmount: 31565,
            units: 555,
            seller: null,
            doc: null,
            status: "OK",
            lineCount: 1,
        },
    ],
    payments: [
        {
            id: "payment-1",
            customerId: "customer-1",
            customerCode: "CL475",
            customerDisplayName: "Fast Phone",
            sourceDisplayName: "Fast Phone",
            paymentNumber: "PAG-1",
            paymentDate: "2026-05-12",
            amount: 7217,
            paymentType: "TROCAS",
            observation: "Ultimo registro",
        },
    ],
};
describe("CustomerFinancialPageView", () => {
    it("renders a customer selector with the selected financial summary and ledger", () => {
        const markup = renderToStaticMarkup(_jsx(MemoryRouter, { children: _jsx(CustomerFinancialPageView, { overview: overview, detail: detail, selectedCustomerId: "customer-1", search: "", isOverviewLoading: false, isOverviewError: false, isDetailLoading: false, isDetailError: false, canRefreshCredit: true, isRefreshing: false, refreshError: false, onSearchChange: () => undefined, onSelectCustomer: () => undefined, onRefresh: () => undefined }) }));
        expect(markup).toContain("Financeiro por cliente");
        expect(markup).toContain("Fast Phone");
        expect(markup).toContain("Patrick Sos Celular");
        expect(markup).toContain("Saldo devedor");
        expect(markup).toContain("6.193,17");
        expect(markup).toContain("45670 2025/26533");
        expect(markup).toContain("Pagamentos");
        expect(markup).toContain("Trocas");
    });
});

import type { CustomerCreditDetailResponse, CustomerCreditOverviewResponse } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CustomerCreditExecutiveSummary } from "../components/CustomerCreditExecutiveSummary";
import { CustomerFinancialDetailPageView } from "./CustomerFinancialDetailPage";
import { CustomerFinancialPageView } from "./CustomerFinancialPage";

const overview: CustomerCreditOverviewResponse = {
  snapshot: {
    id: "snapshot-1",
    sourceFileName: "SALDO VENDAS - XP.xlsx",
    sourceFilePath: "/financeiro/SALDO VENDAS - XP.xlsx",
    sourceFileUpdatedAt: "2026-05-13T10:00:00.000Z",
    sourceFileSizeBytes: 1024,
    importedAt: "2026-05-13T10:00:00.000Z",
    totalRows: 2,
    matchedRows: 2,
    unmatchedRows: 0,
  },
  summary: {
    totalLinkedCustomers: 2,
    totalUnmatchedRows: 0,
    totalDebtAmount: 6193.17,
    totalCreditBalanceAmount: 0,
    customersOwing: 1,
    customersWithCreditLimit: 2,
    customersWithUnusedCredit: 1,
    customersCritical: 1,
    customersAttention: 0,
    customersMonitoring: 0,
    customersOverCredit: 0,
    customersOverdue: 1,
  },
  linkedRows: [
    {
      id: "credit-1",
      customerId: "customer-1",
      customerDisplayName: "Fast Phone",
      sourceDisplayName: "FAST PHONE",
      customerCode: "CL475",
      matched: true,
      balanceAmount: -6193.17,
      riskLevel: "CRITICO",
      operationalState: "OWES",
      debtAmount: 6193.17,
      creditBalanceAmount: 0,
      creditLimit: 50000,
      availableCreditAmount: 43806.83,
      withinCreditLimit: true,
      paymentTerm: 30,
      riskScore: 95,
      daysSinceLastPayment: 146,
      daysSinceLastOrder: 75,
      lastPaymentDate: "2026-05-12T00:00:00.000Z",
      lastOrderDate: "2026-02-27T00:00:00.000Z",
      observation: "Parcial falta R$ 6.193,17",
      flags: ["Saldo em aberto"],
      hasNoPayment: false,
      hasNoOrder: false,
      hasOverCredit: false,
      hasOverduePayment: true,
      hasSeverelyOverduePayment: true,
      hasNegativeCredit: false,
      hasDebtWithoutCredit: false,
    },
    {
      id: "credit-2",
      customerId: "customer-2",
      customerDisplayName: "Patrick Sos Celular",
      sourceDisplayName: "PATRICK SOS CELULAR",
      customerCode: "CL998",
      matched: true,
      balanceAmount: 0,
      riskLevel: "OK",
      operationalState: "UNUSED_CREDIT",
      debtAmount: 0,
      creditBalanceAmount: 0,
      creditLimit: 20000,
      availableCreditAmount: 20000,
      withinCreditLimit: true,
      paymentTerm: 30,
      riskScore: 0,
      daysSinceLastPayment: 10,
      daysSinceLastOrder: 12,
      lastPaymentDate: "2026-05-10T00:00:00.000Z",
      lastOrderDate: "2026-05-08T00:00:00.000Z",
      observation: "",
      flags: [],
      hasNoPayment: false,
      hasNoOrder: false,
      hasOverCredit: false,
      hasOverduePayment: false,
      hasSeverelyOverduePayment: false,
      hasNegativeCredit: false,
      hasDebtWithoutCredit: false,
    },
  ],
  unmatchedRows: [],
};

const executiveSummary = {
  linkedCount: 2,
  unmatchedCount: 0,
  debtAmount: 6193.17,
  debtCount: 1,
  overdueDebtAmount: 6193.17,
  overdueCount: 1,
  availableCreditAmount: 43806.83,
  unusedCreditCount: 1,
  excessAmount: 0,
  overCreditCount: 0,
  quickCounts: {
    to_charge: 1,
    overdue: 1,
    due_soon: 0,
    ontrack: 1,
    opportunity: 1,
  },
};

const detail: CustomerCreditDetailResponse = {
  row: overview.linkedRows[0]!,
  snapshot: overview.snapshot,
  orders: [
    {
      id: "ord-1",
      customerId: "customer-1",
      customerCode: "CL475",
      customerDisplayName: "Fast Phone",
      sourceDisplayName: "FAST PHONE",
      orderDate: "2025-01-10T00:00:00.000Z",
      orderNumber: "45670 2025/26533",
      units: 555,
      totalAmount: 31565,
      seller: "Suelen",
      doc: null,
      status: "OK",
      lineCount: 1,
    },
  ],
  payments: [
    {
      id: "pay-1",
      customerId: "customer-1",
      customerCode: "CL475",
      customerDisplayName: "Fast Phone",
      sourceDisplayName: "FAST PHONE",
      paymentDate: "2026-05-12T00:00:00.000Z",
      paymentNumber: "PAG-1",
      amount: 7217,
      paymentType: "Trocas",
      observation: "Ultimo registro",
    },
  ],
  totalOrders: 231,
  totalPayments: 7615,
};

describe("CustomerFinancialPageView", () => {
  it("renders the executive financial analysis before the operational portfolio", () => {
    const markup = renderToStaticMarkup(
      <CustomerCreditExecutiveSummary
        rows={overview.linkedRows}
        snapshot={overview.snapshot}
        linkedCount={executiveSummary.linkedCount}
        unmatchedCount={executiveSummary.unmatchedCount}
        quickFilter=""
        kpiFilter=""
        sort="urgency"
        quickCounts={executiveSummary.quickCounts}
        debtAmount={executiveSummary.debtAmount}
        debtCount={executiveSummary.debtCount}
        overdueDebtAmount={executiveSummary.overdueDebtAmount}
        overdueCount={executiveSummary.overdueCount}
        availableCreditAmount={executiveSummary.availableCreditAmount}
        unusedCreditCount={executiveSummary.unusedCreditCount}
        excessAmount={executiveSummary.excessAmount}
        overCreditCount={executiveSummary.overCreditCount}
        hasActiveFilters={false}
        canRefresh
        isRefreshing={false}
        refreshError={false}
        onQuickFilter={() => undefined}
        onKpiFilter={() => undefined}
        onSort={() => undefined}
        onClearFilters={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(markup).toContain("Posição da carteira");
    expect(markup).toContain("Vencido");
    expect(markup).toContain("Crédito disponível");
    expect(markup).toContain("Envelhecimento da dívida");
    expect(markup).toContain("Maiores saldos em aberto");
    expect(markup).toContain("Fast Phone");
  });

  it("renders a customer selector with the selected financial summary and ledger", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerFinancialPageView
          overview={overview}
          detail={detail}
          selectedCustomerId="customer-1"
          search=""
          isOverviewLoading={false}
          isOverviewError={false}
          isDetailLoading={false}
          isDetailError={false}
          canRefreshCredit
          isRefreshing={false}
          refreshError={false}
          onSearchChange={() => undefined}
          onSelectCustomer={() => undefined}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Financeiro por cliente");
    expect(markup).toContain("Exportar Excel");
    expect(markup).toContain("Exportar 2 cliente(s) do filtro atual");
    expect(markup).toContain("Fast Phone");
    expect(markup).toContain("Patrick Sos Celular");
    expect(markup).toContain("Saldo devedor");
    expect(markup).toContain("6.193,17");
    expect(markup).toContain("Pagamentos");
    expect(markup).toContain("Trocas");
  });

  it("renders a dedicated financial dossier with a return path and side-by-side ledgers", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/clientes/financeiro/customer-1"]}>
        <CustomerFinancialDetailPageView
          detail={detail}
          isLoading={false}
          isError={false}
          canLoadMore
          canEditSettings
          onUpdateSettings={async () => undefined}
          onLoadMore={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Fast Phone");
    expect(markup).toContain("Crédito e pagamentos");
    expect(markup).toContain("/clientes?view=creditPayment");
    expect(markup).toContain("Vencimento");
    expect(markup).toContain("Tempo médio para pagar");
    expect(markup).toContain("Pedidos");
    expect(markup).toContain("Pagamentos");
    expect(markup).toContain("Carregar mais movimentos");
  });
});

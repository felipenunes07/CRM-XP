import type { CustomerCreditDetailResponse, CustomerCreditOverviewResponse } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CustomerCreditExecutiveSummary } from "../components/CustomerCreditExecutiveSummary";
import { CustomerFinancialDetailPageView } from "./CustomerFinancialDetailPage";
import { CustomerFinancialPageView } from "./CustomerFinancialPage";

const overview: CustomerCreditOverviewResponse = {
  snapshot: {
    sourceFileName: "SALDO VENDAS - XP.xlsx",
    sourceFileUpdatedAt: "2026-05-13T10:00:00.000Z",
    importedAt: "2026-05-13T10:00:00.000Z",
    rowCount: 2,
  },
  totals: {
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
    },
  },
  linkedRows: [
    {
      id: "credit-1",
      customerId: "customer-1",
      customerDisplayName: "Fast Phone",
      sourceDisplayName: "FAST PHONE",
      customerCode: "CL475",
      riskLevel: "CRITICO",
      operationalState: "OWING",
      debtAmount: 6193.17,
      creditBalanceAmount: 0,
      creditLimit: 50000,
      availableCreditAmount: 43806.83,
      paymentTerm: 30,
      daysSinceLastPayment: 146,
      daysSinceLastOrder: 75,
      lastPaymentDate: "2026-05-12T00:00:00.000Z",
      lastOrderDate: "2026-02-27T00:00:00.000Z",
      observation: "Parcial falta R$ 6.193,17",
      flags: ["Saldo em aberto"],
      hasNoPayment: false,
      hasOverCredit: false,
    },
    {
      id: "credit-2",
      customerId: "customer-2",
      customerDisplayName: "Patrick Sos Celular",
      sourceDisplayName: "PATRICK SOS CELULAR",
      customerCode: "CL998",
      riskLevel: "CONTROLADO",
      operationalState: "UNUSED_CREDIT",
      debtAmount: 0,
      creditBalanceAmount: 0,
      creditLimit: 20000,
      availableCreditAmount: 20000,
      paymentTerm: 30,
      daysSinceLastPayment: 10,
      daysSinceLastOrder: 12,
      lastPaymentDate: "2026-05-10T00:00:00.000Z",
      lastOrderDate: "2026-05-08T00:00:00.000Z",
      observation: "",
      flags: [],
      hasNoPayment: false,
      hasOverCredit: false,
    },
  ],
  unmatchedRows: [],
};

const detail: CustomerCreditDetailResponse = {
  row: overview.linkedRows[0]!,
  snapshot: overview.snapshot,
  summary: {
    totalOrderAmount: 31565,
    orderCount: 231,
    totalPaymentAmount: 7217,
    paymentCount: 7615,
    daysSinceLastPayment: 146,
    daysSinceLastOrder: 75,
  },
  assessment: {
    overdueStatus: "severe_overdue",
    overdueDays: 116,
    estimatedDeadlineDate: "2026-03-29",
    suggestedAction: "Há saldo em aberto acima do prazo estimado. Priorize a cobrança.",
  },
  orders: [
    {
      id: "ord-1",
      orderDate: "2025-01-10T00:00:00.000Z",
      orderCode: "45670 2025/26533",
      unitCount: 555,
      totalAmount: 31565,
      status: "OK",
    },
  ],
  payments: [
    {
      id: "pay-1",
      paymentDate: "2026-05-12T00:00:00.000Z",
      paymentCode: "PAG-1",
      amount: 7217,
      paymentType: "Trocas",
      observation: "Ultimo registro",
    },
  ],
  settlementMatch: {
    matchedPairsCount: 0,
    averagePaymentDelayDays: null,
    onTimePaymentRatio: null,
  },
  pagination: {
    orders: {
      loaded: 1,
      total: 231,
      hasMore: true,
    },
    payments: {
      loaded: 1,
      total: 7615,
      hasMore: true,
    },
  },
};

describe("CustomerFinancialPageView", () => {
  it("renders the executive financial analysis before the operational portfolio", () => {
    const markup = renderToStaticMarkup(
      <CustomerCreditExecutiveSummary
        rows={overview.linkedRows}
        snapshot={overview.snapshot}
        linkedCount={overview.totals.linkedCount}
        unmatchedCount={overview.totals.unmatchedCount}
        quickFilter=""
        kpiFilter=""
        sort="urgency"
        quickCounts={overview.totals.quickCounts}
        debtAmount={overview.totals.debtAmount}
        debtCount={overview.totals.debtCount}
        overdueDebtAmount={overview.totals.overdueDebtAmount}
        overdueCount={overview.totals.overdueCount}
        availableCreditAmount={overview.totals.availableCreditAmount}
        unusedCreditCount={overview.totals.unusedCreditCount}
        excessAmount={overview.totals.excessAmount}
        overCreditCount={overview.totals.overCreditCount}
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

    expect(markup).toContain("Monitoramento de Crédito &amp; Risco");
    expect(markup).toContain("Centro de Monitoramento");
    expect(markup).toContain("Dívida Vencida");
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

    expect(markup).toContain("Dossiê financeiro");
    expect(markup).toContain("Crédito e pagamentos");
    expect(markup).toContain("/clientes?view=creditPayment");
    expect(markup).toContain("Data limite estimada");
    expect(markup).toContain("Tempo médio para pagar");
    expect(markup).toContain("Pedidos e pagamentos");
    expect(markup).toContain("Carregar mais movimentos");
  });
});

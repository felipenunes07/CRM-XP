import type { CustomerCreditRow } from "@olist-crm/shared";
import { describe, expect, it } from "vitest";
import { buildCustomerFinancialExportRows, CUSTOMER_FINANCIAL_EXPORT_HEADERS } from "./customerFinancialExport";

const row: CustomerCreditRow = {
  id: "credit-1",
  customerId: "customer-1",
  customerCode: "CL475",
  customerDisplayName: "Fast Phone",
  sourceDisplayName: "FAST PHONE",
  matched: true,
  balanceAmount: -6193.17,
  debtAmount: 6193.17,
  creditBalanceAmount: 0,
  creditLimit: 50000,
  availableCreditAmount: 43806.83,
  withinCreditLimit: true,
  operationalState: "OWES",
  riskLevel: "CRITICO",
  observation: "Parcial em aberto",
  lastOrderDate: "2026-02-27T00:00:00.000Z",
  lastPaymentDate: "2026-05-12T00:00:00.000Z",
  daysSinceLastOrder: 75,
  daysSinceLastPayment: 146,
  paymentTerm: 30,
  riskScore: 95,
  flags: ["Saldo em aberto"],
  hasOverCredit: false,
  hasOverduePayment: true,
  hasSeverelyOverduePayment: true,
  hasNoPayment: false,
  hasNoOrder: false,
  hasNegativeCredit: false,
  hasDebtWithoutCredit: false,
};

describe("customerFinancialExport", () => {
  it("builds an Excel row with the financial information displayed by the CRM", () => {
    const [exported] = buildCustomerFinancialExportRows([row]);

    expect(CUSTOMER_FINANCIAL_EXPORT_HEADERS).toHaveLength(18);
    expect(exported).toHaveLength(CUSTOMER_FINANCIAL_EXPORT_HEADERS.length);
    expect(exported).toEqual([
      "CL475",
      "Fast Phone",
      "FAST PHONE",
      "Dentro do credito",
      "Crítico",
      6193.17,
      0,
      50000,
      43806.83,
      6193.17 / 50000,
      "Sim",
      30,
      "27/02/2026",
      75,
      "12/05/2026",
      146,
      "Parcial em aberto",
      "Saldo em aberto",
    ]);
  });
});

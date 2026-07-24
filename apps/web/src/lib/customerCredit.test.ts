import type { CustomerCreditRow } from "@olist-crm/shared";
import { describe, expect, it } from "vitest";
import {
  customerCreditHeadlineLabel,
  customerCreditPrimaryLabel,
  customerCreditRiskClassName,
  customerCreditRiskLabel,
  customerCreditStateClassName,
  customerCreditStateLabel,
  customerCreditVisibleFlags,
  estimateCustomerPaymentBehavior,
  getCustomerCreditDeadline,
  isOverdueCreditRow,
} from "./customerCredit";

function buildRow(overrides: Partial<CustomerCreditRow> = {}): CustomerCreditRow {
  return {
    id: "1",
    customerId: "customer-1",
    customerCode: "CL001",
    customerDisplayName: "Loja 1",
    sourceDisplayName: "Loja 1",
    matched: true,
    balanceAmount: -120,
    debtAmount: 120,
    creditBalanceAmount: 0,
    creditLimit: 5000,
    availableCreditAmount: 4880,
    withinCreditLimit: true,
    operationalState: "OWES",
    riskLevel: "ATENCAO",
    observation: "",
    lastOrderDate: "2026-07-01",
    lastPaymentDate: "2026-06-20",
    daysSinceLastOrder: null,
    daysSinceLastPayment: null,
    paymentTerm: 15,
    riskScore: null,
    flags: [],
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

describe("customer credit helpers", () => {
  it("maps risk and state enums to readable labels and classes", () => {
    expect(customerCreditRiskLabel("CRITICO")).toBe("Crítico");
    expect(customerCreditRiskClassName("ATENCAO")).toBe("credit-badge-warning");
    expect(customerCreditStateLabel("UNUSED_CREDIT")).toBe("Crédito sem uso");
    expect(customerCreditStateClassName("OVER_CREDIT")).toBe("credit-badge-danger");
  });

  it("flags overdue rows when any overdue signal is present", () => {
    expect(
      isOverdueCreditRow({
        id: "1",
        customerId: "1",
        customerCode: "CL001",
        customerDisplayName: "Loja 1",
        sourceDisplayName: "Loja 1",
        matched: true,
        balanceAmount: -120,
        debtAmount: 120,
        creditBalanceAmount: 0,
        creditLimit: 5000,
        availableCreditAmount: 4880,
        withinCreditLimit: true,
        operationalState: "OWES",
        riskLevel: "ATENCAO",
        observation: "",
        lastOrderDate: null,
        lastPaymentDate: null,
        daysSinceLastOrder: null,
        daysSinceLastPayment: null,
        paymentTerm: null,
        riskScore: null,
        flags: [],
        hasOverCredit: false,
        hasOverduePayment: true,
        hasSeverelyOverduePayment: false,
        hasNoPayment: false,
        hasNoOrder: false,
        hasNegativeCredit: false,
        hasDebtWithoutCredit: false,
      }),
    ).toBe(true);
  });

  it("builds friendlier labels from the corrected debt semantics", () => {
    const withinLimitRow = {
      id: "2",
      customerId: "2",
      customerCode: "CL002",
      customerDisplayName: "Loja 2",
      sourceDisplayName: "Loja 2",
      matched: true,
      balanceAmount: -323063.4,
      debtAmount: 323063.4,
      creditBalanceAmount: 0,
      creditLimit: 500000,
      availableCreditAmount: 176936.6,
      withinCreditLimit: true,
      operationalState: "OWES" as const,
      riskLevel: "CRITICO" as const,
      observation: "Pagamento Muito Vencido",
      lastOrderDate: null,
      lastPaymentDate: null,
      daysSinceLastOrder: null,
      daysSinceLastPayment: null,
      paymentTerm: null,
      riskScore: null,
      flags: ["Ultrapassou Credito", "Pagamento Muito Vencido"],
      hasOverCredit: false,
      hasOverduePayment: false,
      hasSeverelyOverduePayment: true,
      hasNoPayment: false,
      hasNoOrder: false,
      hasNegativeCredit: false,
      hasDebtWithoutCredit: false,
    };

    expect(customerCreditPrimaryLabel(withinLimitRow)).toBe("Em aberto");
    expect(customerCreditHeadlineLabel(withinLimitRow)).toBe("Dentro do credito");
    expect(customerCreditVisibleFlags(withinLimitRow)).toEqual(["Pagamento Muito Vencido"]);
  });

  it("calculates the estimated deadline from the last order plus the spreadsheet term", () => {
    const row = buildRow();

    expect(getCustomerCreditDeadline(row, new Date("2026-07-10T12:00:00Z"))).toMatchObject({
      status: "due_soon",
      dueDate: "2026-07-16",
      daysRemaining: 6,
      overdueDays: 0,
    });

    expect(getCustomerCreditDeadline(row, new Date("2026-07-20T12:00:00Z"))).toMatchObject({
      status: "overdue",
      dueDate: "2026-07-16",
      overdueDays: 4,
    });
  });

  it("estimates how long the customer takes to pay from financial movements", () => {
    const behavior = estimateCustomerPaymentBehavior(
      [
        {
          id: "order-1",
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Loja 1",
          sourceDisplayName: "Loja 1",
          orderNumber: "100",
          orderDate: "2026-06-01",
          totalAmount: 1000,
          units: 10,
          seller: null,
          doc: null,
          status: "OK",
          lineCount: 1,
        },
        {
          id: "order-2",
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Loja 1",
          sourceDisplayName: "Loja 1",
          orderNumber: "101",
          orderDate: "2026-07-01",
          totalAmount: 500,
          units: 5,
          seller: null,
          doc: null,
          status: "OK",
          lineCount: 1,
        },
      ],
      [
        {
          id: "payment-1",
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Loja 1",
          sourceDisplayName: "Loja 1",
          paymentNumber: "P1",
          paymentDate: "2026-06-11",
          amount: 1000,
          paymentType: "TRF",
          observation: "",
        },
        {
          id: "payment-2",
          customerId: "customer-1",
          customerCode: "CL001",
          customerDisplayName: "Loja 1",
          sourceDisplayName: "Loja 1",
          paymentNumber: "P2",
          paymentDate: "2026-07-21",
          amount: 500,
          paymentType: "TRF",
          observation: "",
        },
      ],
      15,
    );

    expect(behavior).toEqual({
      averageDays: 15,
      sampleSize: 2,
      onTimeRate: 0.5,
    });
  });
});

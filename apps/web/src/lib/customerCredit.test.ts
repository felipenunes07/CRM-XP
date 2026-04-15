import { describe, expect, it } from "vitest";
import {
  customerCreditHeadlineLabel,
  customerCreditPrimaryLabel,
  customerCreditRiskClassName,
  customerCreditRiskLabel,
  customerCreditStateClassName,
  customerCreditStateLabel,
  customerCreditVisibleFlags,
  isOverdueCreditRow,
} from "./customerCredit";

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
});

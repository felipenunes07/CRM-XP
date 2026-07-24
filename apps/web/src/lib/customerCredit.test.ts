import type { CustomerCreditRow } from "@olist-crm/shared";
import { describe, expect, it } from "vitest";
import {
  computeOrderSettlements,
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


describe("computeOrderSettlements", () => {
  // Dados reais do cliente CL115 (Vitinho) no snapshot de 23/07/2026:
  // divida 196.772,00, prazo 20 dias. A planilha do financeiro marca
  // "PARCIAL FALTA R$ 1.570,00" no pedido 40243 — o teste trava esse resultado.
  const vitinho = [
    { id: "41489", orderDate: "2026-07-21", totalAmount: 26_297 },
    { id: "41267", orderDate: "2026-07-16", totalAmount: 47_210 },
    { id: "41191", orderDate: "2026-07-13", totalAmount: 19_340 },
    { id: "41052", orderDate: "2026-07-07", totalAmount: 1_550 },
    { id: "40919", orderDate: "2026-07-01", totalAmount: 20_871 },
    { id: "40883", orderDate: "2026-06-30", totalAmount: 29_792 },
    { id: "40579", orderDate: "2026-06-12", totalAmount: 14_240 },
    { id: "40561", orderDate: "2026-06-11", totalAmount: 3_080 },
    { id: "40436", orderDate: "2026-06-08", totalAmount: 32_822 },
    { id: "40243", orderDate: "2026-05-29", totalAmount: 23_019 },
    { id: "40106", orderDate: "2026-05-22", totalAmount: 12_692 },
    { id: "39942", orderDate: "2026-05-16", totalAmount: 1_200 },
  ];

  const today = new Date("2026-07-23T12:00:00Z");

  it("reproduz o status da planilha do financeiro", () => {
    const settlements = computeOrderSettlements(vitinho, 196_772, 20, today);

    expect(settlements.get("40243")?.label).toBe("PARCIAL FALTA R$ 1.570,00");
    expect(settlements.get("40243")?.kind).toBe("partial");

    // vencidos: data do pedido + 20 dias ja passou de 23/07
    expect(settlements.get("40436")?.label).toBe("VENCEU EM 28/06");
    expect(settlements.get("40561")?.label).toBe("VENCEU EM 01/07");
    expect(settlements.get("40579")?.label).toBe("VENCEU EM 02/07");
    expect(settlements.get("40883")?.label).toBe("VENCEU EM 20/07");
    expect(settlements.get("40919")?.label).toBe("VENCEU EM 21/07");

    // ainda dentro do prazo
    expect(settlements.get("41052")?.label).toBe("A VENCER 27/07");
    expect(settlements.get("41191")?.label).toBe("A VENCER 02/08");
    expect(settlements.get("41267")?.label).toBe("A VENCER 05/08");
    expect(settlements.get("41489")?.label).toBe("A VENCER 10/08");

    // tudo antes do parcial ja foi pago
    expect(settlements.get("40106")?.kind).toBe("paid");
    expect(settlements.get("39942")?.kind).toBe("paid");
  });

  it("a soma dos pedidos em aberto fecha com a divida", () => {
    const settlements = computeOrderSettlements(vitinho, 196_772, 20, today);
    const emAberto = vitinho.reduce((sum, order) => {
      const settlement = settlements.get(order.id)!;
      return settlement.kind === "paid" ? sum : sum + settlement.missingAmount;
    }, 0);

    expect(emAberto).toBeCloseTo(196_772, 2);
  });

  it("marca tudo como pago quando nao ha divida", () => {
    const settlements = computeOrderSettlements(vitinho, 0, 20, today);
    expect([...settlements.values()].every((item) => item.kind === "paid")).toBe(true);
  });

  it("cai em EM ABERTO quando o cliente nao tem prazo cadastrado", () => {
    const settlements = computeOrderSettlements(vitinho, 196_772, null, today);
    expect(settlements.get("40436")?.kind).toBe("unknown");
    expect(settlements.get("40436")?.label).toBe("EM ABERTO");
    // o parcial continua sendo calculado normalmente
    expect(settlements.get("40243")?.label).toBe("PARCIAL FALTA R$ 1.570,00");
  });
});

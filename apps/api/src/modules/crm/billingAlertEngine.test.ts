import { describe, expect, it } from "vitest";
import {
  allocatePaymentsFifo,
  buildBillingAlertReport,
  buildDailyReportMessages,
  buildNewAlertsMessages,
  classifyLimit,
  collectAlertKeys,
  splitIntoMessages,
  type BillingCustomerInput,
  type BillingOrderInput,
} from "./billingAlertEngine.js";

const TODAY = "2026-09-26";

function order(customerCode: string, orderNumber: string, orderDate: string | null, totalAmount: number): BillingOrderInput {
  return { customerCode, orderKey: `${customerCode}|${orderDate}|${orderNumber}`, orderNumber, orderDate, totalAmount };
}

function customer(overrides: Partial<BillingCustomerInput> & { customerCode: string }): BillingCustomerInput {
  return {
    customerId: null,
    displayName: overrides.customerCode,
    debtAmount: 0,
    creditLimit: null,
    internalCreditLimit: null,
    paymentTerm: null,
    status: null,
    ...overrides,
  };
}

describe("classifyLimit", () => {
  it("separa acima do credito (dentro do interno) de estourou os dois", () => {
    // Leomar: credito 300k, interno 500k.
    expect(classifyLimit(250_000, 300_000, 500_000).level).toBe("NEAR_LIMIT");
    expect(classifyLimit(400_000, 300_000, 500_000).level).toBe("OVER_CREDIT");
    expect(classifyLimit(600_768, 300_000, 500_000).level).toBe("OVER_LIMIT");
  });

  it("sem credito interno, passar do credito ja e estourar o limite", () => {
    expect(classifyLimit(460_801, 350_000, null).level).toBe("OVER_LIMIT");
    expect(classifyLimit(100_000, 350_000, null).level).toBe("OK");
  });

  it("usa o interno quando so ele existe e o maior quando o interno e menor", () => {
    expect(classifyLimit(160_000, null, 150_000).level).toBe("OVER_LIMIT");
    expect(classifyLimit(12_000, 15_000, 10_000).level).toBe("NEAR_LIMIT");
    expect(classifyLimit(16_000, 15_000, 10_000).level).toBe("OVER_LIMIT");
  });

  it("sem nenhum limite cadastrado nao classifica", () => {
    expect(classifyLimit(5_000, null, null)).toEqual({ level: "NO_LIMIT", usage: null });
    expect(classifyLimit(5_000, 0, 0).level).toBe("NO_LIMIT");
  });
});

describe("allocatePaymentsFifo", () => {
  it("prazo de 20 dias: pedido de 21 dias atras nao pago vence ha 1 dia", () => {
    const pending = allocatePaymentsFifo([order("CL010", "100", "2026-09-05", 40_000)], 0, 20, TODAY);
    expect(pending).toEqual([
      expect.objectContaining({ dueDate: "2026-09-25", daysOverdue: 1, overdue: true, pendingAmount: 40_000 }),
    ]);
  });

  it("pagamentos parciais (2 de 20k) quitam o pedido de 40k", () => {
    const pending = allocatePaymentsFifo([order("CL010", "100", "2026-09-05", 40_000)], 20_000 + 20_000, 20, TODAY);
    expect(pending).toEqual([]);
  });

  it("pagou menos: sobra valor parcial e continua cobrando, mesmo pouco", () => {
    const pending = allocatePaymentsFifo([order("CL010", "100", "2026-09-05", 40_000)], 39_990, 20, TODAY);
    expect(pending).toEqual([expect.objectContaining({ pendingAmount: 10, overdue: true })]);
  });

  it("ignora centavos de arredondamento", () => {
    expect(allocatePaymentsFifo([order("CL010", "100", "2026-09-05", 40_000)], 39_999.5, 20, TODAY)).toEqual([]);
  });

  it("pagamento abate sempre o pedido mais antigo primeiro", () => {
    const pending = allocatePaymentsFifo(
      [
        order("CL010", "300", "2026-09-20", 5_000),
        order("CL010", "100", "2026-08-01", 10_000),
        order("CL010", "200", "2026-09-01", 8_000),
      ],
      12_000,
      20,
      TODAY,
    );

    // 12k quita o de 10k (ago) e 2k do de 8k (set/01).
    expect(pending.map((entry) => [entry.orderNumber, entry.pendingAmount, entry.overdue])).toEqual([
      ["200", 6_000, true],
      ["300", 5_000, false],
    ]);
    expect(pending[0]?.daysOverdue).toBe(5);
    expect(pending[1]?.daysOverdue).toBe(-14);
  });

  it("estorno negativo no OUT vira credito para os demais pedidos", () => {
    const pending = allocatePaymentsFifo(
      [order("CL010", "100", "2026-08-01", 10_000), order("CL010", "101", "2026-08-02", -10_000)],
      0,
      20,
      TODAY,
    );
    expect(pending).toEqual([]);
  });

  it("sem prazo cadastrado lista o pendente mas nao marca vencido", () => {
    const pending = allocatePaymentsFifo([order("CL010", "100", "2026-01-01", 1_000)], 0, null, TODAY);
    expect(pending).toEqual([expect.objectContaining({ dueDate: null, overdue: false, daysOverdue: null })]);
  });
});

describe("buildBillingAlertReport", () => {
  const customers = [
    customer({ customerCode: "CL034", displayName: "Leomar", debtAmount: 600_768, creditLimit: 300_000, internalCreditLimit: 500_000, paymentTerm: 30 }),
    customer({ customerCode: "CL115", displayName: "Vitinho", debtAmount: 120_000, creditLimit: 100_000, internalCreditLimit: 150_000, paymentTerm: 30 }),
    customer({ customerCode: "CL200", displayName: "Em dia", debtAmount: 5_000, creditLimit: 50_000, paymentTerm: 20 }),
    customer({ customerCode: "CL300", displayName: "Sem prazo", debtAmount: 7_000 }),
    customer({ customerCode: "CL400", displayName: "Calote", debtAmount: 90_000, creditLimit: 10_000, status: "GOLPE" }),
    customer({ customerCode: "CL500", displayName: "Nao deve", debtAmount: 0, creditLimit: 10_000, paymentTerm: 10 }),
  ];
  const orders = [
    order("CL034", "1", "2026-07-01", 600_768),
    order("CL115", "2", "2026-09-20", 120_000),
    order("CL200", "3", "2026-08-01", 20_000),
    order("CL200", "4", "2026-09-20", 5_000),
    order("CL300", "5", "2026-03-01", 7_000),
    order("CL400", "6", "2025-01-01", 90_000),
  ];
  const payments = [{ customerCode: "CL200", amount: 20_000 }];

  const report = buildBillingAlertReport(customers, orders, payments, { today: TODAY });

  it("classifica cada cliente no grupo certo", () => {
    expect(report.overLimit.map((entry) => entry.customerCode)).toEqual(["CL034"]);
    expect(report.overCredit.map((entry) => entry.customerCode)).toEqual(["CL115"]);
    expect(report.overdue.map((entry) => entry.customerCode)).toEqual(["CL034"]);
    expect(report.missingPaymentTerm.map((entry) => entry.customerCode)).toEqual(["CL300"]);
    expect(report.ignored.map((entry) => entry.customerCode)).toEqual(["CL400"]);
    expect(report.customers.map((entry) => entry.customerCode)).not.toContain("CL500");
  });

  it("calcula quanto esta vencido e ha quantos dias", () => {
    const leomar = report.overdue[0]!;
    expect(leomar.overdueAmount).toBe(600_768);
    expect(leomar.oldestOverdueDays).toBe(57);
  });

  it("gera chaves estaveis por limite e por pedido vencido", () => {
    expect([...collectAlertKeys(report)].sort()).toEqual([
      "limit:CL034:OVER_LIMIT",
      "limit:CL115:OVER_CREDIT",
      "overdue:CL034:CL034|2026-07-01|1",
    ]);
  });

  it("monta o relatorio diario com todas as secoes", () => {
    const text = buildDailyReportMessages(report).join("\n\n");
    expect(text).toContain("Cobrança — 26/09/2026");
    expect(text).toContain("*CL034* Leomar — deve R$");
    expect(text).toContain("ESTOUROU O LIMITE");
    expect(text).toContain("ACIMA DO CRÉDITO");
    expect(text).toContain("PRAZO VENCIDO");
    expect(text).toContain("SEM PRAZO CADASTRADO");
    expect(text).not.toContain("Calote");
  });

  it("alerta na hora apenas o que e novo", () => {
    const messages = buildNewAlertsMessages(report, new Set(["limit:CL115:OVER_CREDIT"]));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Vitinho");
    expect(messages[0]).not.toContain("Leomar");
    expect(buildNewAlertsMessages(report, new Set())).toEqual([]);
  });
});

describe("splitIntoMessages", () => {
  it("quebra blocos grandes sem cortar linhas", () => {
    const lines = Array.from({ length: 50 }, (_, index) => `linha ${index} ${"x".repeat(80)}`);
    const messages = splitIntoMessages(["cabecalho", lines.join("\n")], 1000);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((message) => message.length <= 1000)).toBe(true);
    expect(messages.join("\n")).toContain("linha 49");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildBillingAlertReport,
  collectAlertKeys,
  type BillingCustomerInput,
  type BillingOrderInput,
} from "./billingAlertEngine.js";
import {
  buildDailyReportMessages,
  buildNewAlertsMessages,
  splitIntoMessages,
  type SellerPhoneDirectory,
} from "./billingAlertMessages.js";

const TODAY = "2026-09-26";

function order(customerCode: string, orderNumber: string, orderDate: string, totalAmount: number): BillingOrderInput {
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
    seller: null,
    ...overrides,
  };
}

const customers = [
  customer({ customerCode: "CL034", displayName: "Leomar", seller: "Suelen", debtAmount: 600_768, creditLimit: 300_000, internalCreditLimit: 500_000, paymentTerm: 30 }),
  customer({ customerCode: "CL115", displayName: "Vitinho", seller: "Thais", debtAmount: 120_000, creditLimit: 100_000, internalCreditLimit: 150_000, paymentTerm: 30 }),
  customer({ customerCode: "CL600", displayName: "Quase", seller: "Thais", debtAmount: 42_000, creditLimit: 50_000, paymentTerm: 20 }),
  customer({ customerCode: "CL700", displayName: "Atrasado", seller: "Iza", debtAmount: 3_000, creditLimit: 50_000, paymentTerm: 10 }),
  customer({ customerCode: "CL300", displayName: "Sem prazo", debtAmount: 7_000 }),
];
const orders = [
  order("CL034", "41000", "2026-07-01", 600_768),
  order("CL115", "42000", "2026-09-20", 120_000),
  order("CL600", "42100", "2026-09-25", 42_000),
  order("CL700", "42200", "2026-09-01", 3_000),
  order("CL300", "40000", "2026-03-01", 7_000),
];
const phones: SellerPhoneDirectory = new Map([
  ["suelen", "5511911111111"],
  ["thais", "5511922222222"],
]);

const report = buildBillingAlertReport(customers, orders, [], {
  today: TODAY,
  unmatchedEntries: [
    { source: "PAG", entryKey: "OEM382|1", customerCode: "OEM382", entryDate: "2026-07-30", amount: 60_000, reference: "TRF" },
  ],
});

describe("relatorio diario por vendedora", () => {
  const messages = buildDailyReportMessages(report, phones);
  const all = messages.map((message) => message.text).join("\n\n");

  it("comeca com o resumo e a legenda", () => {
    expect(messages[0]!.text).toContain("COBRANÇA DO DIA — 26/09/2026");
    expect(messages[0]!.text).toContain("Como ler");
    expect(messages[0]!.mentions).toEqual([]);
  });

  it("marca cada vendedora com @ so na mensagem dela", () => {
    const suelen = messages.find((message) => message.text.includes("*Suelen*"))!;
    expect(suelen.text).toContain("@5511911111111");
    expect(suelen.mentions).toEqual(["5511911111111"]);
    expect(suelen.text).toContain("Leomar");
    expect(suelen.text).not.toContain("Vitinho");

    const thais = messages.find((message) => message.text.includes("*Thais*"))!;
    expect(thais.mentions).toEqual(["5511922222222"]);
    expect(thais.text).toContain("Vitinho");
    expect(thais.text).toContain("Quase");
  });

  it("cada cliente vem com a situacao e o que fazer", () => {
    expect(all).toContain("*CL034 · Leomar*");
    expect(all).toContain("Deve R$ 600.768 · crédito R$ 300.000 / interno R$ 500.000");
    expect(all).toContain("🔴 Estourou o limite (200% do crédito)");
    expect(all).toContain("⏰ R$ 600.768 vencido — atrasado há 57 dias, venceu 31/07 (prazo 30 dias)");
    expect(all).toContain("👉 Cobrar R$ 600.768 vencido. Segurar novos pedidos até pagar.");
    expect(all).toContain("👉 Pedir pagamento de R$ 20.000 para voltar ao crédito.");
    expect(all).toContain("🟡 Perto do limite (84% do crédito) — cabe só mais R$ 8.000");
  });

  it("atraso de outro ano mostra o ano e cliente no teto diz que nao cabe mais", () => {
    const old = buildBillingAlertReport(
      [
        customer({ customerCode: "CL041", displayName: "Davi", seller: "Suelen", debtAmount: 4_396, creditLimit: 20_000, paymentTerm: 20 }),
        customer({ customerCode: "CL395", displayName: "Cabeca", seller: "Thais", debtAmount: 15_000, creditLimit: 15_000, paymentTerm: 15 }),
      ],
      [order("CL041", "28167", "2025-03-17", 4_396), order("CL395", "43000", "2026-09-20", 15_000)],
      [],
      { today: TODAY },
    );
    const text = buildDailyReportMessages(old, phones).map((message) => message.text).join("\n");
    expect(text).toContain("venceu 06/04/2025");
    expect(text).toContain("🟡 Já está no limite (100% do crédito) — não cabe mais pedido");
  });

  it("vendedora sem WhatsApp no CRM aparece pelo nome, sem marcar", () => {
    const iza = messages.find((message) => message.text.includes("*Iza*"))!;
    expect(iza.text).toContain("sem WhatsApp cadastrado");
    expect(iza.mentions).toEqual([]);
  });

  it("termina com o que e do financeiro", () => {
    const last = messages.at(-1)!;
    expect(last.text).toContain("Para o financeiro");
    expect(last.text).toContain("Sem prazo cadastrado");
    expect(last.text).toContain("*OEM382*");
  });
});

describe("aviso na hora", () => {
  it("pedido novo de cliente acima do credito marca a vendedora dele", () => {
    const withNewOrder = buildBillingAlertReport(
      customers.map((entry) => (entry.customerCode === "CL034" ? { ...entry, debtAmount: 612_768 } : entry)),
      [...orders, order("CL034", "43300", TODAY, 12_000)],
      [],
      { today: TODAY },
    );
    const previous = collectAlertKeys(report);
    const newKeys = new Set([...collectAlertKeys(withNewOrder)].filter((key) => !previous.has(key)));
    const messages = buildNewAlertsMessages(withNewOrder, newKeys, phones);

    expect(messages[0]!.text).toContain("Alerta de cobrança");
    const suelen = messages[1]!;
    expect(suelen.mentions).toEqual(["5511911111111"]);
    expect(suelen.text).toContain("Pedido novo lançado para cliente que já passou do crédito* — pedido 43300, R$ 12.000");
    expect(suelen.text).toContain("*CL034 · Leomar*");
    expect(suelen.text).toContain("👉 Cobrar");
    expect(messages).toHaveLength(2);
  });

  it("nada novo, nada enviado", () => {
    expect(buildNewAlertsMessages(report, new Set(), phones)).toEqual([]);
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

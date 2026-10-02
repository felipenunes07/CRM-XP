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

function order(customerCode: string, orderNumber: string, orderDate: string, totalAmount: number, seller: string | null = null): BillingOrderInput {
  return { customerCode, orderKey: `${customerCode}|${orderDate}|${orderNumber}`, orderNumber, orderDate, totalAmount, seller };
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

describe("relatorio diario por vendedora (curto)", () => {
  const messages = buildDailyReportMessages(report, phones);

  it("comeca com um resumo curto e aponta para o CRM", () => {
    const header = messages[0]!.text;
    expect(header).toContain("COBRANÇA DO DIA — 26/09/2026");
    expect(header).toContain("🔴 Estourou o limite: 1 · 🟠 Passou do crédito: 1");
    expect(header).toContain("Lista completa e filtros: CRM › Financeiro › Quem cobrar hoje");
    expect(header.split("\n").length).toBeLessThanOrEqual(8);
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

  it("cada cliente urgente vira uma linha so", () => {
    const suelen = messages.find((message) => message.text.includes("*Suelen*"))!;
    expect(suelen.text).toContain("1. 🔴⏰ *CL034* Leomar — deve R$ 600.768 (200%) · vencido R$ 600.768 há 57d · venda 01/07");
    const thais = messages.find((message) => message.text.includes("*Thais*"))!;
    expect(thais.text).toContain("🟠 *CL115* Vitinho — deve R$ 120.000 (120%)");
    expect(thais.text).toContain("🟡 *CL600* Quase — deve R$ 42.000 (84%)");
  });

  it("mostra so os 10 mais urgentes e manda o resto para o CRM", () => {
    const many = buildBillingAlertReport(
      Array.from({ length: 14 }, (_, index) =>
        customer({ customerCode: `CL${100 + index}`, seller: "Thais", debtAmount: 20_000 + index, creditLimit: 10_000, paymentTerm: 20 }),
      ),
      [],
      [],
      { today: TODAY },
    );
    const thais = buildDailyReportMessages(many, phones).find((message) => message.text.includes("*Thais*"))!;
    expect(thais.text).toContain("10. ");
    expect(thais.text).not.toContain("11. ");
    expect(thais.text).toContain("…e mais 4 no CRM");
  });

  it("sem credito: so o total e quem vendeu sem credito nos ultimos 7 dias", () => {
    const withNoCredit = buildBillingAlertReport(
      [
        customer({ customerCode: "CL900", displayName: "Antigo", seller: "Thais", debtAmount: 37 }),
        customer({ customerCode: "KH76", displayName: "Ln129", seller: "Thais", debtAmount: 45_171 }),
        customer({ customerCode: "CL901", displayName: "Recente", seller: "Thais", debtAmount: 999 }),
      ],
      [order("KH76", "40500", "2026-05-14", 45_171, "Thais"), order("CL901", "43400", "2026-09-24", 999, "Thais")],
      [],
      { today: TODAY },
    );
    const msgs = buildDailyReportMessages(withNoCredit, phones);
    expect(msgs[0]!.text).toContain("⚪ Sem crédito: 3 clientes · R$ 46.207");
    const thais = msgs.find((message) => message.text.includes("*Thais*"))!;
    expect(thais.text).toContain("⚪ *Sem crédito:* 3 clientes · R$ 46.207");
    expect(thais.text).toContain("🛒 Venderam sem crédito nos últimos 7 dias:\n• *CL901* Recente — deve R$ 999 · venda 24/09 R$ 999");
    // Divida antiga sem venda recente nao entra na mensagem (fica no CRM).
    expect(thais.text).not.toContain("KH76");
    expect(thais.text).not.toContain("CL900");
  });

  it("vendedora sem WhatsApp no CRM vai num resumo unico para o financeiro", () => {
    expect(messages.find((message) => message.text.startsWith("👤 *Iza*"))).toBeUndefined();
    const finance = messages.at(-1)!;
    expect(finance.mentions).toEqual([]);
    expect(finance.text).toContain("Para o financeiro");
    expect(finance.text).toContain("• *Iza* — 1 cliente");
    expect(finance.text).toContain("⏰ *CL700* Atrasado");
    expect(finance.text).toContain("• *Sem vendedora definida* — 1 cliente");
  });

  it("termina com o que e do financeiro", () => {
    const last = messages.at(-1)!;
    expect(last.text).toContain("Sem prazo cadastrado");
    expect(last.text).toContain("*OEM382*");
  });

  it("atraso de outro ano mostra o ano na data da venda", () => {
    const old = buildBillingAlertReport(
      [customer({ customerCode: "CL041", displayName: "Davi", seller: "Suelen", debtAmount: 4_396, creditLimit: 20_000, paymentTerm: 20 })],
      [order("CL041", "28167", "2025-03-17", 4_396)],
      [],
      { today: TODAY },
    );
    const text = buildDailyReportMessages(old, phones).map((message) => message.text).join("\n");
    expect(text).toContain("venda 17/03/2025");
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

  it("pedido novo de cliente sem credito avisa na hora", () => {
    const before = buildBillingAlertReport(
      [customer({ customerCode: "KH76", displayName: "Ln129", seller: "Thais", debtAmount: 45_171 })],
      [order("KH76", "40500", "2026-05-14", 45_171)],
      [],
      { today: TODAY },
    );
    const after = buildBillingAlertReport(
      [customer({ customerCode: "KH76", displayName: "Ln129", seller: "Thais", debtAmount: 50_171 })],
      [order("KH76", "40500", "2026-05-14", 45_171), order("KH76", "43500", TODAY, 5_000)],
      [],
      { today: TODAY },
    );
    const previous = collectAlertKeys(before);
    const newKeys = new Set([...collectAlertKeys(after)].filter((key) => !previous.has(key)));
    const text = buildNewAlertsMessages(after, newKeys, phones).map((message) => message.text).join("\n");
    expect(text).toContain("🛒 *Pedido novo lançado para cliente sem crédito liberado* — pedido 43500, R$ 5.000");
    expect(text).toContain("@5511922222222");
  });

  it("nada novo, nada enviado", () => {
    expect(buildNewAlertsMessages(report, new Set(), phones)).toEqual([]);
  });
});

describe("ultima venda e quem liberou", () => {
  it("guarda a ultima venda e mostra a data na linha do cliente", () => {
    const report = buildBillingAlertReport(
      [customer({ customerCode: "CL034", displayName: "Leomar", seller: "Suelen", debtAmount: 612_768, creditLimit: 300_000, internalCreditLimit: 500_000, paymentTerm: 30 })],
      [order("CL034", "41000", "2026-07-01", 600_768, "Suelen"), order("CL034", "43300", "2026-09-25", 12_000, "Thais")],
      [],
      { today: TODAY },
    );
    expect(report.overLimit[0]?.lastSale).toEqual({ orderNumber: "43300", orderDate: "2026-09-25", totalAmount: 12_000, seller: "Thais" });
    const text = buildDailyReportMessages(report, phones).map((message) => message.text).join("\n");
    expect(text).toContain("🔴⏰ *CL034* Leomar — deve R$ 612.768 (204%) · vencido R$ 600.768 há 57d · venda 25/09");
  });

  it("aviso de pedido novo diz quem vendeu", () => {
    const before = buildBillingAlertReport(
      [customer({ customerCode: "KH76", displayName: "Ln129", seller: "Thais", debtAmount: 45_171 })],
      [order("KH76", "40500", "2026-05-14", 45_171, "Thais")],
      [],
      { today: TODAY },
    );
    const after = buildBillingAlertReport(
      [customer({ customerCode: "KH76", displayName: "Ln129", seller: "Thais", debtAmount: 50_171 })],
      [order("KH76", "40500", "2026-05-14", 45_171, "Thais"), order("KH76", "43500", TODAY, 5_000, "Amanda")],
      [],
      { today: TODAY },
    );
    const previous = collectAlertKeys(before);
    const newKeys = new Set([...collectAlertKeys(after)].filter((key) => !previous.has(key)));
    const text = buildNewAlertsMessages(after, newKeys, phones).map((message) => message.text).join("\n");
    expect(text).toContain("pedido 43500, R$ 5.000, vendido por *Amanda*");
  });

  it("linha de historico (Resumo) nao conta como vendedora", () => {
    const report = buildBillingAlertReport(
      [customer({ customerCode: "CL900", debtAmount: 500 })],
      [order("CL900", "0", "2026-01-01", 500, "Resumo")],
      [],
      { today: TODAY },
    );
    expect(report.noCredit[0]?.lastSale?.seller).toBeNull();
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

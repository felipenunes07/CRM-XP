import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/client.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../../lib/env.js", () => ({ env: {} }));
vi.mock("../../lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./billingAlertService.js", () => ({ loadSellerPhoneDirectory: vi.fn() }));
vi.mock("./offboardingAlertService.js", () => ({ sendToGroup: vi.fn() }));

const { buildCreditChangeMessage, creditValuesFromRow, hasCreditChange } = await import("./creditChangeAlertService.js");

describe("aviso de alteracao de credito", () => {
  const base = {
    customerCode: "CL034",
    displayName: "Leomar",
    debtAmount: 600_768,
    seller: "Suelen",
    sellerPhone: "5511911111111",
    changedByName: "Isa",
    changedAt: new Date("2026-10-02T17:32:00Z"),
    timeZone: "America/Sao_Paulo",
  };

  it("mostra antes e depois, quem alterou e marca a vendedora", () => {
    const message = buildCreditChangeMessage({
      ...base,
      before: { creditLimit: 300_000, internalCreditLimit: 500_000, paymentTerm: 30 },
      after: { creditLimit: 400_000, internalCreditLimit: 500_000, paymentTerm: 45 },
    });

    expect(message.text).toBe(
      [
        "💳 *Crédito alterado no CRM*",
        "*CL034 · Leomar*",
        "👤 Vendedor(a): @5511911111111 *Suelen*",
        "",
        "Crédito: R$ 300.000 → *R$ 400.000*",
        "Crédito interno: R$ 500.000 (sem mudança)",
        "Prazo: 30 dias → *45 dias*",
        "",
        "Deve hoje: R$ 600.768 (150% do novo crédito)",
        "✏️ Alterado por Isa em 02/10 às 14:32",
      ].join("\n"),
    );
    expect(message.mentions).toEqual(["5511911111111"]);
  });

  it("liberar credito para quem nao tinha", () => {
    const message = buildCreditChangeMessage({
      ...base,
      customerCode: "KH76",
      displayName: "Ln129",
      debtAmount: 45_171,
      sellerPhone: null,
      before: { creditLimit: null, internalCreditLimit: null, paymentTerm: null },
      after: { creditLimit: 50_000, internalCreditLimit: null, paymentTerm: 20 },
    });
    expect(message.text).toContain("Crédito: sem crédito → *R$ 50.000*");
    expect(message.text).toContain("Prazo: sem prazo → *20 dias*");
    expect(message.text).toContain("👤 Vendedor(a): *Suelen*");
    expect(message.mentions).toEqual([]);
  });

  it("so avisa quando algum valor mudou de verdade", () => {
    const row = { creditLimit: 300_000, internalCreditLimit: 500_000, paymentTerm: 30 } as never;
    const same = creditValuesFromRow(row);
    expect(hasCreditChange(same, creditValuesFromRow(row))).toBe(false);
    expect(hasCreditChange(same, { ...same, internalCreditLimit: 600_000 })).toBe(true);
    // zero e o mesmo que sem credito
    expect(creditValuesFromRow({ creditLimit: 0, paymentTerm: null } as never)).toEqual({
      creditLimit: null,
      internalCreditLimit: null,
      paymentTerm: null,
    });
  });
});

import { describe, expect, it } from "vitest";
import { parseBrazilianAmount } from "./EditCustomerCreditModal";

describe("parseBrazilianAmount", () => {
  it("le valores digitados do jeito brasileiro", () => {
    expect(parseBrazilianAmount("300.000")).toBe(300_000);
    expect(parseBrazilianAmount("300000")).toBe(300_000);
    expect(parseBrazilianAmount("R$ 1.500.000,00")).toBe(1_500_000);
    expect(parseBrazilianAmount("1.500,50")).toBe(1_500.5);
    expect(parseBrazilianAmount("50000.5")).toBe(50_000.5);
  });

  it("vazio remove o credito e lixo e invalido", () => {
    expect(parseBrazilianAmount("")).toBeNull();
    expect(parseBrazilianAmount("   ")).toBeNull();
    expect(parseBrazilianAmount("1.2.3,4,5")).toBeUndefined();
  });
});

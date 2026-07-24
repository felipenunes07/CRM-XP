import { describe, expect, it } from "vitest";
import { paymentTypeLabel } from "./CustomerCreditLedgerTables";

// A situacao do pedido nao vem mais da planilha: e calculada em
// computeOrderSettlements (coberto por src/lib/customerCredit.test.ts).
describe("paymentTypeLabel", () => {
  it("traduz os tipos da planilha", () => {
    expect(paymentTypeLabel("TRF")).toBe("TRF");
    expect(paymentTypeLabel("TROCAS")).toBe("Trocas");
    expect(paymentTypeLabel("DINHEIRO")).toBe("Dinheiro");
    expect(paymentTypeLabel("CUPOM SITE")).toBe("Cupom");
    expect(paymentTypeLabel("")).toBe("-");
  });
});

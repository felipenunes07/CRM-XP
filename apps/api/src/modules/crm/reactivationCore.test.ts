import { describe, expect, it } from "vitest";
import { REACTIVATION_PHONE, REACTIVATION_STAGES, reactivationCustomerName, reactivationDispatchReason, reactivationEventKey, reactivationStage } from "./reactivationCore.js";

describe("regua Lili", () => {
  it.each([29, 30, 59, 60, 89, 90, 179, 180, 800])("seleciona somente uma faixa para %i dias", (days) => {
    const stages = REACTIVATION_STAGES.filter((stage) => days >= stage.days && (stage.maxDays === null || days <= stage.maxDays));
    expect(stages).toHaveLength(days < 30 ? 0 : 1);
    if (days >= 90) expect(stages[0]?.days).toBe(90);
  });
  it("mantem um novo ciclo apos recompra sem depender do UUID do pedido", () => {
    expect(reactivationEventKey(30, "2026-09-01")).not.toBe(reactivationEventKey(30, "2026-10-01"));
    expect(() => reactivationEventKey(30, "invalid")).toThrow();
  });
  it("retira o codigo do nome sem retirar o nome da empresa", () => {
    expect(reactivationCustomerName("CL123 - Alberto Trein Neto")).toBe("Alberto Trein Neto");
    expect(reactivationCustomerName(" KH42 — Paulo XP Display")).toBe("Paulo XP Display");
    expect(reactivationCustomerName("Jetcell")).toBe("Jetcell");
    expect(reactivationCustomerName("CL123 - ")).toBe("cliente");
  });
  it("rejeita alteracao das faixas da regua", () => {
    expect(() => reactivationStage({ minDaysInactive: 31, maxDaysInactive: 60 })).toThrow();
    expect(() => reactivationStage({ minDaysInactive: 90, maxDaysInactive: 179 })).toThrow();
  });
  const valid = { expectedPurchase: "2026-10-01", actualPurchase: "2026-10-01", daysInactive: 32,
    minDays: 30, maxDays: 59, jid: "120363000123@g.us", groupMatches: true, senderPhone: REACTIVATION_PHONE, senderReady: true };
  it("permite somente o grupo confirmado com a conta Lili", () => {
    expect(reactivationDispatchReason(valid)).toBeNull();
    expect(reactivationDispatchReason({ ...valid, jid: "5511999999999@s.whatsapp.net" })).toContain("Grupo");
    expect(reactivationDispatchReason({ ...valid, groupMatches: false })).toContain("Grupo");
    expect(reactivationDispatchReason({ ...valid, senderPhone: "5511000000000" })).toContain("Lili");
    expect(reactivationDispatchReason({ ...valid, senderReady: false })).toContain("Lili");
  });
  it("cancela se recomprou ou mudou de faixa enquanto aguardava envio", () => {
    expect(reactivationDispatchReason({ ...valid, actualPurchase: "2026-11-01", daysInactive: 1 })).toContain("recomprou");
    expect(reactivationDispatchReason({ ...valid, daysInactive: 60 })).toContain("faixa");
    expect(reactivationDispatchReason({ ...valid, actualPurchase: null })).toContain("recomprou");
  });
});

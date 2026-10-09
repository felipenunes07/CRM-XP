import { describe, expect, it } from "vitest";
import {
  buildOrderCreditAlertMessage,
  evaluateOrderCredit,
  isCommercialProposalStatus,
} from "./orderCreditAlertService.js";

describe("order credit proposal detection", () => {
  it("accepts the Olist proposal statuses and ignores released orders", () => {
    expect(isCommercialProposalStatus("Em aberto")).toBe(true);
    expect(isCommercialProposalStatus("Aberto")).toBe(true);
    expect(isCommercialProposalStatus("Proposta comercial")).toBe(true);
    expect(isCommercialProposalStatus("Orçamento")).toBe(true);
    expect(isCommercialProposalStatus("Preparando envio")).toBe(false);
    expect(isCommercialProposalStatus("Cancelado")).toBe(false);
  });

  it("treats a customer without approved credit as prepaid", () => {
    expect(
      evaluateOrderCredit({
        debtAmount: 0,
        creditLimit: null,
        internalCreditLimit: null,
        otherOpenProposals: 0,
        orderTotal: 15_000,
      }),
    ).toMatchObject({
      shouldAlert: true,
      effectiveLimit: 0,
      requiredPayment: 15_000,
    });
  });

  it("requires only the amount that exceeds the highest approved limit", () => {
    expect(
      evaluateOrderCredit({
        debtAmount: 450_000,
        creditLimit: 500_000,
        internalCreditLimit: null,
        otherOpenProposals: 0,
        orderTotal: 70_000,
      }),
    ).toEqual({
      shouldAlert: true,
      effectiveLimit: 500_000,
      availableBeforeOrder: 50_000,
      projectedExposure: 520_000,
      requiredPayment: 20_000,
    });
  });

  it("does not alert when the proposal still fits in the available credit", () => {
    expect(
      evaluateOrderCredit({
        debtAmount: 400_000,
        creditLimit: 500_000,
        internalCreditLimit: null,
        otherOpenProposals: 20_000,
        orderTotal: 70_000,
      }),
    ).toMatchObject({
      shouldAlert: false,
      availableBeforeOrder: 80_000,
      projectedExposure: 490_000,
      requiredPayment: 0,
    });
  });

  it("includes other open proposals and uses internal credit as the final limit", () => {
    expect(
      evaluateOrderCredit({
        debtAmount: 450_000,
        creditLimit: 500_000,
        internalCreditLimit: 600_000,
        otherOpenProposals: 100_000,
        orderTotal: 70_000,
      }),
    ).toMatchObject({
      shouldAlert: true,
      effectiveLimit: 600_000,
      projectedExposure: 620_000,
      requiredPayment: 20_000,
    });
  });

  it("builds an actionable WhatsApp warning", () => {
    const evaluation = evaluateOrderCredit({
      debtAmount: 450_000,
      creditLimit: 500_000,
      internalCreditLimit: null,
      otherOpenProposals: 0,
      orderTotal: 70_000,
    });
    const message = buildOrderCreditAlertMessage({
      order: {
        orderId: "918273",
        orderNumber: "43890",
        customerCode: "CL034",
        customerName: "Leomar",
        orderStatus: "Em aberto",
        orderTotal: 70_000,
        attendantName: "Suelen",
      },
      debtAmount: 450_000,
      otherOpenProposals: 0,
      evaluation,
      snapshotImportedAt: "2026-10-09T17:24:00-03:00",
      sellerPhone: "5511999999999",
    });

    expect(message).toContain("NÃO LIBERAR PEDIDO");
    expect(message).toContain("CL034 · Leomar");
    expect(message).toContain("R$ 20.000");
    expect(message).toContain("@5511999999999");
  });
});

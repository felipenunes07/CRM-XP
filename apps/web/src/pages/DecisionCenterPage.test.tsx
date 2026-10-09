import type { DecisionCenterResponse } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DecisionCenterPageView } from "./DecisionCenterPage";

const data: DecisionCenterResponse = {
  generatedAt: "2026-10-09T16:00:00.000Z",
  summary: {
    decisionsCount: 1,
    decisionsValue: 70_000,
    requiredPaymentTotal: 20_000,
    salesCount: 1,
    salesPotential: 15_000,
    recoveryCount: 1,
  },
  creditDecisions: [{
    orderId: "olist-1",
    orderNumber: "44001",
    orderStatus: "Proposta Comercial",
    orderTotal: 70_000,
    orderUpdatedAt: "2026-10-09T15:58:00.000Z",
    customerId: "customer-1",
    customerCode: "CL034",
    customerName: "Leomar",
    seller: "Suelen",
    debtAmount: 450_000,
    openProposalsAmount: 70_000,
    projectedExposure: 520_000,
    effectiveLimit: 500_000,
    requiredPayment: 20_000,
  }],
  salesOpportunities: [],
  recoveryOpportunities: [],
};

describe("DecisionCenterPageView", () => {
  it("shows the financial decision and the minimum payment needed", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DecisionCenterPageView data={data} refreshing={false} onRefresh={() => undefined} />
      </MemoryRouter>,
    );

    expect(html).toContain("O que precisa de decisão hoje");
    expect(html).toContain("CL034 · Leomar");
    expect(html).toContain("Pedido 44001");
    expect(html).toContain("R$ 20.000,00");
    expect(html).toContain("Ver financeiro");
  });
});

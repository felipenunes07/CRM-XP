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

    expect(html).toContain("Prioridades de hoje");
    expect(html).toContain("CL034 · Leomar");
    expect(html).toContain("Pedido 44001");
    expect(html).toContain("R$ 20.000,00");
    expect(html).toContain("Ver financeiro");
  });

  it("explains recovery urgency without exposing an abstract score", () => {
    const recoveryData: DecisionCenterResponse = {
      ...data,
      summary: { ...data.summary, decisionsCount: 0, decisionsValue: 0, requiredPaymentTotal: 0, recoveryCount: 1 },
      creditDecisions: [],
      recoveryOpportunities: [{
        customerId: "customer-2",
        customerCode: "CL55",
        customerName: "Naiara",
        status: "ATTENTION",
        lastPurchaseAt: "2026-07-20T12:00:00.000Z",
        daysSinceLastPurchase: 81,
        averageTicket: 37_904.61,
        totalSpent: 250_000,
        priorityScore: 70,
        seller: "Thais",
        suggestedAction: "Antecipar a próxima compra antes de perder o cliente",
      }],
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <DecisionCenterPageView data={recoveryData} refreshing={false} onRefresh={() => undefined} />
      </MemoryRouter>,
    );

    expect(html).toContain("Por que agir agora");
    expect(html).toContain("Há 81 dias sem comprar");
    expect(html).toContain("Urgência média");
    expect(html).not.toContain("Prioridade 70");
  });
});

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getCustomerDocInsightsMock } = vi.hoisted(() => ({
  getCustomerDocInsightsMock: vi.fn(),
}));

vi.mock("./modules/crm/customerService.js", async () => {
  const actual = await vi.importActual<typeof import("./modules/crm/customerService.js")>("./modules/crm/customerService.js");

  return {
    ...actual,
    getCustomerDocInsights: getCustomerDocInsightsMock,
  };
});

import { createApp } from "./app.js";

describe("GET /api/customer-insights/doc", () => {
  afterEach(() => {
    getCustomerDocInsightsMock.mockReset();
  });

  it("returns the DOC insights ranking and summary", async () => {
    getCustomerDocInsightsMock.mockResolvedValue({
      summary: {
        customersWithDoc: 3,
        docOrders: 8,
        docQuantity: 120,
        docRevenue: 5400.5,
      },
      ranking: [
        {
          id: "customer-1",
          customerCode: "CL542",
          displayName: "Vini Cell",
          status: "ACTIVE",
          docQuantity: 70,
          docOrderCount: 4,
          docRevenue: 3000.5,
          lastDocPurchaseAt: "2026-04-10",
        },
      ],
    });

    const response = await request(createApp()).get("/api/customer-insights/doc");

    expect(response.status).toBe(200);
    expect(response.body.summary.docQuantity).toBe(120);
    expect(response.body.ranking[0]?.customerCode).toBe("CL542");
    expect(getCustomerDocInsightsMock).toHaveBeenCalledWith();
  });
});

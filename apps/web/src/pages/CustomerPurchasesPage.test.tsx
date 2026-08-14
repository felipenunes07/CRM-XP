import type { CustomerDetail } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CustomerPurchasesContent } from "./CustomerPurchasesPage";

const customer: CustomerDetail = {
  id: "customer-1",
  customerCode: "C-001",
  displayName: "Loja Central",
  phone: "5511999999999",
  email: "compras@lojacentral.com.br",
  customerSince: "2024-03-10",
  lastPurchaseAt: "2026-08-01",
  daysSinceLastPurchase: 11,
  totalOrders: 18,
  totalSpent: 54000,
  avgTicket: 3000,
  status: "ACTIVE",
  priorityScore: 72,
  valueScore: 80,
  primaryInsight: "recorrente",
  insightTags: ["recorrente"],
  lastAttendant: "Amanda",
  labels: [],
  isAmbassador: false,
  ambassadorAssignedAt: null,
  avgDaysBetweenOrders: 25,
  state: "SP",
  city: "Campinas",
  purchaseFrequency90d: 3,
  frequencyDropRatio: 0,
  predictedNextPurchaseAt: "2026-08-26",
  internalNotes: "",
  monthlyTrend: [],
  topProducts: [
    {
      sku: "IP13-OLED",
      itemDescription: "Tela iPhone 13 OLED",
      totalQuantity: 48,
      orderCount: 8,
      lastBoughtAt: "2026-08-01",
    },
    {
      sku: "IP11-INCELL",
      itemDescription: "Tela iPhone 11 Incell",
      totalQuantity: 30,
      orderCount: 5,
      lastBoughtAt: "2026-07-10",
    },
  ],
  recentOrders: [
    {
      id: "order-1",
      orderNumber: "PED-1001",
      orderDate: "2026-08-01",
      sourceSystem: "olist_v2",
      totalAmount: 4200,
      status: "Faturado",
      itemCount: 1,
      totalQuantity: 12,
      items: [
        {
          id: "item-1",
          sku: "IP13-OLED",
          itemDescription: "Tela iPhone 13 OLED",
          quantity: 12,
          unitPrice: 350,
          lineTotal: 4200,
        },
      ],
    },
  ],
};

describe("CustomerPurchasesContent", () => {
  it("shows product preferences and orders on a dedicated customer route", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/clientes/customer-1/compras"]}>
        <CustomerPurchasesContent customer={customer} />
      </MemoryRouter>,
    );

    expect(markup).toContain("Compras do cliente");
    expect(markup).toContain("Histórico completo de pedidos");
    expect(markup).toContain("Tela iPhone 13 OLED");
    expect(markup).toContain("12 peças");
    expect(markup).toContain("PED-1001");
    expect(markup).toContain("Perfil e últimos pedidos");
    expect(markup).toContain('href="/clientes/customer-1"');
    expect(markup).toContain('href="/clientes/customer-1/compras"');
  });
});

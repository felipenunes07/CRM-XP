import type { CustomerDetail } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerRecentOrders } from "./CustomerRecentOrders";

const orders: CustomerDetail["recentOrders"] = [
  {
    id: "order-1",
    orderNumber: "PED-1001",
    orderDate: "2026-08-14",
    sourceSystem: "olist_v2",
    totalAmount: 4200,
    status: "Faturado",
    itemCount: 2,
    totalQuantity: 12,
    items: [
      {
        id: "item-1",
        sku: "IP13-OLED",
        itemDescription: "Tela iPhone 13 OLED",
        quantity: 10,
        unitPrice: 350,
        lineTotal: 3500,
      },
      {
        id: "item-2",
        sku: null,
        itemDescription: "Bateria iPhone 13",
        quantity: 2,
        unitPrice: 350,
        lineTotal: 700,
      },
    ],
  },
];

describe("CustomerRecentOrders", () => {
  it("shows the products, quantities and values without requiring another page", () => {
    const markup = renderToStaticMarkup(<CustomerRecentOrders orders={orders} />);

    expect(markup).toContain("Pedido PED-1001");
    expect(markup).toContain("Tela iPhone 13 OLED");
    expect(markup).toContain("SKU IP13-OLED");
    expect(markup).toContain("Bateria iPhone 13");
    expect(markup).toContain("10");
    expect(markup).toContain("R$ 350,00");
    expect(markup).toContain("R$ 4.200,00");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InventoryReplenishment } from "@olist-crm/shared";
import { PacklistIncomingCell, PacklistPurchaseCell } from "./PacklistSupply";

const projection: InventoryReplenishment = {
  leadTimeDays: 60, targetDays: 60, averageDailySales: 1, incomingUnits: 100, scheduledUnits: 0,
  overdueUnits: 50, incompleteUnits: 50, undatedUnits: 0, nextArrivalAt: null,
  stockoutAt: "2026-11-10", suggestedBuyUnits: 40, urgentAir: true,
  arrivals: [{ lotId: "LOT-1", quantity: 50, departureDate: "2026-08-01", arrivalDate: "2026-09-30", overdue: true, incomplete: false, inferredYear: true }],
};

describe("Packlist purchase display", () => {
  it("exposes late/incomplete quantities and shipment details instead of presenting them as guaranteed supply", () => {
    const html = renderToStaticMarkup(<PacklistIncomingCell value={projection} />);
    expect(html).toContain("0 un. previstas em 60 dias");
    expect(html).toContain("50 un. atrasadas");
    expect(html).toContain("cadastro incompleto");
    expect(html).toContain("LOT-1");
    expect(html).toContain("ano inferido");
  });
  it("shows suggested quantity, stockout and air urgency", () => {
    const html = renderToStaticMarkup(<PacklistPurchaseCell value={projection} />);
    expect(html).toContain("40 un.");
    expect(html).toContain("Avaliar envio aéreo");
    expect(html).toContain("Falta prevista");
  });
  it("distinguishes a missing import from sufficient coverage", () => {
    expect(renderToStaticMarkup(<PacklistPurchaseCell value={null} />)).toContain("Sem projeção");
    expect(renderToStaticMarkup(<PacklistIncomingCell value={null} />)).toContain("Sem leitura");
  });
});

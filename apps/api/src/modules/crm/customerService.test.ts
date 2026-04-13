import { describe, expect, it } from "vitest";
import type { CustomerDocInsightListItem } from "@olist-crm/shared";
import { sortCustomerDocInsights } from "./customerService.js";

function createInsight(
  displayName: string,
  docQuantity: number,
  docOrderCount: number,
  docRevenue: number,
): CustomerDocInsightListItem {
  return {
    id: displayName.toLowerCase().replace(/\s+/g, "-"),
    customerCode: displayName.slice(0, 3).toUpperCase(),
    displayName,
    status: "ACTIVE",
    docQuantity,
    docOrderCount,
    docRevenue,
    lastDocPurchaseAt: "2026-04-10",
  };
}

describe("sortCustomerDocInsights", () => {
  it("sorts by quantity, then orders, then revenue, then display name", () => {
    const ranking = sortCustomerDocInsights([
      createInsight("Zulu Cell", 120, 5, 1500),
      createInsight("Alpha Doc", 120, 5, 1800),
      createInsight("Beta Tela", 120, 6, 900),
      createInsight("Gama Store", 140, 2, 500),
    ]);

    expect(ranking.map((item) => item.displayName)).toEqual([
      "Gama Store",
      "Beta Tela",
      "Alpha Doc",
      "Zulu Cell",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { CustomerCreditRow, InventoryItem, TopProduct } from "@olist-crm/shared";
import {
  buildSuggestedOpportunityLines,
  isOpportunityEligibleCreditRow,
  matchTopProductToInventory,
} from "./opportunityService.js";

function createInventoryItem(input: Partial<InventoryItem> & Pick<InventoryItem, "id" | "snapshotId" | "sku" | "model">): InventoryItem {
  return {
    color: null,
    quality: null,
    price: 0,
    stockQuantity: 0,
    promotionLabel: null,
    isInStock: true,
    ...input,
  };
}

function createTopProduct(input: Partial<TopProduct> & Pick<TopProduct, "itemDescription">): TopProduct {
  return {
    sku: null,
    totalQuantity: 0,
    orderCount: 0,
    lastBoughtAt: null,
    ...input,
  };
}

function createCreditRow(input: Partial<CustomerCreditRow>): CustomerCreditRow {
  return {
    id: "row-1",
    customerId: "customer-1",
    customerCode: "CL001",
    customerDisplayName: "Cliente Teste",
    sourceDisplayName: "Cliente Teste",
    matched: true,
    balanceAmount: 0,
    debtAmount: 0,
    creditBalanceAmount: 0,
    creditLimit: 0,
    availableCreditAmount: 0,
    withinCreditLimit: true,
    operationalState: "SETTLED",
    riskLevel: "OK",
    observation: "",
    lastOrderDate: null,
    lastPaymentDate: null,
    daysSinceLastOrder: null,
    daysSinceLastPayment: null,
    paymentTerm: null,
    riskScore: null,
    flags: [],
    hasOverCredit: false,
    hasOverduePayment: false,
    hasSeverelyOverduePayment: false,
    hasNoPayment: false,
    hasNoOrder: false,
    hasNegativeCredit: false,
    hasDebtWithoutCredit: false,
    ...input,
  };
}

describe("matchTopProductToInventory", () => {
  it("prefers exact sku matches when they are in stock", () => {
    const topProduct = createTopProduct({
      sku: "1308-1",
      itemDescription: "SAMSUNG A05S",
      totalQuantity: 30,
      orderCount: 6,
    });

    const match = matchTopProductToInventory(topProduct, [
      createInventoryItem({
        id: "inventory-1",
        snapshotId: "snapshot-1",
        sku: "1308-1",
        model: "[DOC DE CARGA] SAMSUNG A05S PREMIER",
        price: 12,
        stockQuantity: 115,
      }),
      createInventoryItem({
        id: "inventory-2",
        snapshotId: "snapshot-1",
        sku: "9999-1",
        model: "[DOC DE CARGA] SAMSUNG A05 PREMIER",
        price: 11,
        stockQuantity: 90,
      }),
    ]);

    expect(match?.matchType).toBe("SKU");
    expect(match?.inventoryItem.id).toBe("inventory-1");
  });

  it("falls back to model matching without confusing A10 with A10S", () => {
    const topProduct = createTopProduct({
      itemDescription: "A10",
      totalQuantity: 18,
      orderCount: 4,
    });

    const match = matchTopProductToInventory(topProduct, [
      createInventoryItem({
        id: "inventory-a10s",
        snapshotId: "snapshot-1",
        sku: "1311-1",
        model: "[DOC DE CARGA] SAMSUNG A10S VERSAO M15 PREMIER",
        price: 10,
        stockQuantity: 330,
      }),
      createInventoryItem({
        id: "inventory-a10",
        snapshotId: "snapshot-1",
        sku: "0787-1",
        model: "[DOC DE CARGA] SAMSUNG A10 [DESTAQUE]",
        price: 10.5,
        stockQuantity: 28,
      }),
    ]);

    expect(match?.matchType).toBe("MODEL");
    expect(match?.inventoryItem.id).toBe("inventory-a10");
  });
});

describe("buildSuggestedOpportunityLines", () => {
  it("builds a suggestion without exceeding the target amount or stock", () => {
    const lines = buildSuggestedOpportunityLines(
      [
        {
          inventoryItemId: "line-1",
          matchType: "SKU",
          sku: "1308-1",
          model: "SAMSUNG A05S",
          color: null,
          quality: null,
          promotionLabel: null,
          unitPrice: 12,
          availableStock: 10,
          historicalTotalQuantity: 20,
          historicalOrderCount: 5,
          historicalLastBoughtAt: "2026-04-10",
          suggestedQuantity: 0,
          lineSubtotal: 0,
        },
        {
          inventoryItemId: "line-2",
          matchType: "MODEL",
          sku: "1315-1",
          model: "SAMSUNG A21S",
          color: null,
          quality: null,
          promotionLabel: null,
          unitPrice: 11,
          availableStock: 5,
          historicalTotalQuantity: 9,
          historicalOrderCount: 3,
          historicalLastBoughtAt: "2026-04-09",
          suggestedQuantity: 0,
          lineSubtotal: 0,
        },
      ],
      70,
    );

    const total = lines.reduce((sum, line) => sum + line.lineSubtotal, 0);

    expect(lines).toHaveLength(2);
    expect(total).toBeLessThanOrEqual(70);
    expect(lines.every((line) => line.suggestedQuantity <= line.availableStock)).toBe(true);
  });
});

describe("isOpportunityEligibleCreditRow", () => {
  it("accepts customers with saldo a favor or credit free and rejects cobrança cases", () => {
    expect(
      isOpportunityEligibleCreditRow(
        createCreditRow({
          creditBalanceAmount: 1153,
          availableCreditAmount: 0,
          operationalState: "HAS_CREDIT_BALANCE",
        }),
      ),
    ).toBe(true);

    expect(
      isOpportunityEligibleCreditRow(
        createCreditRow({
          creditBalanceAmount: 0,
          availableCreditAmount: 1800,
          operationalState: "UNUSED_CREDIT",
        }),
      ),
    ).toBe(true);

    expect(
      isOpportunityEligibleCreditRow(
        createCreditRow({
          debtAmount: 200,
          availableCreditAmount: 1800,
          operationalState: "OWES",
          hasOverduePayment: true,
        }),
      ),
    ).toBe(false);
  });
});

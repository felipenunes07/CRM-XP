import { describe, expect, it } from "vitest";
import { normalizeInventoryModel, parseInventoryCsv } from "./inventoryService.js";

describe("normalizeInventoryModel", () => {
  it("removes accents, brackets and extra punctuation", () => {
    expect(normalizeInventoryModel("[DOC DE CARGA] SAMSUNG A05S PREMIER")).toBe("samsung a05s premier");
    expect(normalizeInventoryModel("IPHONE 11 PRO [Com CI] PREMIER")).toBe("iphone 11 pro premier");
  });
});

describe("parseInventoryCsv", () => {
  it("parses sku, model, price and stock from the public sheet shape", () => {
    const rows = parseInventoryCsv([
      "SKU,MODELO,COR,QUALIDADE,VALOR,Estoque,Promoção",
      '1308-1,"[DOC DE CARGA] SAMSUNG A05S PREMIER","PRETO ","PREMIER",12,115,',
      '0815-1,"[DOC DE CARGA] SAMSUNG A52/A52 5G [DESTAQUE]","PRETO ","CONECTOR","51,5",79,OFERTA',
      ",,,,,,",
    ].join("\n"));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sku: "1308-1",
      model: "[DOC DE CARGA] SAMSUNG A05S PREMIER",
      color: "PRETO",
      quality: "PREMIER",
      price: 12,
      stockQuantity: 115,
      promotionLabel: null,
    });
    expect(rows[1]).toMatchObject({
      sku: "0815-1",
      price: 51.5,
      stockQuantity: 79,
      promotionLabel: "OFERTA",
    });
  });
});

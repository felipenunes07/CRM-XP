import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { collectFffPrices, parseFffProducts, parsePriceWorkbook } from "./supplierPriceSources.js";

describe("Fontes de preço", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("importa todas as abas e prioriza preço mínimo sem ler uma aba de instruções", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Instruções"]]), "Capa");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Produto", "Preço", "Preço mínimo"], ["FRONTAL A01", 50, "R$ 33,50"]]), "Samsung");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Produto", "Preço"], ["FRONTAL IPHONE 11", 80]]), "Apple");
    const items = parsePriceWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), "tabela.xlsx");
    expect(items.map((item) => item.price)).toEqual([33.5, 80]);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });
  it("converte centavos BRL, infere marca/categoria e preserva o código de produto", () => {
    const product = { id: 1, name: "A01 C/A", sku: "001", categories: [{ name: "SAMSUNG" }], prices: { price: "3800", currency_code: "BRL", currency_minor_unit: 2 } };
    expect(parseFffProducts([product])).toEqual([{ id: "1", name: "FRONTAL SAMSUNG A01 COM ARO", code: "001", price: 38 }]);
    expect(() => parseFffProducts([{ ...product, prices: { ...product.prices, currency_code: "USD" } }])).toThrow("BRL");
    expect(parseFffProducts([{ ...product, prices: { ...product.prices, price_range: { min: "100" } } }])).toEqual([]);
  });
  it("percorre todas as páginas e rejeita catálogos parciais", async () => {
    const product = { id: 1, name: "A01", sku: "1", categories: [{ name: "SAMSUNG" }], prices: { price: "3800", currency_code: "BRL", currency_minor_unit: 2 } };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([product]), { headers: { "x-wp-totalpages": "2" } })).mockResolvedValueOnce(new Response("offline", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(collectFffPrices()).rejects.toThrow("503");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

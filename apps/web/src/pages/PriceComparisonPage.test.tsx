import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx";
import { parseSheet, PriceComparisonPage } from "./PriceComparisonPage";
import { matchCatalog, partKind, type CatalogItem } from "./priceComparison.helpers";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ token: "test" }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { items: [] }, isLoading: false }) }));

function spreadsheet(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "UUF");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return { arrayBuffer: async () => buffer } as File;
}

describe("Importação UUF", () => {
  it("importa CSV UTF-8 com acentos", async () => {
    const file = { name: "precos.csv", arrayBuffer: async () => new TextEncoder().encode("Produto;Preço mínimo\nFRONTAL A01;33").buffer } as File;
    expect((await parseSheet(file))[0]).toMatchObject({ name: "FRONTAL A01", price: 33 });
  });
  it("mostra um botão real de importação e identifica a UUF antes de selecionar arquivo", () => {
    const html = renderToStaticMarkup(<PriceComparisonPage />);
    expect(html).toContain("Importar planilha");
    expect(html).toContain("Adicionar concorrente");
    expect(html).toContain('role="tab"');
    expect(html).not.toContain("Trocar planilha UUF");
    expect(html).toContain('type="file"');
  });

  it("localiza o cabeçalho após o título e prioriza o preço mínimo com moeda brasileira", async () => {
    const rows = await parseSheet(spreadsheet([
      ["Tabela UUF"], [], ["Produto", "Preço", "Preço mínimo"],
      ["Tela Samsung A10", 1500, "R$ 1.234,56"],
    ]));
    expect(rows).toEqual([{ id: "0-Tela Samsung A10", name: "Tela Samsung A10", code: "", price: 1234.56 }]);
  });

  it("preserva cabeçalhos chineses e preços numéricos", async () => {
    const rows = await parseSheet(spreadsheet([["编号", "商品名称", "售价"], ["ABC", "iPhone 11", 59.9]]));
    expect(rows[0]).toMatchObject({ code: "ABC", name: "iPhone 11", price: 59.9 });
  });

  it("recusa arquivo sem colunas identificáveis em vez de comparar colunas erradas", async () => {
    await expect(parseSheet(spreadsheet([["Coluna A", "Coluna B"], ["Tela", 59]]))).rejects.toThrow("cabeçalho");
  });
});

describe("Equivalência de peças", () => {
  const catalog: CatalogItem[] = [
    { sku: "screen", model: "SAMSUNG A01", quality: "PREMIER", price: 60, stockQuantity: 10 },
    { sku: "dock", model: "[DOC DE CARGA] SAMSUNG A01", quality: "PREMIER", price: 10, stockQuantity: 10 },
    { sku: "other-model", model: "SAMSUNG A01 CORE", quality: "PREMIER", price: 55, stockQuantity: 10 },
    { sku: "oled", model: "SAMSUNG A01", quality: "OLED", price: 80, stockQuantity: 10 },
  ];
  const item = (name: string) => ({ id: "1", code: "", name, price: 33 });

  it("nunca sugere dock para frontal nem frontal para doc", () => {
    expect(matchCatalog(item("FRONTAL A01 PREMIER"), catalog).candidates.map((xp) => xp.sku)).toEqual(["screen"]);
    for (const name of ["DOC A01 PREMIER", "DOC DE CARGA A01 PREMIER", "DOCK A01 PREMIER"]) {
      expect(matchCatalog(item(name), catalog).candidates.map((xp) => xp.sku)).toEqual(["dock"]);
    }
  });
  it("não mistura modelos ou qualidades e exige revisão quando a qualidade não foi informada", () => {
    expect(matchCatalog(item("FRONTAL A01"), catalog).automatic).toBeNull();
    expect(matchCatalog(item("FRONTAL A01 PREMIER"), catalog).automatic?.sku).toBe("screen");
    expect(matchCatalog(item("FRONTAL A01 OLED"), catalog).automatic?.sku).toBe("oled");
    expect(matchCatalog(item("FRONTAL A01 CORE PREMIER"), catalog).automatic?.sku).toBe("other-model");
    expect(matchCatalog(item("FRONTAL A01S PREMIER"), catalog).candidates).toHaveLength(0);
  });
  it("não deduz frontal para peças desconhecidas", () => {
    expect(partKind("TAMPA A01")).toBe("Outras peças");
    expect(matchCatalog(item("A01"), catalog).candidates).toHaveLength(0);
    expect(matchCatalog(item("BATERIA A01"), catalog).candidates).toHaveLength(0);
  });
});

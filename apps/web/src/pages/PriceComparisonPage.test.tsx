import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx";
import { parseSheet, PriceComparisonPage } from "./PriceComparisonPage";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ token: "test" }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { items: [] }, isLoading: false }) }));

function spreadsheet(rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "UUF");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return { arrayBuffer: async () => buffer } as File;
}

describe("Importação UUF", () => {
  it("mostra um botão real de importação e identifica a UUF antes de selecionar arquivo", () => {
    const html = renderToStaticMarkup(<PriceComparisonPage />);
    expect(html).toMatch(/<button[^>]*class="price-upload-button"[^>]*>/);
    expect(html).toContain("Importar planilha UUF");
    expect(html).toContain("Concorrente selecionado · UUF");
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

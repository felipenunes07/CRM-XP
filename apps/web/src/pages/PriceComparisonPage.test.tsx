import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx";
import { parseSheet, PriceComparisonPage, PriceComparisonRows } from "./PriceComparisonPage";
import { compareCatalogItem, comparisonNote, indexCatalog, matchCatalog, missingReason, modelKeys, partKind, qualityLabel, type CatalogItem } from "./priceComparison.helpers";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ token: "test" }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { items: [] }, isLoading: false }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

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
    expect(html).toContain('aria-label="Somente peças em estoque"');
    expect(html).toContain("checked");
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

  it("encontra A01 e A01 Core com aro quando o fornecedor não informa o aro", () => {
    const stock = [
      { sku: "0669-1", model: "SM-A01 BIG * COM ARO *", quality: "LCD", price: 40, stockQuantity: 430 },
      { sku: "0647-1", model: "SM-A01 CORE * COM ARO *", quality: "LCD", price: 41, stockQuantity: 184 },
    ];
    expect(matchCatalog(item("FRONTAL A01"), stock).candidates.map((xp) => xp.sku)).toEqual(["0669-1"]);
    expect(matchCatalog(item("FRONTAL A01 CORE"), stock).candidates.map((xp) => xp.sku)).toEqual(["0647-1"]);
    expect(matchCatalog(item("FRONTAL A01 SEM ARO"), stock).candidates).toEqual([]);
    expect(comparisonNote(item("FRONTAL A01"), stock[0]!)).toContain("Aro do fornecedor não informado");
  });

  it("distingue equivalente sem estoque de produto sem vínculo", () => {
    const stock = [{ sku: "01", model: "SM-A01", quality: "LCD", price: 40, stockQuantity: 0 }];
    const row = compareCatalogItem(item("FRONTAL A01"), indexCatalog(stock), indexCatalog(stock, false));
    expect(row.totalCandidates).toBe(1);
    expect(row.candidates).toEqual([]);
    expect(row.missingReason).toBe("out-of-stock");
    expect(compareCatalogItem(item("FRONTAL A01 CORE"), indexCatalog(stock), indexCatalog(stock, false)).totalCandidates).toBe(0);
  });

  it("lê LG, Zenfone, Moto One, 6S e 7G PLUS sem inventar modelos de números de qualidade", () => {
    expect(modelKeys("LG-K40S PREMIER")).toEqual(modelKeys("FRONTAL K40S"));
    expect(modelKeys("ZF-ZB634KL")).toEqual(modelKeys("FRONTAL ZENFONE ZB634KL"));
    expect(modelKeys("MT-ONE FUSION PLUS")).toEqual(modelKeys("FRONTAL MOTO ONE FUSION PLUS"));
    expect(modelKeys("IP-6S")).toEqual(["iphone6s"]);
    expect(modelKeys("FRONTAL IPHONE 7G PLUS")).toEqual(["iphone7 plus"]);
    expect(modelKeys("IP14PROMAX OLED SOFT 1:1 ORIGINAL")).toEqual(["iphone14 pro max"]);
    expect(modelKeys("IP-12/12 PRO")).toEqual(["iphone12", "iphone12 pro"]);
  });

  it("impede colisões entre Infinix Note 12, Redmi Note 12 e Nokia C21/Realme C21", () => {
    const stock = [
      { sku: "redmi", model: "MI-NOTE 12 4G/NOTE 12 5G", quality: "LCD", price: 40, stockQuantity: 4 },
      { sku: "nokia", model: "NOKIA C10/C20/C21", quality: "LCD", price: 40, stockQuantity: 4 },
    ];
    expect(matchCatalog(item("FRONTAL INFINIX NOTE 12"), stock).candidates).toEqual([]);
    expect(matchCatalog(item("FRONTAL REALME C21"), stock).candidates).toEqual([]);
    expect(matchCatalog(item("FRONTAL REDMI NOTE 12"), stock).candidates.map((xp) => xp.sku)).toEqual(["redmi"]);
  });

  it("nunca sugere dock para frontal nem frontal para doc", () => {
    expect(matchCatalog(item("FRONTAL A01 PREMIER"), catalog).candidates.map((xp) => xp.sku)).toEqual(["screen", "oled"]);
    for (const name of ["DOC A01 PREMIER", "DOC DE CARGA A01 PREMIER", "DOCK A01 PREMIER"]) {
      expect(matchCatalog(item(name), catalog).candidates.map((xp) => xp.sku)).toEqual(["dock"]);
    }
  });
  it("mostra outras qualidades automaticamente, prioriza a qualidade no nome e preserva o modelo", () => {
    expect(matchCatalog(item("FRONTAL A01"), catalog).candidates).toHaveLength(2);
    expect(matchCatalog(item("FRONTAL A01 PREMIER"), catalog).candidates[0]?.sku).toBe("screen");
    expect(matchCatalog(item("FRONTAL A01 OLED"), catalog).candidates[0]?.sku).toBe("oled");
    expect(matchCatalog(item("FRONTAL A01 CORE PREMIER"), catalog).candidates.map((xp) => xp.sku)).toEqual(["other-model"]);
    expect(matchCatalog(item("FRONTAL A01S PREMIER"), catalog).candidates).toHaveLength(0);
  });
  it("não deduz frontal para peças desconhecidas", () => {
    expect(partKind("TAMPA A01")).toBe("Outras peças");
    expect(matchCatalog(item("A01"), catalog).candidates).toHaveLength(0);
    expect(matchCatalog(item("BATERIA A01"), catalog).candidates).toHaveLength(0);
  });
});

describe("Comparação automática com múltiplas qualidades", () => {
  const catalog: CatalogItem[] = [
    { sku: "0542-1", model: "SM-A05 PREMIER MAX", quality: "PREMIER MAX", price: 43, stockQuantity: 1786 },
    { sku: "0590-1", model: "SM-A05 * COM ARO * PREMIER MAX", quality: "PREMIER MAX", price: 48, stockQuantity: 477 },
    { sku: "1162-1", model: "SM-A05S PREMIER MAX", quality: "PREMIER MAX", price: 45, stockQuantity: 1902 },
    { sku: "1307-1", model: "[DOC DE CARGA] SAMSUNG A05 PREMIER", quality: "PREMIER", price: 11, stockQuantity: 158 },
    { sku: "1173-1", model: "IP-13 FHD COF (TROCA CI)", quality: "LCD", price: 90, stockQuantity: 573 },
    { sku: "CX275-1", model: "[ De ] IP-13 FHD (TROCA CI) 120Hz", quality: "SOFT OLED", price: 213, stockQuantity: 859 },
    { sku: "1272-1", model: "IP-13 (TROCA CI) MAX [Borda Original]", quality: "SELECT MAX", price: 72, stockQuantity: 0 },
    { sku: "pro", model: "IP-13 PRO (TROCA CI)", quality: "OLED", price: 197, stockQuantity: 0 },
    { sku: "mini", model: "IP-13 MINI (TROCA CI)", quality: "LCD", price: 86, stockQuantity: 0 },
    { sku: "dock-ip", model: "[DOC DE CARGA] IPHONE 13", quality: "CONECTOR", price: 34.5, stockQuantity: 0 },
  ];
  const competitor = (name: string) => ({ id: "test", name, code: "DR-UP182", price: 132 });

  it("decodifica DR IPHONE 13 ORIGINAL e oferece as qualidades do IP-13 sem incluir PRO, MINI ou dock", () => {
    const result = matchCatalog(competitor("DR IPHONE 13 ORIGINAL"), indexCatalog(catalog));
    expect(result.kind).toBe("Frontal");
    expect(result.quality).toBe("ORIGINAL");
    expect(result.candidates.map((xp) => xp.sku)).toEqual(["1173-1", "CX275-1"]);
  });
  it("separa aro e linha de qualidade do modelo A05 e mantém A05S independente", () => {
    expect(matchCatalog(competitor("FRONTAL A05 SEM ARO"), catalog).candidates.map((xp) => xp.sku)).toEqual(["0542-1"]);
    expect(matchCatalog(competitor("FRONTAL A05 COM ARO VIVID"), catalog).candidates.map((xp) => xp.sku)).toEqual(["0590-1"]);
    expect(matchCatalog(competitor("DR A05S"), catalog).candidates.map((xp) => xp.sku)).toEqual(["1162-1"]);
  });
  it("trata BIG como nomenclatura interna, sem aproximar CORE, PRO ou MAX", () => {
    const variants = [
      { sku: "a01-big", model: "SM-A01 BIG COM ARO", quality: "PREMIER", price: 37, stockQuantity: 8 },
      { sku: "a03", model: "SM-A03 COM ARO", quality: "PREMIER", price: 40, stockQuantity: 8 },
      { sku: "a03-core", model: "SM-A03 CORE COM ARO", quality: "PREMIER", price: 41, stockQuantity: 8 },
      { sku: "ip13", model: "IP-13 COM ARO", quality: "PREMIER", price: 90, stockQuantity: 8 },
      { sku: "ip13-pro", model: "IP-13 PRO COM ARO", quality: "PREMIER", price: 100, stockQuantity: 8 },
      { sku: "ip13-pro-max", model: "IP-13 PRO MAX COM ARO", quality: "PREMIER", price: 110, stockQuantity: 8 },
    ];
    expect(matchCatalog(competitor("FRONTAL A01 COM ARO"), variants).candidates.map((xp) => xp.sku)).toEqual(["a01-big"]);
    expect(matchCatalog(competitor("FRONTAL A03 CORE COM ARO"), variants).candidates.map((xp) => xp.sku)).toEqual(["a03-core"]);
    expect(matchCatalog(competitor("DR IPHONE 13 PRO COM ARO"), variants).candidates.map((xp) => xp.sku)).toEqual(["ip13-pro"]);
    expect(matchCatalog(competitor("DR IPHONE 13 PRO MAX COM ARO"), variants).candidates.map((xp) => xp.sku)).toEqual(["ip13-pro-max"]);
  });
  it("encontra A24 com aro em estoque apesar da anotação de borda", () => {
    const catalog = [
      { sku: "0493-1", model: "SM-A24 * COM ARO *", quality: "LCD", price: 51, stockQuantity: 0 },
      { sku: "0322-1", model: "SM-A24 * COM ARO * [Borda Grossa]", quality: "OLED", price: 121, stockQuantity: 71 },
      { sku: "1666-1", model: "SM-A24/A25/M34/F34 PREMIER MAX", quality: "PREMIER MAX", price: 48, stockQuantity: 90 },
    ];
    expect(matchCatalog(competitor("FRONTAL A24 INCELL COM ARO VIVID"), catalog).candidates.map((xp) => xp.sku)).toEqual(["0322-1"]);
    expect(matchCatalog(competitor("FRONTAL A24 ORIGINAL DISPLAY GRANDE COM ARO"), catalog).candidates.map((xp) => xp.sku)).toEqual(["0322-1"]);
  });
  it("entende abreviação SAM e erros de descrição sem trocar o modelo", () => {
    const catalog = [
      { sku: "s21", model: "SM-S21 * COM ARO *", quality: "OLED", price: 90, stockQuantity: 4 },
      { sku: "s21-ultra", model: "SM-S21 ULTRA * COM ARO *", quality: "OLED", price: 120, stockQuantity: 4 },
      { sku: "a33", model: "SM-A33 * COM ARO * [Borda Fina]", quality: "OLED", price: 95, stockQuantity: 4 },
    ];
    expect(matchCatalog(competitor("FRONTAL SAM S21 INCELLL COM ARO"), catalog).candidates.map((xp) => xp.sku)).toEqual(["s21"]);
    expect(matchCatalog(competitor("FRONTAL A33 ORIGINAL DISPLAY GRANGE COM ARO VIVID"), catalog).candidates.map((xp) => xp.sku)).toEqual(["a33"]);
  });
  it("classifica os motivos sem equivalente conforme o catálogo", () => {
    const catalog = indexCatalog([
      { sku: "empty", model: "SM-A01", quality: "LCD", price: 30, stockQuantity: 0 },
      { sku: "frame", model: "SM-A02 COM ARO", quality: "LCD", price: 30, stockQuantity: 2 },
      { sku: "brand", model: "REALME A03", quality: "LCD", price: 30, stockQuantity: 2 },
    ], false);
    expect(missingReason(competitor("FRONTAL A01"), catalog)).toBe("out-of-stock");
    expect(missingReason(competitor("FRONTAL A02 SEM ARO"), catalog)).toBe("frame");
    expect(missingReason(competitor("FRONTAL SAMSUNG A03"), catalog)).toBe("brand");
    expect(missingReason(competitor("FRONTAL A04"), catalog)).toBe("model");
  });
  it("lê listas de compatibilidade e mantém 4G e 5G separados", () => {
    const generic = { sku: "a17-generic", model: "REALME C35/OPPO A17/A57/A77/A38/A58 5G COM ARO", quality: "PREMIER", price: 36.1, stockQuantity: 8 };
    const a17FourG = { sku: "a17-4g", model: "OPPO A17 4G COM ARO", quality: "PREMIER", price: 37, stockQuantity: 8 };
    const a17FiveG = { sku: "a17-5g", model: "OPPO A17 5G COM ARO", quality: "PREMIER", price: 38, stockQuantity: 8 };
    expect(matchCatalog(competitor("FRONTAL A17 4G COM ARO"), [generic, a17FourG, a17FiveG]).candidates.map((xp) => xp.sku)).toEqual(["a17-4g"]);
    expect(matchCatalog(competitor("FRONTAL A17 5G COM ARO"), [generic, a17FourG, a17FiveG]).candidates.map((xp) => xp.sku)).toEqual(["a17-5g"]);
    expect(matchCatalog(competitor("FRONTAL A17 4G/5G COM ARO"), [generic, a17FourG, a17FiveG]).candidates.map((xp) => xp.sku).sort()).toEqual(["a17-4g", "a17-5g"]);
    expect(matchCatalog(competitor("FRONTAL A17 5G COM ARO"), [a17FourG]).candidates).toHaveLength(0);
    expect(matchCatalog(competitor("FRONTAL A17 5G COM ARO"), [generic]).candidates.map((xp) => xp.sku)).toEqual(["a17-generic"]);
  });
  it("reconhece ORI e mantém a variante PRO MAX", () => {
    expect(qualityLabel("ORI")).toBe("ORIGINAL");
    const variants = [...catalog, { sku: "pm", model: "IP-13 PRO MAX MAX [Borda Original] 120Hz", quality: "SELECT MAX", price: 96, stockQuantity: 12 }];
    expect(matchCatalog(competitor("DR IPHONE 13 PRO MAX ORIGINAL"), variants).candidates.map((xp) => xp.sku)).toEqual(["pm"]);
  });
  it("lê qualificadores compostos que aparecem nos nomes da UUF", () => {
    expect(qualityLabel("FRONTAL IPHONE 13 ORIGINAL SOFT")).toBe("ORIGINAL SOFT");
    expect(qualityLabel("FRONTAL IPHONE 13 INCELL JK")).toBe("INCELL JK");
    expect(qualityLabel("FRONTAL IPHONE 13 ORIGINAL DD")).toBe("ORIGINAL DD");
    expect(qualityLabel("FRONTAL A05 ORIGINAL DISPLAY GRANDE COM ARO VIVID")).toBe("VIVID");
    const variants = [
      { sku: "lcd", model: "IP-13 LCD", quality: "LCD", price: 50, stockQuantity: 1 },
      { sku: "soft", model: "IP-13 SOFT OLED", quality: "SOFT OLED", price: 80, stockQuantity: 1 },
    ];
    expect(matchCatalog(competitor("FRONTAL IPHONE 13 ORIGINAL SOFT"), variants).candidates.map((xp) => xp.sku)).toEqual(["soft", "lcd"]);
  });
  it("compara modelos compatíveis listados com barra sem ampliar para modelos vizinhos", () => {
    expect(matchCatalog(competitor("DR A05/A05S SEM ARO"), catalog).candidates.map((xp) => xp.sku).sort()).toEqual(["0542-1", "1162-1"]);
  });
  it("renderiza todas as qualidades e diferenças diretamente, sem seletor de mapeamento", () => {
    const item = competitor("DR IPHONE 13 ORIGINAL");
    const match = matchCatalog(item, catalog);
    const html = renderToStaticMarkup(<table><tbody><PriceComparisonRows row={{ item, ...match, totalCandidates: match.candidates.length }} /></tbody></table>);
    expect(html).toContain("SOFT OLED");
    expect(html).not.toContain("SELECT MAX");
    expect(html).toContain("1173-1");
    expect(html).toContain("CX275-1");
    expect(html).not.toContain("Sem estoque");
    expect(html).toContain("Outra qualidade XP");
    expect(html).toContain('rowSpan="2"');
    expect(html.match(/class="comparison-money comparison-supplier-price"/g)).toHaveLength(2);
    expect(html).not.toContain("<select");
  });

  it("exclui estoque zero ou negativo mesmo quando a qualidade seria idêntica", () => {
    const result = matchCatalog(competitor("FRONTAL A05 SEM ARO PREMIER"), [
      ...catalog,
      { sku: "zero", model: "SM-A05 PREMIER", quality: "PREMIER", price: 10, stockQuantity: 0 },
      { sku: "negative", model: "SM-A05 PREMIER", quality: "PREMIER", price: 10, stockQuantity: -2 },
    ]);
    expect(result.candidates.map((xp) => xp.sku)).toEqual(["0542-1"]);
  });

  it("inclui peças sem estoque quando o filtro de estoque é desligado", () => {
    const variants = [...catalog, { sku: "zero", model: "SM-A05 PREMIER", quality: "PREMIER", price: 10, stockQuantity: 0 }];
    expect(matchCatalog(competitor("FRONTAL A05 SEM ARO PREMIER"), indexCatalog(variants, false)).candidates.map((xp) => xp.sku)).toEqual(["zero", "0542-1"]);
  });

  it("mostra a qualidade mais semelhante primeiro, acima de uma qualidade mais barata", () => {
    const variants = [...catalog, { sku: "same-grade", model: "SM-A05 PREMIER", quality: "PREMIER", price: 99, stockQuantity: 1 }];
    expect(matchCatalog(competitor("FRONTAL A05 SEM ARO PREMIER"), variants).candidates.map((xp) => xp.sku)).toEqual(["same-grade", "0542-1"]);
  });

  it("identifica com aro e sem aro e impede opções incompatíveis também na renderização", () => {
    const item = competitor("FRONTAL A05 COM ARO");
    const html = renderToStaticMarkup(<table><tbody><PriceComparisonRows row={{ item, kind: "Frontal", quality: null, candidates: catalog, totalCandidates: catalog.length }} /></tbody></table>);
    expect(html).toContain("0590-1");
    expect(html).toContain("Com aro");
    expect(html).not.toContain("0542-1");
    expect(html).not.toContain("1272-1");
  });
});

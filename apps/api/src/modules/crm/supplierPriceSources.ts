import * as XLSX from "xlsx";
import { parsePriceRows, type SupplierPriceItem } from "@olist-crm/shared";

const MAX_BYTES = 20 * 1024 * 1024;
export async function downloadPriceSource(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`Fonte indisponível (HTTP ${response.status}). Verifique se o link permite acesso público.`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Fonte maior que 20 MB.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("A fonte retornou uma resposta vazia.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Fonte maior que 20 MB."); }
    chunks.push(value);
  }
  return { response, bytes: Buffer.concat(chunks) };
}

export function parsePriceWorkbook(bytes: Buffer, fileName: string) {
  if (!/\.(xlsx|xls|csv)$/i.test(fileName)) throw new Error("Use um arquivo Excel (.xlsx, .xls) ou CSV.");
  const csv = /\.csv$/i.test(fileName);
  const workbook = XLSX.read(csv ? bytes.toString("utf8") : bytes, { type: csv ? "string" : "buffer", raw: true });
  const items = workbook.SheetNames.flatMap((name) => parsePriceRows(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, { header: 1, raw: true, defval: "" })).map((item) => ({ ...item, id: `${name}:${item.id}` })));
  if (!items.length) throw new Error("Não identifiquei produtos e preços válidos. Use cabeçalhos Produto e Preço (ou Preço mínimo).");
  if (items.length > 30_000) throw new Error("Limite de 30 mil produtos por tabela.");
  return items;
}

type FffProduct = { id: number; name: string; sku: string; categories: { name: string }[]; prices: { price: string; currency_code: string; currency_minor_unit: number; price_range?: unknown } };
export function parseFffProducts(products: FffProduct[]): SupplierPriceItem[] {
  return products.flatMap((product) => {
    if (product.prices.currency_code !== "BRL") throw new Error("A FFF retornou preço em moeda diferente de BRL.");
    const price = Number(product.prices.price) / 10 ** product.prices.currency_minor_unit;
    // Variable products expose only a price range: never compare its minimum as an exact offer.
    if (product.prices.price_range || !/[a-z]/i.test(product.name) || !(price > 0) || !Number.isFinite(price)) return [];
    const category = product.categories.map((value) => value.name).join(" ").toLowerCase();
    const kind = /bateria|battery/.test(category) ? "BATERIA" : /dock|carga|conector/.test(category) ? "DOCK DE CARGA" : /touch/.test(category) ? "TOUCH" : /samsung|motorola|motolora|xiaomi|redmi|iphone|infinix|hot|realmi|lg|asus|lcd/.test(category) ? "FRONTAL" : "";
    const brand = /samsung/.test(category) ? "SAMSUNG" : /motol?ora|motorola/.test(category) ? "MOTOROLA" : /xiaomi|redmi/.test(category) ? "XIAOMI" : /iphone/.test(category) ? "IPHONE" : /infinix|hot/.test(category) ? "INFINIX" : /realmi/.test(category) ? "REALME" : /asus/.test(category) ? "ASUS" : /\blg\b/.test(category) ? "LG" : "";
    const description = product.name.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&")
      .replace(/\bC\s*\/\s*A\b/gi, "COM ARO").replace(/\bS\s*\/\s*A\b/gi, "SEM ARO");
    const name = [kind, brand, description].filter(Boolean).join(" ");
    return [{ id: String(product.id), code: product.sku || String(product.id), name, price }];
  });
}

export async function collectFffPrices() {
  const products: FffProduct[] = [];
  let pages = 1;
  let totalBytes = 0;
  let expectedTotal = 0;
  for (let page = 1; page <= pages; page++) {
    const { response, bytes } = await downloadPriceSource(`https://fffpecas.com.br/wp-json/wc/store/v1/products?per_page=100&page=${page}&orderby=id&order=asc`);
    const totalPages = Number(response.headers.get("x-wp-totalpages"));
    if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 300) throw new Error("A paginação da FFF não pôde ser validada.");
    if (page === 1) { pages = totalPages; expectedTotal = Number(response.headers.get("x-wp-total")); }
    totalBytes += bytes.length;
    if (totalBytes > MAX_BYTES) throw new Error("Catálogo FFF maior que 20 MB.");
    if (totalPages !== pages) throw new Error("O catálogo FFF mudou durante a coleta. Tente novamente.");
    const batch: FffProduct[] = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(batch) || !batch.length) throw new Error("Página vazia na coleta FFF; histórico anterior preservado.");
    products.push(...batch);
  }
  if (expectedTotal > 0 && products.length !== expectedTotal) throw new Error("A FFF retornou um catálogo incompleto. Tente novamente.");
  if (new Set(products.map((product) => product.id)).size !== products.length) throw new Error("Produtos repetidos entre páginas FFF; tente novamente.");
  const items = parseFffProducts(products);
  if (!items.length) throw new Error("A FFF não retornou preços válidos.");
  return { items, fileName: "fff-catalogo.json", bytes: Buffer.from(JSON.stringify(products)), source: "site" };
}

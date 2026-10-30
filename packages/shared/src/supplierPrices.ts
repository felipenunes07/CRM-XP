export type SupplierPriceItem = { id: string; code: string; name: string; price: number };
export type PriceSupplier = {
  id: string; name: string; sourceUrl: string | null; sourceKind: "upload" | "fff" | "skytech" | "feihu"; autoSync: boolean;
  lastAttemptAt: string | null; lastSuccessAt: string | null; lastError: string | null;
  latestSnapshotId: string | null; latestCapturedAt: string | null; itemCount: number;
};
export type PriceSnapshotSummary = { id: string; supplierId: string; capturedAt: string; fileName: string; itemCount: number; source: string };
export type PriceSnapshot = PriceSnapshotSummary & { items: SupplierPriceItem[] };

export function parsePriceRows(rows: unknown[][]): SupplierPriceItem[] {
  const headers = rows.map((row) => row.map((cell) => String(cell).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()));
  const isName = (cell: string) => /produto|descricao|nome|name|modelos?|商品名称/.test(cell);
  const isPrice = (cell: string) => /preco|valor|price|售价/.test(cell);
  const headerIndex = headers.findIndex((row) => row.some(isName) && row.some(isPrice));
  const header = headers[headerIndex];
  if (!header) return [];
  const nameColumn = header.findIndex(isName);
  const minimum = header.findIndex((cell) => isPrice(cell) && /minim|minimum/.test(cell));
  const priceColumn = minimum >= 0 ? minimum : header.findIndex(isPrice);
  const codeColumn = header.findIndex((cell) => /codigo|sku|编号/.test(cell));
  return rows.slice(headerIndex + 1).flatMap((row, index) => {
    const raw = row[priceColumn];
    const text = String(raw ?? "").replace(/[^0-9,.-]/g, "");
    const price = typeof raw === "number" ? raw : Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
    const name = String(row[nameColumn] ?? "").trim();
    return name && Number.isFinite(price) && price > 0 ? [{ id: `${index}-${name}`, code: String(row[codeColumn] ?? "").trim(), name, price }] : [];
  });
}

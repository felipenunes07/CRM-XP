import XLSX from "xlsx";
import { indexCatalog, matchCatalog, modelKeys, hasFrame, partKind } from "../apps/web/src/pages/priceComparison.helpers.ts";

const file = process.argv[2];
if (!file) throw new Error("Informe o arquivo UUF.");
const book = XLSX.readFile(file);
const sheet = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, defval: "" });
const items = sheet.slice(1).filter((row) => row[2] && Number(row[3]) > 0).map((row, i) => ({ id: String(i), code: String(row[1]), name: String(row[2]), price: Number(row[3]) }));
const source = "https://docs.google.com/spreadsheets/d/1qAuw2ebWPJmcy_gl4Qf48GfmnSGLZumDfs62fpG2BGA/export?format=csv&gid=1219258954";
const response = await fetch(source);
if (!response.ok) throw new Error(`Estoque XP: HTTP ${response.status}`);
const csv = await response.text();
const inventoryBook = XLSX.read(csv, { type: "string", raw: true });
const inventory = XLSX.utils.sheet_to_json(inventoryBook.Sheets[inventoryBook.SheetNames[0]], { header: 1, raw: true, defval: "" });
const catalog = inventory.slice(1).filter((row) => row[0] && row[1]).map((row) => ({ sku: String(row[0]), model: String(row[1]), quality: String(row[3]), price: Number(String(row[4]).replace(",", ".")), stockQuantity: Number(row[5]) }));
const index = indexCatalog(catalog);
const allIndex = indexCatalog(catalog, false);
const indexedCatalog = catalog.map((xp) => ({ ...xp, keys: modelKeys(xp.model), kind: partKind(xp.model, true) }));
const report = items.map((item) => {
  const matches = matchCatalog(item, index).candidates;
  const anyStock = matchCatalog(item, allIndex).candidates;
  const keys = modelKeys(item.name);
  const kind = partKind(item.name);
  const sameModel = indexedCatalog.filter((xp) => keys.some((key) => xp.keys.includes(key)) && kind === xp.kind);
  return { name: item.name, code: item.code, matches: matches.map((xp) => xp.sku), reason: matches.length ? "matched" : anyStock.length ? "out-of-stock" : sameModel.some((xp) => hasFrame(item.name) !== hasFrame(xp.model)) ? "frame" : sameModel.length ? "brand-or-other" : "model-or-type", nearby: sameModel.slice(0, 5).map((xp) => `${xp.sku}:${xp.model}:${xp.stockQuantity}`) };
});
const counts = Object.groupBy(report, (row) => row.reason);
console.log(JSON.stringify({ source: file, total: items.length, catalog: catalog.length, summary: Object.fromEntries(Object.entries(counts).map(([reason, rows]) => [reason, rows.length])), examples: Object.fromEntries(Object.entries(counts).filter(([reason]) => reason !== "matched").map(([reason, rows]) => [reason, rows.slice(0, Number(process.argv[3] ?? 20))])) }, null, 2));

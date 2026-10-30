import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import XLSX from "xlsx";
import * as current from "../apps/web/src/pages/priceComparison.helpers.ts";
import { parsePriceRows } from "../packages/shared/src/supplierPrices.ts";

const [input, output, baselineRef = "HEAD"] = process.argv.slice(2);
if (!input || !output) throw new Error("Uso: node scripts/audit-price-equivalences.mjs arquivo.xlsx relatorio.json [ref-git]");
await fs.mkdir(path.dirname(output), { recursive: true });
const baselinePath = path.resolve(path.dirname(output), ".baseline-price-helpers.mts");
await fs.writeFile(baselinePath, execFileSync("git", ["show", `${baselineRef}:apps/web/src/pages/priceComparison.helpers.ts`], { encoding: "utf8" }));
const baseline = await import(pathToFileURL(baselinePath).href);
await fs.unlink(baselinePath);
const book = XLSX.readFile(input, { raw: true });
const items = book.SheetNames.flatMap((name) => parsePriceRows(XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: "" })));
if (!items.length) throw new Error("A fonte não contém produtos válidos.");
const catalogUrl = "https://docs.google.com/spreadsheets/d/1qAuw2ebWPJmcy_gl4Qf48GfmnSGLZumDfs62fpG2BGA/export?format=csv&gid=1219258954";
const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(45000) });
if (!response.ok) throw new Error(`Estoque XP: HTTP ${response.status}`);
const stock = XLSX.read(await response.text(), { type: "string", raw: true });
const rows = XLSX.utils.sheet_to_json(stock.Sheets[stock.SheetNames[0]], { header: 1, raw: true, defval: "" });
const catalog = rows.slice(1).filter((row) => row[0] && row[1]).map((row) => ({ sku: String(row[0]), model: String(row[1]), quality: String(row[3]), price: Number(String(row[4]).replace(",", ".")), stockQuantity: Number(row[5]) }));
const oldIndex = baseline.indexCatalog(catalog);
const oldFull = baseline.indexCatalog(catalog, false);
const index = current.indexCatalog(catalog);
const full = current.indexCatalog(catalog, false);
const report = items.map((item) => {
  const before = baseline.matchCatalog(item, oldIndex).candidates;
  const beforeAll = baseline.matchCatalog(item, oldFull).candidates;
  const matches = current.matchCatalog(item, index).candidates;
  const all = current.matchCatalog(item, full).candidates;
  return { ...item, before: { available: before.map((xp) => xp.sku), total: beforeAll.length },
    status: matches.length ? "available" : all.length ? "out-of-stock" : current.missingReason(item, full),
    candidates: all, available: matches.map((xp) => xp.sku), recovered: !before.length && matches.length > 0 };
});
const summary = { input, capturedAt: new Date().toISOString(), catalogSource: catalogUrl, baselineRef,
  total: items.length, catalog: catalog.length, beforeAvailable: report.filter((row) => row.before.available.length).length,
  afterAvailable: report.filter((row) => row.available.length).length, recovered: report.filter((row) => row.recovered).length,
  statuses: Object.fromEntries(Object.entries(Object.groupBy(report, (row) => row.status)).map(([key, values]) => [key, values.length])) };
await fs.writeFile(output, JSON.stringify({ summary, catalog, rows: report }, null, 2));
console.log(JSON.stringify(summary, null, 2));

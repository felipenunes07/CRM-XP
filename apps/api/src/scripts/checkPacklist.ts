import fs from "node:fs/promises";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import dotenv from "dotenv";
import { Pool } from "pg";
import { parsePacklistWorkbook, projectPacklistSupply, saoPauloDate } from "../modules/crm/packlistCore.js";

// Read-only verification against the original workbook; no database connection.
const source = process.argv[2];
if (!source) throw new Error("Uso: tsx src/scripts/checkPacklist.ts <arquivo.xlsx>");
const stat = await fs.stat(source);
const bytes = await fs.readFile(source);
const parsed = parsePacklistWorkbook(bytes, stat.mtime.toISOString());
const workbook = XLSX.read(bytes, { type: "buffer", sheets: ["IMPORT"], cellFormula: false });
const sheet = workbook.Sheets.IMPORT;
assert(sheet, "Aba IMPORT ausente para conferência independente.");
const totals = new Map<string, number>();
for (const row of XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true })) {
  const lotId = String(row[0] ?? "").trim();
  const sku = String(row[11] ?? "").trim();
  if (!lotId || !sku || typeof row[7] !== "number") continue;
  const key = JSON.stringify([lotId, sku]);
  totals.set(key, (totals.get(key) ?? 0) + row[7]);
}
let checked = 0;
for (const lot of parsed.lots) {
  for (const [sku, quantity] of Object.entries(lot.quantities)) {
    assert.equal(quantity, totals.get(JSON.stringify([lot.id, sku])) ?? 0, `${lot.id}, SKU ${sku}: PACKLIST difere de IMPORT`);
    checked += 1;
  }
}
const statAfter = await fs.stat(source);
assert.equal(statAfter.mtimeMs, stat.mtimeMs, "O arquivo mudou durante a conferência.");
const probe = projectPacklistSupply({ stockUnits: 10, sales90: 90, skus: ["A"], lots: [], today: saoPauloDate() });
assert.equal(probe.suggestedBuyUnits, 50);
console.log(JSON.stringify({ receivedLots: parsed.receivedLots, pendingLots: parsed.lots.length,
  incompleteLots: parsed.lots.filter((lot) => lot.status === "INCOMPLETE").length, independentlyCheckedSkuLotPairs: checked,
  lots: parsed.lots.map(({ quantities, ...lot }) => ({ ...lot, skuCount: Object.keys(quantities).length })) }, null, 2));

// Optional CRM comparison uses a read-only transaction and never imports data.
const envFile = process.argv[3];
if (envFile) {
  dotenv.config({ path: envFile });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000, statement_timeout: 60_000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const snapshot = (await client.query("SELECT id, imported_at FROM inventory_snapshots WHERE is_active = TRUE ORDER BY imported_at DESC LIMIT 1")).rows[0];
    assert(snapshot, "O CRM ainda não possui snapshot de estoque.");
    const stock = await client.query("SELECT sku, SUM(stock_quantity)::float8 AS quantity FROM inventory_snapshot_items WHERE snapshot_id = $1 GROUP BY sku", [snapshot.id]);
    const sales = await client.query(`SELECT oi.sku, SUM(oi.quantity)::float8 AS quantity
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku = ANY($1::text[]) AND o.order_date >= CURRENT_DATE - INTERVAL '89 days' GROUP BY oi.sku`, [stock.rows.map((row) => row.sku)]);
    const demand = new Map(sales.rows.map((row) => [row.sku, Number(row.quantity)]));
    const projections = stock.rows.map((row) => ({ sku: row.sku, ...projectPacklistSupply({ stockUnits: Number(row.quantity), sales90: demand.get(row.sku) ?? 0, skus: [row.sku], lots: parsed.lots }) }));
    const latestSale = (await client.query("SELECT MAX(order_date)::text AS date FROM orders")).rows[0]?.date;
    const noIncoming = projections.filter((row) => row.suggestedBuyUnits > 0 && row.incomingUnits === 0);
    const insufficient = projections.filter((row) => row.suggestedBuyUnits > 0 && row.incomingUnits > 0);
    assert(projections.every((row) => row.suggestedBuyUnits >= 0 && Number.isInteger(row.suggestedBuyUnits)));
    console.log(JSON.stringify({ crm: { stockImportedAt: snapshot.imported_at, latestSaleAt: latestSale, stockSkus: stock.rows.length,
      noIncoming: noIncoming.length, insufficientIncoming: insufficient.length, airUrgencies: projections.filter((row) => row.urgentAir).length,
      examples: [...noIncoming.slice(0, 2), ...insufficient.slice(0, 2)].map(({ sku, suggestedBuyUnits, stockoutAt, scheduledUnits, overdueUnits, incompleteUnits }) =>
        ({ sku, suggestedBuyUnits, stockoutAt, scheduledUnits, overdueUnits, incompleteUnits })) } }, null, 2));
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

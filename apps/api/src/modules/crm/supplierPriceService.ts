import { randomUUID } from "node:crypto";
import type { PriceSupplier, PriceSnapshot, PriceSnapshotSummary, SupplierPriceItem } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { collectFffPrices, downloadPriceSource, parsePriceWorkbook } from "./supplierPriceSources.js";
import { startRecurringJob } from "../platform/scheduledJobs.js";
import { logger } from "../../lib/logger.js";


const summaryColumns = `id, supplier_id AS "supplierId", captured_at AS "capturedAt", file_name AS "fileName", item_count AS "itemCount", source`;

export async function listPriceSuppliers(): Promise<PriceSupplier[]> {
  const result = await pool.query(`SELECT p.id, p.name, p.source_kind AS "sourceKind", p.source_url AS "sourceUrl", p.auto_sync AS "autoSync",
    p.last_attempt_at AS "lastAttemptAt", p.last_success_at AS "lastSuccessAt", p.last_error AS "lastError",
    s.id AS "latestSnapshotId", s.captured_at AS "latestCapturedAt", COALESCE(s.item_count, 0) AS "itemCount"
    FROM price_suppliers p LEFT JOIN LATERAL (SELECT id, captured_at, item_count FROM supplier_price_snapshots
      WHERE supplier_id = p.id ORDER BY captured_at DESC, id DESC LIMIT 1) s ON TRUE ORDER BY p.name`);
  return result.rows;
}

export async function createPriceSupplier(name: string) {
  const existing = await pool.query("SELECT id FROM price_suppliers WHERE lower(name) = lower($1) LIMIT 1", [name]);
  if (existing.rows[0]) return { id: existing.rows[0].id as string };
  const id = randomUUID();
  await pool.query("INSERT INTO price_suppliers(id, name) VALUES ($1, $2)", [id, name]);
  return { id };
}

export async function listPriceSnapshots(supplierId: string): Promise<PriceSnapshotSummary[]> {
  return (await pool.query(`SELECT ${summaryColumns} FROM supplier_price_snapshots WHERE supplier_id = $1 ORDER BY captured_at DESC, id DESC`, [supplierId])).rows;
}

export async function getPriceSnapshot(supplierId: string, id: string): Promise<PriceSnapshot> {
  const result = await pool.query(`SELECT ${summaryColumns}, items FROM supplier_price_snapshots WHERE supplier_id = $1 AND id = $2`, [supplierId, id]);
  if (!result.rows[0]) throw new HttpError(404, "Tabela não encontrada.");
  return result.rows[0];
}

export async function downloadPriceSnapshot(supplierId: string, id: string) {
  const result = await pool.query(`SELECT file_name, source_file FROM supplier_price_snapshots WHERE supplier_id = $1 AND id = $2`, [supplierId, id]);
  if (!result.rows[0]) throw new HttpError(404, "Arquivo não encontrado.");
  return { fileName: result.rows[0].file_name, base64: (result.rows[0].source_file as Buffer).toString("base64") };
}

export async function savePriceSnapshot(supplierId: string, input: { items: SupplierPriceItem[]; fileName: string; bytes: Buffer; source: string }, userId?: string) {
  if (!(await pool.query("SELECT id FROM price_suppliers WHERE id = $1", [supplierId])).rowCount) throw new HttpError(404, "Fornecedor não encontrado.");
  const id = randomUUID();
  await pool.query(`INSERT INTO supplier_price_snapshots(id, supplier_id, file_name, source, item_count, items, source_file, created_by)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`, [id, supplierId, input.fileName, input.source, input.items.length, JSON.stringify(input.items), input.bytes, userId ?? null]);
  return { id };
}

export async function importPriceSnapshot(supplierId: string, fileName: string, base64: string, userId?: string) {
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new HttpError(400, "O arquivo deve ter até 20 MB.");
  let items: SupplierPriceItem[];
  try { items = parsePriceWorkbook(bytes, fileName); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Planilha inválida."); }
  return savePriceSnapshot(supplierId, { items, fileName, bytes, source: "upload" }, userId);
}

export async function getSupplierProductHistory(supplierId: string, code: string, name: string) {
  const result = await pool.query(`SELECT s.id AS "snapshotId", s.captured_at AS "capturedAt", s.file_name AS "fileName",
    item->>'code' AS code, item->>'name' AS name, (item->>'price')::numeric AS price
    FROM supplier_price_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.items) item
    WHERE s.supplier_id = $1 AND CASE WHEN $2 <> '' THEN item->>'code' = $2 OR
      (COALESCE(item->>'code','') = '' AND lower(trim(item->>'name')) = lower(trim($3))) ELSE
      lower(trim(item->>'name')) = lower(trim($3)) END
    ORDER BY s.captured_at ASC, s.id, item->>'id'`, [supplierId, code, name]);
  return result.rows.map((row) => ({ ...row, price: Number(row.price) }));
}

export async function syncPriceSupplier(id: string, userId?: string, onlyIfDue = false) {
  // A session lock protects manual and scheduled captures across API/worker replicas.
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`supplier-prices:${id}`])).rows[0].locked;
    if (!locked) throw new HttpError(409, "Este fornecedor já está sendo atualizado.");
    const supplier = (await client.query("SELECT *, COALESCE(last_attempt_at <= NOW() - INTERVAL '7 days', TRUE) AS due FROM price_suppliers WHERE id = $1", [id])).rows[0];
    if (!supplier) throw new HttpError(404, "Fornecedor não encontrado.");
    if (supplier.source_kind === "upload") throw new HttpError(400, "Este fornecedor recebe atualizações por upload de Excel.");
    if (onlyIfDue && !supplier.due) return null;
    await client.query("UPDATE price_suppliers SET last_attempt_at = NOW() WHERE id = $1", [id]);
    try {
      let input;
      if (supplier.source_kind === "fff") input = await collectFffPrices();
      else if (supplier.source_kind === "skytech") {
        const { bytes } = await downloadPriceSource("https://docs.google.com/spreadsheets/d/1vVY6oEatrgRmMxWTAAfDeQmCjQYGHFosSCRxnGPi6Lc/export?format=xlsx");
        input = { items: parsePriceWorkbook(bytes, "skytech.xlsx"), fileName: "skytech.xlsx", bytes, source: "site" };
      } else {
        const { bytes } = await downloadPriceSource(supplier.source_url);
        const expired = /"(?:msg|result)"\s*:\s*"expired"/.test(bytes.toString("utf8"));
        throw new Error(expired ? "O link Feihu expirou. Solicite um novo link e importe o Excel enquanto isso." : "O WPS não forneceu um download público de Excel. Importe o arquivo manualmente.");
      }
      const saved = await savePriceSnapshot(id, input, userId);
      await client.query("UPDATE price_suppliers SET last_success_at = NOW(), last_error = NULL WHERE id = $1", [id]);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao coletar preços.";
      await client.query("UPDATE price_suppliers SET last_error = $2 WHERE id = $1", [id, message]);
      throw new HttpError(502, message);
    }
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`supplier-prices:${id}`]).catch(() => undefined);
    client.release();
  }
}

export async function syncDuePriceSuppliers() {
  const suppliers = await pool.query("SELECT id FROM price_suppliers WHERE auto_sync = TRUE AND (last_attempt_at IS NULL OR last_attempt_at <= NOW() - INTERVAL '7 days') ORDER BY id");
  for (const supplier of suppliers.rows) {
    try { await syncPriceSupplier(supplier.id, undefined, true); }
    catch (error) { logger.warn("supplier price capture failed; previous history preserved", { supplierId: supplier.id, error: String(error) }); }
  }
}

export function startSupplierPriceScheduler() {
  return startRecurringJob({ intervalMs: 60 * 60 * 1000, run: syncDuePriceSuppliers, onError: (error) => logger.error("supplier price scheduler failed", { error: String(error) }) });
}

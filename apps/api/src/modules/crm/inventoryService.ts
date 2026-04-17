import XLSX from "xlsx";
import type { PoolClient } from "pg";
import type { InventoryItem, InventorySnapshotMeta } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber, sha256 } from "../../lib/normalize.js";

const INVENTORY_LOCK_NS = 8202;
const INVENTORY_LOCK_KEY = 1;
const INVENTORY_SOURCE_TYPE = "inventory_sheet_csv";

interface ParsedInventoryRow {
  sku: string;
  model: string;
  color: string | null;
  quality: string | null;
  price: number;
  stockQuantity: number;
  promotionLabel: string | null;
  normalizedModel: string;
  rawPayload: Record<string, unknown>;
}

interface SnapshotRecord {
  id: string;
  sourceName: string;
  sourceUrl: string;
  sourceHash: string;
  importedAt: string;
  totalRows: number;
  inStockRows: number;
  matchedSkuRows: number;
}

let activeInventorySnapshotPromise: Promise<InventorySnapshotMeta | null> | null = null;

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeInventoryModel(value: string) {
  const withoutBrackets = normalizeText(value).replace(/\[[^\]]*\]/g, " ");
  const normalized = removeDiacritics(withoutBrackets).toLowerCase();

  return normalized
    .replace(/[.,;:*"'`´~^()[\]{}|\\/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapSnapshotMeta(row: Record<string, unknown>): InventorySnapshotMeta {
  return {
    id: String(row.id),
    sourceName: String(row.sourceName ?? ""),
    sourceUrl: String(row.sourceUrl ?? ""),
    importedAt: new Date(String(row.importedAt)).toISOString(),
    totalRows: Number(row.totalRows ?? 0),
    inStockRows: Number(row.inStockRows ?? 0),
    matchedSkuRows: Number(row.matchedSkuRows ?? 0),
  };
}

function mapInventoryItem(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row.id),
    snapshotId: String(row.snapshot_id ?? row.snapshotId ?? ""),
    sku: String(row.sku ?? ""),
    model: String(row.model ?? ""),
    color: row.color ? String(row.color) : null,
    quality: row.quality ? String(row.quality) : null,
    price: Number(row.price ?? 0),
    stockQuantity: Number(row.stock_quantity ?? row.stockQuantity ?? 0),
    promotionLabel: row.promotion_label ? String(row.promotion_label) : null,
    isInStock: Number(row.stock_quantity ?? row.stockQuantity ?? 0) > 0,
  };
}

async function getActiveInventorySnapshotRecord() {
  const result = await pool.query(
    `
      SELECT
        id,
        source_name AS "sourceName",
        source_url AS "sourceUrl",
        source_hash AS "sourceHash",
        imported_at::text AS "importedAt",
        total_rows AS "totalRows",
        in_stock_rows AS "inStockRows",
        matched_sku_rows AS "matchedSkuRows"
      FROM inventory_snapshots
      WHERE is_active = TRUE
      ORDER BY imported_at DESC
      LIMIT 1
    `,
  );

  return (result.rows[0] as SnapshotRecord | undefined) ?? null;
}

async function fetchInventoryCsv(sourceUrl = env.INVENTORY_SHEET_CSV_URL) {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new HttpError(502, `Nao foi possivel baixar a planilha de estoque (${response.status}).`);
  }

  return response.text();
}

function parseInventoryRow(row: unknown[]) {
  const sku = normalizeCode(String(row[0] ?? ""));
  const model = normalizeText(String(row[1] ?? ""));

  if (!sku || !model) {
    return null;
  }

  const color = normalizeText(String(row[2] ?? "")) || null;
  const quality = normalizeText(String(row[3] ?? "")) || null;
  const price = safeNumber(row[4]);
  const stockQuantity = Math.trunc(safeNumber(row[5]));
  const promotionLabel = normalizeText(String(row[6] ?? "")) || null;

  return {
    sku,
    model,
    color,
    quality,
    price,
    stockQuantity,
    promotionLabel,
    normalizedModel: normalizeInventoryModel(model),
    rawPayload: {
      sku,
      model,
      color,
      quality,
      price,
      stockQuantity,
      promotionLabel,
    },
  } satisfies ParsedInventoryRow;
}

export function parseInventoryCsv(csvText: string) {
  const workbook = XLSX.read(csvText, {
    type: "string",
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    throw new HttpError(400, "Nao encontrei nenhuma aba valida na planilha de estoque.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  return rows
    .slice(1)
    .map((row) => parseInventoryRow(Array.isArray(row) ? row : []))
    .filter((row): row is ParsedInventoryRow => Boolean(row));
}

async function registerInventorySourceFile(client: PoolClient, csvText: string) {
  const sourceHash = sha256([csvText]);
  const sizeBytes = Buffer.byteLength(csvText, "utf8");

  const result = await client.query(
    `
      INSERT INTO source_files (
        source_type,
        original_path,
        file_name,
        file_hash,
        file_size_bytes,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (original_path) DO UPDATE
      SET
        file_name = EXCLUDED.file_name,
        file_hash = EXCLUDED.file_hash,
        file_size_bytes = EXCLUDED.file_size_bytes,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id, file_hash
    `,
    [
      INVENTORY_SOURCE_TYPE,
      env.INVENTORY_SHEET_CSV_URL,
      env.INVENTORY_SHEET_SOURCE_NAME,
      sourceHash,
      sizeBytes,
      JSON.stringify({
        sourceName: env.INVENTORY_SHEET_SOURCE_NAME,
        sourceUrl: env.INVENTORY_SHEET_CSV_URL,
      }),
    ],
  );

  return {
    sourceFileId: String(result.rows[0]?.id ?? ""),
    sourceHash,
  };
}

async function insertSnapshotItems(client: PoolClient, snapshotId: string, rows: ParsedInventoryRow[]) {
  if (!rows.length) {
    return;
  }

  await client.query(
    `
      INSERT INTO inventory_snapshot_items (
        snapshot_id,
        sku,
        model,
        color,
        quality,
        price,
        stock_quantity,
        promotion_label,
        normalized_model,
        raw_payload
      )
      SELECT
        $1::uuid,
        entry.sku,
        entry.model,
        NULLIF(entry.color, ''),
        NULLIF(entry.quality, ''),
        COALESCE(entry.price, 0)::numeric(14, 2),
        COALESCE(entry.stock_quantity, 0),
        NULLIF(entry.promotion_label, ''),
        entry.normalized_model,
        COALESCE(entry.raw_payload, '{}'::jsonb)
      FROM jsonb_to_recordset($2::jsonb) AS entry(
        sku text,
        model text,
        color text,
        quality text,
        price numeric,
        stock_quantity integer,
        promotion_label text,
        normalized_model text,
        raw_payload jsonb
      )
    `,
    [snapshotId, JSON.stringify(rows)],
  );
}

async function persistInventorySnapshot(csvText: string, rows: ParsedInventoryRow[]) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [INVENTORY_LOCK_NS, INVENTORY_LOCK_KEY]);

    const { sourceFileId, sourceHash } = await registerInventorySourceFile(client, csvText);
    await client.query("UPDATE inventory_snapshots SET is_active = FALSE WHERE is_active = TRUE");

    const snapshotResult = await client.query(
      `
        INSERT INTO inventory_snapshots (
          source_file_id,
          source_name,
          source_url,
          source_hash,
          total_rows,
          in_stock_rows,
          matched_sku_rows,
          imported_at,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), TRUE)
        RETURNING
          id,
          source_name AS "sourceName",
          source_url AS "sourceUrl",
          source_hash AS "sourceHash",
          imported_at::text AS "importedAt",
          total_rows AS "totalRows",
          in_stock_rows AS "inStockRows",
          matched_sku_rows AS "matchedSkuRows"
      `,
      [
        sourceFileId || null,
        env.INVENTORY_SHEET_SOURCE_NAME,
        env.INVENTORY_SHEET_CSV_URL,
        sourceHash,
        rows.length,
        rows.filter((row) => row.stockQuantity > 0).length,
        rows.filter((row) => Boolean(row.sku)).length,
      ],
    );

    const snapshot = snapshotResult.rows[0] as SnapshotRecord;
    await insertSnapshotItems(client, String(snapshot.id), rows);

    await client.query("COMMIT");

    logger.info("inventory snapshot refreshed", {
      totalRows: rows.length,
      inStockRows: rows.filter((row) => row.stockQuantity > 0).length,
    });

    return mapSnapshotMeta(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function refreshInventorySnapshotInternal(forceRefresh = false) {
  const activeSnapshot = await getActiveInventorySnapshotRecord();
  let csvText = "";

  try {
    csvText = await fetchInventoryCsv();
  } catch (error) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("failed to fetch inventory sheet, using cached snapshot", {
        error: String(error),
      });
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }
    throw error;
  }

  const sourceHash = sha256([csvText]);
  if (activeSnapshot && !forceRefresh && activeSnapshot.sourceHash === sourceHash) {
    return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
  }

  const rows = parseInventoryCsv(csvText);
  if (!rows.length) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("inventory sheet parsed with zero rows, using cached snapshot");
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }

    throw new HttpError(500, "A planilha de estoque nao trouxe linhas validas.");
  }

  return persistInventorySnapshot(csvText, rows);
}

export async function ensureInventorySnapshot(forceRefresh = false): Promise<InventorySnapshotMeta | null> {
  if (activeInventorySnapshotPromise) {
    return activeInventorySnapshotPromise;
  }

  activeInventorySnapshotPromise = refreshInventorySnapshotInternal(forceRefresh).finally(() => {
    activeInventorySnapshotPromise = null;
  });

  return activeInventorySnapshotPromise;
}

async function loadInventoryItems(snapshotId: string) {
  const result = await pool.query(
    `
      SELECT
        id,
        snapshot_id,
        sku,
        model,
        color,
        quality,
        price,
        stock_quantity,
        promotion_label
      FROM inventory_snapshot_items
      WHERE snapshot_id = $1
      ORDER BY stock_quantity DESC, model ASC, sku ASC
    `,
    [snapshotId],
  );

  return result.rows.map((row) => mapInventoryItem(row));
}

export async function getInventorySnapshot() {
  return ensureInventorySnapshot(false);
}

export async function refreshInventorySnapshot() {
  return ensureInventorySnapshot(true);
}

export async function getInventorySnapshotWithItems() {
  const snapshot = await ensureInventorySnapshot(false);
  if (!snapshot) {
    return {
      snapshot: null,
      items: [] as InventoryItem[],
    };
  }

  return {
    snapshot,
    items: await loadInventoryItems(snapshot.id),
  };
}

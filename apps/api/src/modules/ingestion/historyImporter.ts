import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber, toIsoDate } from "../../lib/normalize.js";
import { rebuildReadModels } from "../analytics/analyticsService.js";
import { buildSaleLineFingerprint } from "./fingerprint.js";
import type { NormalizedSaleRow } from "./types.js";
import { downloadFileByPath, cleanupTempFile } from "../../lib/dropboxClient.js";

const REQUIRED_HEADERS = [
  "data",
  "modelo",
  "quantidade",
  "cod_cliente",
  "valor_unitario",
  "valor_total",
  "numero_nota",
  "sku",
  "cliente",
  "atendente",
] as const;

async function hashFile(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function displayFileName(originalPath: string, localPath: string) {
  const normalizedPath = originalPath.replace(/\\/g, "/");
  return normalizedPath.split("/").filter(Boolean).at(-1) ?? path.basename(localPath);
}

async function registerSourceFile(
  originalPath: string,
  localPath: string,
  fileHash: string,
  metadata: Record<string, unknown>,
) {
  const fileName = displayFileName(originalPath, localPath);
  const stat = await fs.stat(localPath);
  const result = await pool.query(
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
      VALUES ('history_xls', $1, $2, $3, $4, $5, NOW())
      ON CONFLICT (original_path) DO UPDATE
      SET
        file_name = EXCLUDED.file_name,
        file_hash = EXCLUDED.file_hash,
        file_size_bytes = EXCLUDED.file_size_bytes,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
    `,
    [originalPath, fileName, fileHash, stat.size, metadata],
  );

  return String(result.rows[0]?.id);
}

async function createImportRun(sourceFileId: string) {
  const result = await pool.query(
    `
      INSERT INTO import_runs (source_file_id, status)
      VALUES ($1, 'RUNNING')
      RETURNING id
    `,
    [sourceFileId],
  );
  return String(result.rows[0]?.id);
}

function normalizeWorkbookRows(
  rows: Array<Record<string, unknown>>,
  sourceFileId: string,
  importRunId: string,
): NormalizedSaleRow[] {
  return rows.map((row) => {
    const saleDate = toIsoDate(row.data);
    const customerCode = normalizeCode(String(row.cod_cliente ?? ""));
    const orderNumber = normalizeText(String(row.numero_nota ?? ""));
    const itemDescription = normalizeText(String(row.modelo ?? ""));
    const quantity = safeNumber(row.quantidade);
    const lineTotal = safeNumber(row.valor_total);
    const unitPrice = safeNumber(row.valor_unitario);
    const sku = normalizeText(String(row.sku ?? "")) || null;
    const customerLabel = normalizeText(String(row.cliente ?? customerCode));
    const attendantName = normalizeText(String(row.atendente ?? "")) || null;
    const fingerprint = buildSaleLineFingerprint({
      saleDate,
      customerCode,
      orderNumber,
      sku,
      quantity,
      lineTotal,
    });

    return {
      sourceSystem: "history_xls",
      sourceFileId,
      importRunId,
      externalOrderId: null,
      externalCustomerId: null,
      saleDate,
      itemDescription,
      quantity,
      customerCode,
      unitPrice,
      lineTotal,
      orderNumber,
      sku,
      customerLabel,
      attendantName,
      orderStatus: "VALID",
      orderUpdatedAt: null,
      fingerprint,
      rawPayload: row,
    };
  });
}

async function insertRawRows(rows: NormalizedSaleRow[]): Promise<{ rowCount: number; insertedCustomerCodes: string[] }> {
  if (!rows.length) {
    return { rowCount: 0, insertedCustomerCodes: [] };
  }

  const arrays = {
    sourceSystem: rows.map((row) => row.sourceSystem),
    sourceFileId: rows.map((row) => row.sourceFileId),
    importRunId: rows.map((row) => row.importRunId),
    externalOrderId: rows.map((row) => row.externalOrderId),
    externalCustomerId: rows.map((row) => row.externalCustomerId),
    saleDate: rows.map((row) => row.saleDate),
    itemDescription: rows.map((row) => row.itemDescription),
    quantity: rows.map((row) => row.quantity),
    customerCode: rows.map((row) => row.customerCode),
    unitPrice: rows.map((row) => row.unitPrice),
    lineTotal: rows.map((row) => row.lineTotal),
    orderNumber: rows.map((row) => row.orderNumber),
    sku: rows.map((row) => row.sku),
    customerLabel: rows.map((row) => row.customerLabel),
    attendantName: rows.map((row) => row.attendantName),
    orderStatus: rows.map((row) => row.orderStatus),
    orderUpdatedAt: rows.map((row) => row.orderUpdatedAt),
    fingerprint: rows.map((row) => row.fingerprint),
    rawPayload: rows.map((row) => JSON.stringify(row.rawPayload)),
  };

  const result = await pool.query<{ customer_code: string }>(
    `
      INSERT INTO sales_raw (
        source_system,
        source_file_id,
        import_run_id,
        external_order_id,
        external_customer_id,
        sale_date,
        item_description,
        quantity,
        customer_code,
        unit_price,
        line_total,
        order_number,
        sku,
        customer_label,
        attendant_name,
        order_status,
        order_updated_at,
        fingerprint,
        raw_payload
      )
      SELECT *
      FROM UNNEST(
        $1::text[],
        $2::uuid[],
        $3::uuid[],
        $4::text[],
        $5::text[],
        $6::date[],
        $7::text[],
        $8::numeric[],
        $9::text[],
        $10::numeric[],
        $11::numeric[],
        $12::text[],
        $13::text[],
        $14::text[],
        $15::text[],
        $16::text[],
        $17::timestamptz[],
        $18::text[],
        $19::jsonb[]
      )
      ON CONFLICT (fingerprint) DO NOTHING
      RETURNING customer_code
    `,
    [
      arrays.sourceSystem,
      arrays.sourceFileId,
      arrays.importRunId,
      arrays.externalOrderId,
      arrays.externalCustomerId,
      arrays.saleDate,
      arrays.itemDescription,
      arrays.quantity,
      arrays.customerCode,
      arrays.unitPrice,
      arrays.lineTotal,
      arrays.orderNumber,
      arrays.sku,
      arrays.customerLabel,
      arrays.attendantName,
      arrays.orderStatus,
      arrays.orderUpdatedAt,
      arrays.fingerprint,
      arrays.rawPayload,
    ],
  );

  const insertedCustomerCodes = result.rows.map((row) => row.customer_code).filter(Boolean);
  return {
    rowCount: result.rowCount ?? 0,
    insertedCustomerCodes,
  };
}

export async function importHistoryFile(filePath: string) {
  let actualPath = filePath;
  let isTemp = false;

  // If path starts with / or looks like a Dropbox path, download it
  if (filePath.startsWith("/") || (process.env.NODE_ENV === "production" && !filePath.includes(":"))) {
    const download = await downloadFileByPath(filePath);
    actualPath = download.localPath;
    isTemp = true;
  }

  const workbook = XLSX.readFile(actualPath, {
    raw: false,
    cellDates: false,
  });
  const sheet = workbook.Sheets.Vendas;
  if (!sheet) {
    throw new Error(`Workbook ${filePath} does not contain a 'Vendas' sheet.`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });
  const headers = Object.keys(rows[0] ?? {});
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`Workbook ${filePath} is missing required header '${header}'.`);
    }
  }

  const fileHash = await hashFile(actualPath);
  const sourceFileId = await registerSourceFile(filePath, actualPath, fileHash, {
    localFileName: path.basename(actualPath),
    sheetNames: workbook.SheetNames,
    rows: rows.length,
  });
  const importRunId = await createImportRun(sourceFileId);

  const impactedCustomerCodes = new Set<string>();
  let rowsInserted = 0;
  let rowsSeen = 0;

  try {
    for (let index = 0; index < rows.length; index += 1000) {
      const chunk = rows.slice(index, index + 1000);
      const normalized = normalizeWorkbookRows(chunk, sourceFileId, importRunId);
      const { rowCount: inserted, insertedCustomerCodes } = await insertRawRows(normalized);
      rowsSeen += normalized.length;
      rowsInserted += inserted;
      for (const code of insertedCustomerCodes) {
        impactedCustomerCodes.add(code);
      }
    }

    await rebuildReadModels(Array.from(impactedCustomerCodes));
    await pool.query(
      `
        UPDATE import_runs
        SET
          status = 'COMPLETED',
          rows_seen = $2,
          rows_inserted = $3,
          rows_duplicated = $4,
          finished_at = NOW()
        WHERE id = $1
      `,
      [importRunId, rowsSeen, rowsInserted, rowsSeen - rowsInserted],
    );

    logger.info("history workbook imported", { filePath, rowsSeen, rowsInserted });

    return {
      importRunId,
      rowsSeen,
      rowsInserted,
      rowsDuplicated: rowsSeen - rowsInserted,
    };
  } catch (error) {
    await pool.query(
      `
        UPDATE import_runs
        SET
          status = 'FAILED',
          rows_seen = $2,
          rows_inserted = $3,
          rows_duplicated = $4,
          errors = jsonb_build_array($5::text),
          finished_at = NOW()
        WHERE id = $1
      `,
      [importRunId, rowsSeen, rowsInserted, rowsSeen - rowsInserted, String(error)],
    );
    throw error;
  } finally {
    if (isTemp && actualPath) {
      await cleanupTempFile(actualPath);
    }
  }
}

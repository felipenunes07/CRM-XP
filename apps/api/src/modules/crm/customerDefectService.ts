import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import type { PoolClient } from "pg";
import type {
  CustomerDefectOverviewResponse,
  CustomerDefectRow,
  CustomerDefectSnapshotMeta,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber } from "../../lib/normalize.js";
import { cleanupTempFile, downloadLatestFileByPrefix } from "../../lib/dropboxClient.js";

const CUSTOMER_DEFECT_SOURCE_TYPE = "customer_defects_xlsx";
const CUSTOMER_DEFECT_SHEET_NAME = "DEFEITOS";
const CUSTOMER_DEFECT_LOCK_NS = 8203;
const CUSTOMER_DEFECT_LOCK_KEY = 1;
const CUSTOMER_DEFECT_PARSER_VERSION = 1;
const CUSTOMER_DEFECT_INSERT_CHUNK_SIZE = 5000;

let activeDefectSnapshotPromise: Promise<CustomerDefectSnapshotMeta | null> | null = null;

export interface CustomerDefectWorkbookCandidate {
  fullPath: string;
  sourcePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileUpdatedAt: string;
}

export interface ParsedCustomerDefectRawRow {
  customerCode: string;
  sourceDisplayName: string | null;
  defectDate: string;
  returnedPieces: number;
  returnedAmount: number;
  sku: string | null;
  description: string | null;
  rawPayload: Record<string, unknown>;
}

export interface ParsedCustomerDefectAggregate {
  customerCode: string;
  sourceDisplayName: string | null;
  returnedPieces: number;
  returnedAmount: number;
  defectSkuCount: number;
  firstDefectDate: string;
  lastDefectDate: string;
  rawRows: ParsedCustomerDefectRawRow[];
  purchasedPieces: number;
  revenue: number;
  orderCount: number;
  returnRate: number | null;
}

export interface CustomerDefectMatch {
  id: string;
  displayName: string;
}

export interface CustomerDefectPurchaseStats {
  purchasedPieces: number;
  revenue: number;
  orderCount: number;
}

export interface ResolvedCustomerDefectRow extends ParsedCustomerDefectAggregate {
  customerId: string | null;
  customerDisplayName: string;
  matched: boolean;
}

export interface CustomerDefectOverviewSummary {
  totalCustomers: number;
  matchedCustomers: number;
  unmatchedCustomers: number;
  totalRevenue: number;
  totalPurchasedPieces: number;
  totalReturnedPieces: number;
  totalReturnedAmount: number;
  overallReturnRate: number | null;
  highReturnCustomers: number;
  zeroPurchaseReturnCustomers: number;
}

export interface ParsedCustomerDefectWorkbook {
  candidate: CustomerDefectWorkbookCandidate;
  sheetNames: string[];
  period: {
    startDate: string;
    endDate: string;
  } | null;
  totalValidRows: number;
  rowsByCode: Map<string, ParsedCustomerDefectAggregate>;
}

interface SnapshotMetaRecord {
  id: string;
  sourceFileId: string | null;
  sourceFilePath: string;
  sourceFileName: string;
  sourceFileSizeBytes: number;
  sourceFileUpdatedAt: string;
  parserVersion: number;
  periodStartDate: string;
  periodEndDate: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  importedAt: string;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toIsoTimestamp(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) {
    return String(value ?? "");
  }

  return parsed.toISOString();
}

function mapSnapshotMeta(row: Record<string, unknown>): CustomerDefectSnapshotMeta {
  return {
    id: String(row.id),
    sourceFileName: String(row.sourceFileName ?? ""),
    sourceFilePath: String(row.sourceFilePath ?? ""),
    sourceFileUpdatedAt: toIsoTimestamp(row.sourceFileUpdatedAt),
    sourceFileSizeBytes: Number(row.sourceFileSizeBytes ?? 0),
    importedAt: toIsoTimestamp(row.importedAt),
    periodStartDate: String(row.periodStartDate ?? ""),
    periodEndDate: String(row.periodEndDate ?? ""),
    totalRows: Number(row.totalRows ?? 0),
    matchedRows: Number(row.matchedRows ?? 0),
    unmatchedRows: Number(row.unmatchedRows ?? 0),
  };
}

function mapCustomerDefectRow(row: Record<string, unknown>): CustomerDefectRow {
  return {
    id: String(row.id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: String(row.customer_code ?? ""),
    customerDisplayName: String(row.customer_display_name ?? row.source_display_name ?? row.customer_code ?? ""),
    sourceDisplayName: row.source_display_name ? String(row.source_display_name) : null,
    matched: Boolean(row.customer_id),
    revenue: Number(row.revenue ?? 0),
    orderCount: Number(row.order_count ?? 0),
    purchasedPieces: Number(row.purchased_pieces ?? 0),
    returnedPieces: Number(row.returned_pieces ?? 0),
    returnedAmount: Number(row.returned_amount ?? 0),
    returnRate: row.return_rate === null || row.return_rate === undefined ? null : Number(row.return_rate),
    defectSkuCount: Number(row.defect_sku_count ?? 0),
    firstDefectDate: row.first_defect_date ? String(row.first_defect_date) : null,
    lastDefectDate: row.last_defect_date ? String(row.last_defect_date) : null,
  };
}

function parseCustomerDefectDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
    }
  }

  const normalized = normalizeText(String(value ?? ""));
  if (!normalized) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return normalized.slice(0, 10);
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function isOkDefectRow(row: Record<string, unknown>) {
  const ok = normalizeText(String(row.OK ?? "")).toUpperCase();
  const status = normalizeText(String(row.STAUS ?? row.STATUS ?? "")).toUpperCase();
  return ok === "OK" || status === "OK";
}

function normalizeDefectSourceRow(row: Record<string, unknown>): ParsedCustomerDefectRawRow | null {
  const customerCode = normalizeCode(String(row.CL ?? ""));
  if (!customerCode || !isOkDefectRow(row)) {
    return null;
  }

  const defectDate = parseCustomerDefectDate(row.DATA);
  if (!defectDate) {
    return null;
  }

  const returnedPieces = Math.abs(safeNumber(row["UND."]));
  if (returnedPieces <= 0) {
    return null;
  }

  const returnedAmount = Math.abs(safeNumber(row.Total));
  const sku = normalizeCode(String(row.SKU ?? "")) || null;

  return {
    customerCode,
    sourceDisplayName: normalizeText(String(row.Cliente ?? "")) || null,
    defectDate,
    returnedPieces,
    returnedAmount,
    sku,
    description: normalizeText(String(row["Descrição"] ?? row.Descricao ?? "")) || null,
    rawPayload: row,
  };
}

function emptyAggregate(row: ParsedCustomerDefectRawRow): ParsedCustomerDefectAggregate {
  return {
    customerCode: row.customerCode,
    sourceDisplayName: row.sourceDisplayName,
    returnedPieces: 0,
    returnedAmount: 0,
    defectSkuCount: 0,
    firstDefectDate: row.defectDate,
    lastDefectDate: row.defectDate,
    rawRows: [],
    purchasedPieces: 0,
    revenue: 0,
    orderCount: 0,
    returnRate: null,
  };
}

function aggregateDefectRows(rows: ParsedCustomerDefectRawRow[]) {
  const rowsByCode = new Map<string, ParsedCustomerDefectAggregate>();
  const skuSets = new Map<string, Set<string>>();

  for (const row of rows) {
    const current = rowsByCode.get(row.customerCode) ?? emptyAggregate(row);
    current.sourceDisplayName = current.sourceDisplayName ?? row.sourceDisplayName;
    current.returnedPieces += row.returnedPieces;
    current.returnedAmount += row.returnedAmount;
    current.firstDefectDate = row.defectDate < current.firstDefectDate ? row.defectDate : current.firstDefectDate;
    current.lastDefectDate = row.defectDate > current.lastDefectDate ? row.defectDate : current.lastDefectDate;
    current.rawRows.push(row);

    const skuSet = skuSets.get(row.customerCode) ?? new Set<string>();
    if (row.sku) {
      skuSet.add(row.sku);
    }
    skuSets.set(row.customerCode, skuSet);
    rowsByCode.set(row.customerCode, current);
  }

  for (const [customerCode, aggregate] of rowsByCode) {
    aggregate.defectSkuCount = skuSets.get(customerCode)?.size ?? 0;
  }

  return rowsByCode;
}

export async function parseCustomerDefectWorkbook(
  filePath: string,
  sourcePath = filePath,
  candidate?: CustomerDefectWorkbookCandidate,
): Promise<ParsedCustomerDefectWorkbook> {
  const stat = await fs.stat(filePath);
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
  });

  const actualSheetName = workbook.SheetNames.find((sheetName) => sheetName.toUpperCase() === CUSTOMER_DEFECT_SHEET_NAME);
  if (!actualSheetName) {
    throw new HttpError(
      400,
      `A planilha ${path.basename(filePath)} nao contem a aba '${CUSTOMER_DEFECT_SHEET_NAME}'. Abas disponiveis: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const sheet = workbook.Sheets[actualSheetName];
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet!, {
      defval: null,
      raw: false,
    })
    .map((row) => normalizeDefectSourceRow(row))
    .filter((row): row is ParsedCustomerDefectRawRow => Boolean(row));

  const rowsByCode = aggregateDefectRows(rows);
  const dates = rows.map((row) => row.defectDate).sort();

  return {
    candidate: {
      fullPath: filePath,
      sourcePath,
      fileName: candidate?.fileName ?? path.basename(filePath),
      fileSizeBytes: candidate?.fileSizeBytes ?? stat.size,
      fileUpdatedAt: candidate?.fileUpdatedAt ?? stat.mtime.toISOString(),
    },
    sheetNames: workbook.SheetNames,
    period: dates.length ? { startDate: dates[0]!, endDate: dates[dates.length - 1]! } : null,
    totalValidRows: rows.length,
    rowsByCode,
  };
}

async function getActiveSnapshotRecord() {
  const result = await pool.query(
    `
      SELECT
        id,
        source_file_id AS "sourceFileId",
        source_file_path AS "sourceFilePath",
        source_file_name AS "sourceFileName",
        source_file_size_bytes AS "sourceFileSizeBytes",
        source_file_updated_at::text AS "sourceFileUpdatedAt",
        parser_version AS "parserVersion",
        period_start_date::text AS "periodStartDate",
        period_end_date::text AS "periodEndDate",
        total_rows AS "totalRows",
        matched_rows AS "matchedRows",
        unmatched_rows AS "unmatchedRows",
        imported_at::text AS "importedAt"
      FROM customer_defect_snapshots
      WHERE is_active = TRUE
      ORDER BY imported_at DESC
      LIMIT 1
    `,
  );

  return (result.rows[0] as SnapshotMetaRecord | undefined) ?? null;
}

export async function findLatestCustomerDefectWorkbook(
  directory = env.CUSTOMER_DEFECT_WORKBOOK_DIR,
  prefix = env.CUSTOMER_DEFECT_WORKBOOK_PREFIX,
): Promise<(CustomerDefectWorkbookCandidate & { isTemp?: boolean }) | null> {
  if (env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY)) {
    logger.info("Searching for latest defect workbook in Dropbox", {
      path: env.DROPBOX_CUSTOMER_DEFECT_PATH,
      prefix,
    });

    const dropboxFile = await downloadLatestFileByPrefix(env.DROPBOX_CUSTOMER_DEFECT_PATH, prefix);
    if (dropboxFile) {
      return {
        fullPath: dropboxFile.localPath,
        sourcePath: dropboxFile.sourcePath,
        fileName: dropboxFile.fileName,
        fileSizeBytes: dropboxFile.fileSizeBytes,
        fileUpdatedAt: dropboxFile.fileUpdatedAt,
        isTemp: true,
      };
    }
  }

  logger.info("Searching for latest defect workbook in local directory", { directory, prefix });
  const normalizedPrefix = normalizeText(prefix).toLowerCase();
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx"))
      .filter((entry) => normalizeText(entry.name).toLowerCase().startsWith(normalizedPrefix))
      .map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        const stat = await fs.stat(fullPath);
        return {
          fullPath,
          sourcePath: fullPath,
          fileName: entry.name,
          fileSizeBytes: stat.size,
          fileUpdatedAt: stat.mtime.toISOString(),
        } satisfies CustomerDefectWorkbookCandidate;
      }),
  );

  candidates.sort((left, right) => {
    const mtimeComparison = right.fileUpdatedAt.localeCompare(left.fileUpdatedAt);
    if (mtimeComparison !== 0) {
      return mtimeComparison;
    }
    return right.fileName.localeCompare(left.fileName, "pt-BR");
  });

  return candidates[0] ?? null;
}

function sortableRate(value: number | null) {
  return value === null || !Number.isFinite(value) ? -1 : value;
}

export function sortCustomerDefectRows<T extends Pick<ParsedCustomerDefectAggregate, "returnRate" | "returnedPieces" | "revenue" | "customerCode">>(
  rows: T[],
) {
  return [...rows].sort((left, right) => {
    const rateDiff = sortableRate(right.returnRate) - sortableRate(left.returnRate);
    if (rateDiff !== 0) {
      return rateDiff;
    }

    const returnedDiff = right.returnedPieces - left.returnedPieces;
    if (returnedDiff !== 0) {
      return returnedDiff;
    }

    const revenueDiff = right.revenue - left.revenue;
    if (revenueDiff !== 0) {
      return revenueDiff;
    }

    return left.customerCode.localeCompare(right.customerCode, "pt-BR");
  });
}

export function buildCustomerDefectRows(
  parsedRows: ParsedCustomerDefectAggregate[],
  matches: Map<string, CustomerDefectMatch>,
  purchaseStats: Map<string, CustomerDefectPurchaseStats>,
): ResolvedCustomerDefectRow[] {
  return parsedRows.map((row) => {
    const matchedCustomer = matches.get(row.customerCode) ?? null;
    const stats = purchaseStats.get(row.customerCode) ?? {
      purchasedPieces: 0,
      revenue: 0,
      orderCount: 0,
    };
    const returnRate = stats.purchasedPieces > 0 ? row.returnedPieces / stats.purchasedPieces : null;

    return {
      ...row,
      customerId: matchedCustomer?.id ?? null,
      customerDisplayName: matchedCustomer?.displayName ?? row.sourceDisplayName ?? row.customerCode,
      matched: Boolean(matchedCustomer),
      purchasedPieces: stats.purchasedPieces,
      revenue: stats.revenue,
      orderCount: stats.orderCount,
      returnRate,
    };
  });
}

type CustomerDefectSummaryRow = Pick<
  ResolvedCustomerDefectRow,
  "matched" | "revenue" | "purchasedPieces" | "returnedPieces" | "returnedAmount" | "returnRate"
>;

export function buildCustomerDefectOverviewSummary(rows: CustomerDefectSummaryRow[]): CustomerDefectOverviewSummary {
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalPurchasedPieces = rows.reduce((sum, row) => sum + row.purchasedPieces, 0);
  const totalReturnedPieces = rows.reduce((sum, row) => sum + row.returnedPieces, 0);
  const totalReturnedAmount = rows.reduce((sum, row) => sum + row.returnedAmount, 0);
  const overallReturnRate = totalPurchasedPieces > 0 ? totalReturnedPieces / totalPurchasedPieces : null;

  return {
    totalCustomers: rows.length,
    matchedCustomers: rows.filter((row) => row.matched).length,
    unmatchedCustomers: rows.filter((row) => !row.matched).length,
    totalRevenue,
    totalPurchasedPieces,
    totalReturnedPieces,
    totalReturnedAmount,
    overallReturnRate,
    highReturnCustomers:
      overallReturnRate === null
        ? 0
        : rows.filter((row) => row.returnRate !== null && row.returnRate > overallReturnRate).length,
    zeroPurchaseReturnCustomers: rows.filter((row) => row.returnedPieces > 0 && row.purchasedPieces <= 0).length,
  };
}

function buildRowLookup(rows: ParsedCustomerDefectAggregate[]) {
  return Array.from(new Set(rows.map((row) => row.customerCode)));
}

async function resolveCustomerMatches(rows: ParsedCustomerDefectAggregate[]) {
  const customerCodes = buildRowLookup(rows);
  if (!customerCodes.length) {
    return new Map<string, CustomerDefectMatch>();
  }

  const result = await pool.query(
    `
      SELECT id, customer_code, display_name
      FROM customers
      WHERE customer_code = ANY($1::text[])
    `,
    [customerCodes],
  );

  return new Map(
    result.rows.map((row) => [
      String(row.customer_code),
      {
        id: String(row.id),
        displayName: String(row.display_name ?? row.customer_code ?? ""),
      },
    ]),
  );
}

async function loadPurchaseStats(customerCodes: string[], period: { startDate: string; endDate: string }) {
  if (!customerCodes.length) {
    return new Map<string, CustomerDefectPurchaseStats>();
  }

  const result = await pool.query(
    `
      WITH matched_customers AS (
        SELECT id, customer_code
        FROM customers
        WHERE customer_code = ANY($1::text[])
      ),
      orders_in_period AS (
        SELECT
          o.id,
          o.customer_id,
          o.total_amount
        FROM orders o
        JOIN matched_customers mc ON mc.id = o.customer_id
        WHERE o.order_date::date BETWEEN $2::date AND $3::date
      ),
      order_piece_totals AS (
        SELECT
          op.id AS order_id,
          COALESCE(SUM(oi.quantity), 0)::numeric(14, 2) AS purchased_pieces
        FROM orders_in_period op
        LEFT JOIN order_items oi ON oi.order_id = op.id
        GROUP BY op.id
      )
      SELECT
        mc.customer_code,
        COUNT(op.id)::int AS order_count,
        COALESCE(SUM(op.total_amount), 0)::numeric(14, 2) AS revenue,
        COALESCE(SUM(opt.purchased_pieces), 0)::numeric(14, 2) AS purchased_pieces
      FROM matched_customers mc
      LEFT JOIN orders_in_period op ON op.customer_id = mc.id
      LEFT JOIN order_piece_totals opt ON opt.order_id = op.id
      GROUP BY mc.customer_code
    `,
    [customerCodes, period.startDate, period.endDate],
  );

  return new Map(
    result.rows.map((row) => [
      String(row.customer_code),
      {
        purchasedPieces: Number(row.purchased_pieces ?? 0),
        revenue: Number(row.revenue ?? 0),
        orderCount: Number(row.order_count ?? 0),
      },
    ]),
  );
}

async function registerSourceFile(client: PoolClient, workbook: ParsedCustomerDefectWorkbook) {
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
      RETURNING id
    `,
    [
      CUSTOMER_DEFECT_SOURCE_TYPE,
      workbook.candidate.sourcePath,
      workbook.candidate.fileName,
      `${workbook.candidate.fileUpdatedAt}-${workbook.candidate.fileSizeBytes}`,
      workbook.candidate.fileSizeBytes,
      JSON.stringify({
        sheetNames: workbook.sheetNames,
        totalValidRows: workbook.totalValidRows,
        period: workbook.period,
        customerRows: workbook.rowsByCode.size,
        fileUpdatedAt: workbook.candidate.fileUpdatedAt,
      }),
    ],
  );

  return String(result.rows[0]?.id);
}

async function insertSnapshotRows(client: PoolClient, snapshotId: string, rows: ResolvedCustomerDefectRow[]) {
  if (!rows.length) {
    return;
  }

  const payload = rows.map((row) => ({
    customer_id: row.customerId,
    customer_code: row.customerCode,
    customer_display_name: row.customerDisplayName,
    source_display_name: row.sourceDisplayName,
    revenue: row.revenue,
    order_count: row.orderCount,
    purchased_pieces: row.purchasedPieces,
    returned_pieces: row.returnedPieces,
    returned_amount: row.returnedAmount,
    return_rate: row.returnRate,
    defect_sku_count: row.defectSkuCount,
    first_defect_date: row.firstDefectDate,
    last_defect_date: row.lastDefectDate,
    raw_payload: {
      sourceDisplayName: row.sourceDisplayName,
      defectRowCount: row.rawRows.length,
      defectSkuCount: row.defectSkuCount,
    },
  }));

  for (const chunk of chunkArray(payload, CUSTOMER_DEFECT_INSERT_CHUNK_SIZE)) {
    await client.query(
      `
        INSERT INTO customer_defect_snapshot_rows (
          snapshot_id,
          customer_id,
          customer_code,
          customer_display_name,
          source_display_name,
          revenue,
          order_count,
          purchased_pieces,
          returned_pieces,
          returned_amount,
          return_rate,
          defect_sku_count,
          first_defect_date,
          last_defect_date,
          raw_payload
        )
        SELECT
          $1::uuid,
          NULLIF(entry.customer_id, '')::uuid,
          entry.customer_code,
          entry.customer_display_name,
          entry.source_display_name,
          COALESCE(entry.revenue, 0)::numeric(14, 2),
          COALESCE(entry.order_count, 0),
          COALESCE(entry.purchased_pieces, 0)::numeric(14, 2),
          COALESCE(entry.returned_pieces, 0)::numeric(14, 2),
          COALESCE(entry.returned_amount, 0)::numeric(14, 2),
          entry.return_rate::numeric(14, 6),
          COALESCE(entry.defect_sku_count, 0),
          NULLIF(entry.first_defect_date, '')::date,
          NULLIF(entry.last_defect_date, '')::date,
          COALESCE(entry.raw_payload, '{}'::jsonb)
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          customer_id text,
          customer_code text,
          customer_display_name text,
          source_display_name text,
          revenue numeric,
          order_count integer,
          purchased_pieces numeric,
          returned_pieces numeric,
          returned_amount numeric,
          return_rate numeric,
          defect_sku_count integer,
          first_defect_date text,
          last_defect_date text,
          raw_payload jsonb
        )
      `,
      [snapshotId, JSON.stringify(chunk)],
    );
  }
}

async function persistSnapshot(workbook: ParsedCustomerDefectWorkbook, rows: ResolvedCustomerDefectRow[]) {
  if (!workbook.period) {
    throw new HttpError(500, "A planilha de defeitos nao trouxe nenhuma linha valida para gerar periodo.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [CUSTOMER_DEFECT_LOCK_NS, CUSTOMER_DEFECT_LOCK_KEY]);

    const sourceFileId = await registerSourceFile(client, workbook);
    await client.query("UPDATE customer_defect_snapshots SET is_active = FALSE WHERE is_active = TRUE");

    const snapshotResult = await client.query(
      `
        INSERT INTO customer_defect_snapshots (
          source_file_id,
          source_file_path,
          source_file_name,
          source_file_size_bytes,
          source_file_updated_at,
          parser_version,
          period_start_date,
          period_end_date,
          total_rows,
          matched_rows,
          unmatched_rows,
          imported_at,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), TRUE)
        RETURNING
          id,
          source_file_id AS "sourceFileId",
          source_file_path AS "sourceFilePath",
          source_file_name AS "sourceFileName",
          source_file_size_bytes AS "sourceFileSizeBytes",
          source_file_updated_at::text AS "sourceFileUpdatedAt",
          parser_version AS "parserVersion",
          period_start_date::text AS "periodStartDate",
          period_end_date::text AS "periodEndDate",
          total_rows AS "totalRows",
          matched_rows AS "matchedRows",
          unmatched_rows AS "unmatchedRows",
          imported_at::text AS "importedAt"
      `,
      [
        sourceFileId,
        workbook.candidate.sourcePath,
        workbook.candidate.fileName,
        workbook.candidate.fileSizeBytes,
        workbook.candidate.fileUpdatedAt,
        CUSTOMER_DEFECT_PARSER_VERSION,
        workbook.period.startDate,
        workbook.period.endDate,
        workbook.totalValidRows,
        rows.filter((row) => row.customerId).length,
        rows.filter((row) => !row.customerId).length,
      ],
    );

    const snapshot = snapshotResult.rows[0] as SnapshotMetaRecord;
    await insertSnapshotRows(client, String(snapshot.id), rows);
    await client.query("COMMIT");

    logger.info("customer defect snapshot refreshed", {
      fileName: workbook.candidate.fileName,
      totalRows: workbook.totalValidRows,
      customerRows: rows.length,
      matchedRows: rows.filter((row) => row.customerId).length,
      unmatchedRows: rows.filter((row) => !row.customerId).length,
      period: workbook.period,
    });

    return mapSnapshotMeta(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadOverviewRows(snapshotId: string) {
  const result = await pool.query(
    `
      SELECT
        id,
        customer_id,
        customer_code,
        customer_display_name,
        source_display_name,
        revenue,
        order_count,
        purchased_pieces,
        returned_pieces,
        returned_amount,
        return_rate,
        defect_sku_count,
        first_defect_date::text AS first_defect_date,
        last_defect_date::text AS last_defect_date
      FROM customer_defect_snapshot_rows
      WHERE snapshot_id = $1
      ORDER BY return_rate DESC NULLS LAST, returned_pieces DESC, revenue DESC, customer_display_name ASC
    `,
    [snapshotId],
  );

  return result.rows.map((row) => mapCustomerDefectRow(row));
}

function emptyCustomerDefectOverview(): CustomerDefectOverviewResponse {
  return {
    snapshot: null,
    summary: {
      totalCustomers: 0,
      matchedCustomers: 0,
      unmatchedCustomers: 0,
      totalRevenue: 0,
      totalPurchasedPieces: 0,
      totalReturnedPieces: 0,
      totalReturnedAmount: 0,
      overallReturnRate: null,
      highReturnCustomers: 0,
      zeroPurchaseReturnCustomers: 0,
    },
    rows: [],
    unmatchedRows: [],
  };
}

async function buildOverviewResponse(snapshot: CustomerDefectSnapshotMeta): Promise<CustomerDefectOverviewResponse> {
  const rows = await loadOverviewRows(snapshot.id);
  const linkedRows = rows.filter((row) => row.customerId);
  const unmatchedRows = rows.filter((row) => !row.customerId);

  return {
    snapshot,
    summary: buildCustomerDefectOverviewSummary(rows),
    rows: linkedRows,
    unmatchedRows,
  };
}

async function refreshSnapshotInternal(forceRefresh = false) {
  const activeSnapshot = await getActiveSnapshotRecord();
  let latestWorkbook: (CustomerDefectWorkbookCandidate & { isTemp?: boolean }) | null = null;

  try {
    latestWorkbook = await findLatestCustomerDefectWorkbook();
  } catch (error) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("failed to scan customer defect workbook source, using cached snapshot", { error: String(error) });
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }
    throw error;
  }

  if (!latestWorkbook) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("customer defect workbook not found, using cached snapshot");
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }

    const isDropboxConfigured = Boolean(env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY));
    const locationInfo = isDropboxConfigured
      ? `no Dropbox (caminho: ${env.DROPBOX_CUSTOMER_DEFECT_PATH})`
      : `na pasta local (caminho: ${env.CUSTOMER_DEFECT_WORKBOOK_DIR})`;

    throw new HttpError(
      500,
      `Nao encontrei nenhum arquivo comecando com "${env.CUSTOMER_DEFECT_WORKBOOK_PREFIX}" ${locationInfo}.`,
    );
  }

  if (
    activeSnapshot &&
    !forceRefresh &&
    Number(activeSnapshot.parserVersion ?? 0) === CUSTOMER_DEFECT_PARSER_VERSION &&
    activeSnapshot.sourceFilePath === latestWorkbook.sourcePath &&
    Number(activeSnapshot.sourceFileSizeBytes) === latestWorkbook.fileSizeBytes &&
    toIsoTimestamp(activeSnapshot.sourceFileUpdatedAt) === latestWorkbook.fileUpdatedAt
  ) {
    if (latestWorkbook.isTemp) {
      await cleanupTempFile(latestWorkbook.fullPath);
    }
    return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
  }

  try {
    const workbook = await parseCustomerDefectWorkbook(latestWorkbook.fullPath, latestWorkbook.sourcePath, latestWorkbook);
    if (!workbook.period || workbook.rowsByCode.size === 0) {
      if (activeSnapshot && !forceRefresh) {
        logger.warn("customer defect workbook parsed with zero valid rows, using cached snapshot");
        return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
      }

      throw new HttpError(500, "A planilha de defeitos nao trouxe linhas validas.");
    }

    const parsedRows = Array.from(workbook.rowsByCode.values());
    const matches = await resolveCustomerMatches(parsedRows);
    const stats = await loadPurchaseStats(buildRowLookup(parsedRows), workbook.period);
    const rows = sortCustomerDefectRows(buildCustomerDefectRows(parsedRows, matches, stats));
    return persistSnapshot(workbook, rows);
  } finally {
    if (latestWorkbook.isTemp) {
      await cleanupTempFile(latestWorkbook.fullPath);
    }
  }
}

export async function ensureCustomerDefectSnapshot(forceRefresh = false): Promise<CustomerDefectSnapshotMeta | null> {
  if (activeDefectSnapshotPromise) {
    return activeDefectSnapshotPromise;
  }

  activeDefectSnapshotPromise = refreshSnapshotInternal(forceRefresh).finally(() => {
    activeDefectSnapshotPromise = null;
  });

  return activeDefectSnapshotPromise;
}

export async function getCustomerDefectOverview(): Promise<CustomerDefectOverviewResponse> {
  const snapshot = await ensureCustomerDefectSnapshot(false);
  if (!snapshot) {
    return emptyCustomerDefectOverview();
  }

  return buildOverviewResponse(snapshot);
}

export async function refreshCustomerDefectOverview(): Promise<CustomerDefectOverviewResponse> {
  const snapshot = await ensureCustomerDefectSnapshot(true);
  if (!snapshot) {
    return emptyCustomerDefectOverview();
  }

  return buildOverviewResponse(snapshot);
}

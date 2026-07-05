import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import type { PoolClient } from "pg";
import type {
  CustomerDefectCustomerDetailResponse,
  CustomerDefectMovementRow,
  CustomerDefectOverviewResponse,
  CustomerDefectRow,
  CustomerDefectSnapshotMeta,
  CustomerDefectYearBreakdown,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber } from "../../lib/normalize.js";
import {
  cleanupTempFile,
  downloadFileByPath,
  downloadLatestFileByPrefix,
  listDropboxFiles,
} from "../../lib/dropboxClient.js";

const CUSTOMER_DEFECT_SOURCE_TYPE = "customer_defects_xlsx";
const CUSTOMER_DEFECT_SHEET_NAME = "DEFEITOS";
const CUSTOMER_DEFECT_LOCK_NS = 8203;
const CUSTOMER_DEFECT_LOCK_KEY = 1;
const CUSTOMER_DEFECT_DAILY_SYNC_LOCK_NS = 8204;
const CUSTOMER_DEFECT_DAILY_SYNC_CURSOR_KEY = "customer_defect_snapshot_date";
const CUSTOMER_DEFECT_PARSER_VERSION = 5;
const CUSTOMER_DEFECT_INSERT_CHUNK_SIZE = 5000;
const CUSTOMER_DEFECT_SYNC_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CUSTOMER_DEFECT_SYNC_TIMEZONE = "America/Sao_Paulo";
const CUSTOMER_DEFECT_WORKBOOK_NAME_MARKER = "PLANILHA DEFEITOS";

let activeDefectSnapshotPromise: Promise<CustomerDefectSnapshotMeta | null> | null = null;

export interface CustomerDefectWorkbookCandidate {
  fullPath: string;
  sourcePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileUpdatedAt: string;
  isTemp?: boolean;
}

export interface ParsedCustomerDefectRawRow {
  customerCode: string;
  sourceDisplayName: string | null;
  defectDate: string;
  returnedPieces: number;
  replacementPieces: number;
  returnedAmount: number;
  sku: string | null;
  description: string | null;
  rawPayload: Record<string, unknown>;
}

export interface ParsedCustomerDefectAggregate {
  customerCode: string;
  sourceDisplayName: string | null;
  returnedPieces: number;
  replacementPieces: number;
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
  yearlyBreakdown: CustomerDefectYearBreakdown[];
}

export interface CustomerDefectOverviewSummary {
  totalCustomers: number;
  matchedCustomers: number;
  unmatchedCustomers: number;
  totalRevenue: number;
  totalPurchasedPieces: number;
  totalReturnedPieces: number;
  totalReplacementPieces: number;
  totalReturnedAmount: number;
  overallReturnRate: number | null;
  highReturnCustomers: number;
  zeroPurchaseReturnCustomers: number;
}

export interface ParsedCustomerDefectWorkbook {
  candidate: CustomerDefectWorkbookCandidate;
  sheetNames: string[];
  sourceFiles: CustomerDefectWorkbookCandidate[];
  period: {
    startDate: string;
    endDate: string;
  } | null;
  totalValidRows: number;
  rowsByCode: Map<string, ParsedCustomerDefectAggregate>;
}

export interface CustomerDefectSyncLocalParts {
  dateKey: string;
  hour: number;
}

interface SnapshotMetaRecord {
  id: string;
  sourceFileId: string | null;
  sourceFilePath: string;
  sourceFileName: string;
  sourceFileSizeBytes: number;
  sourceFileUpdatedAt: string;
  sourceFiles: CustomerDefectWorkbookCandidate[];
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

export function getCustomerDefectSyncLocalParts(date = new Date()): CustomerDefectSyncLocalParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CUSTOMER_DEFECT_SYNC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? "0"),
  };
}

export function shouldRunCustomerDefectSync(
  now: CustomerDefectSyncLocalParts,
  lastRunDate: string | null,
  syncHour: number,
) {
  return Number.isFinite(now.hour) && now.hour >= syncHour && lastRunDate !== now.dateKey;
}

export function getCustomerDefectPurchasePeriod(period: { startDate: string; endDate: string }) {
  const startYear = period.startDate.slice(0, 4);
  return {
    startDate: `${startYear}-01-01`,
    endDate: period.endDate,
  };
}

export function getCustomerDefectYearPeriods(period: { startDate: string; endDate: string }) {
  const startYear = Number(period.startDate.slice(0, 4));
  const endYear = Number(period.endDate.slice(0, 4));
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || startYear > endYear) {
    return [];
  }

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const yearEnd = `${year}-12-31`;
    return {
      year,
      startDate: `${year}-01-01`,
      endDate: yearEnd > period.endDate ? period.endDate : yearEnd,
    };
  });
}

function mapSnapshotMeta(row: Record<string, unknown>): CustomerDefectSnapshotMeta {
  const sourceFiles = Array.isArray(row.sourceFiles)
    ? row.sourceFiles.map((sourceFile) => ({
        fileName: String((sourceFile as Record<string, unknown>).fileName ?? ""),
        sourcePath: String((sourceFile as Record<string, unknown>).sourcePath ?? ""),
        fileUpdatedAt: toIsoTimestamp((sourceFile as Record<string, unknown>).fileUpdatedAt),
        fileSizeBytes: Number((sourceFile as Record<string, unknown>).fileSizeBytes ?? 0),
      }))
    : [];

  return {
    id: String(row.id),
    sourceFileName: String(row.sourceFileName ?? ""),
    sourceFilePath: String(row.sourceFilePath ?? ""),
    sourceFileUpdatedAt: toIsoTimestamp(row.sourceFileUpdatedAt),
    sourceFileSizeBytes: Number(row.sourceFileSizeBytes ?? 0),
    sourceFiles,
    importedAt: toIsoTimestamp(row.importedAt),
    periodStartDate: String(row.periodStartDate ?? ""),
    periodEndDate: String(row.periodEndDate ?? ""),
    totalRows: Number(row.totalRows ?? 0),
    matchedRows: Number(row.matchedRows ?? 0),
    unmatchedRows: Number(row.unmatchedRows ?? 0),
  };
}

function readRawPayload(row: Record<string, unknown>) {
  const payload = row.raw_payload;
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function mapYearlyBreakdown(value: unknown): CustomerDefectYearBreakdown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const returnRate = row.returnRate;
    return {
      year: Number(row.year ?? 0),
      revenue: Number(row.revenue ?? 0),
      orderCount: Number(row.orderCount ?? 0),
      purchasedPieces: Number(row.purchasedPieces ?? 0),
      returnedPieces: Number(row.returnedPieces ?? 0),
      replacementPieces: Number(row.replacementPieces ?? 0),
      returnedAmount: Number(row.returnedAmount ?? 0),
      returnRate: returnRate === null || returnRate === undefined ? null : Number(returnRate),
      defectSkuCount: Number(row.defectSkuCount ?? 0),
      firstDefectDate: row.firstDefectDate ? String(row.firstDefectDate) : null,
      lastDefectDate: row.lastDefectDate ? String(row.lastDefectDate) : null,
    };
  }).filter((entry) => entry.year > 0);
}

function mapDefectMovementRows(value: unknown): CustomerDefectMovementRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    return {
      defectDate: String(row.defectDate ?? ""),
      returnedPieces: Number(row.returnedPieces ?? 0),
      replacementPieces: Number(row.replacementPieces ?? 0),
      returnedAmount: Number(row.returnedAmount ?? 0),
      sku: row.sku ? String(row.sku) : null,
      description: row.description ? String(row.description) : null,
    };
  }).filter((entry) => entry.defectDate);
}

function mapCustomerDefectRow(row: Record<string, unknown>): CustomerDefectRow {
  const rawPayload = readRawPayload(row);

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
    replacementPieces: Number(row.replacement_pieces ?? 0),
    returnedAmount: Number(row.returned_amount ?? 0),
    returnRate: row.return_rate === null || row.return_rate === undefined ? null : Number(row.return_rate),
    defectSkuCount: Number(row.defect_sku_count ?? 0),
    firstDefectDate: row.first_defect_date ? String(row.first_defect_date) : null,
    lastDefectDate: row.last_defect_date ? String(row.last_defect_date) : null,
    yearlyBreakdown: mapYearlyBreakdown(rawPayload.yearlyBreakdown),
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
    replacementPieces: 0,
    returnedAmount,
    sku,
    description: normalizeText(String(row["Descrição"] ?? row.Descricao ?? "")) || null,
    rawPayload: row,
  };
}

function normalizeHeader(value: unknown) {
  return normalizeText(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isDefectSku(value: unknown) {
  const normalized = normalizeCode(String(value ?? ""));
  return /^\d{3,6}-\d+$/.test(normalized) || normalized === "DIF" || normalized === "USED";
}

function readDefectSku(row: unknown[], startIndex: number) {
  for (let index = startIndex; index < Math.min(row.length, startIndex + 5); index += 1) {
    if (isDefectSku(row[index])) {
      return normalizeCode(String(row[index]));
    }
  }
  return null;
}

function buildRawPayload(headers: unknown[], row: unknown[]) {
  return row.reduce<Record<string, unknown>>((payload, value, index) => {
    const header = normalizeText(String(headers[index] ?? `col_${index + 1}`)) || `col_${index + 1}`;
    payload[header] = value;
    return payload;
  }, {});
}

function detectDefectLayout(headers: unknown[]) {
  const normalized = headers.map(normalizeHeader);
  if (normalized[2] === "CL" && normalized[3] === "DATA" && normalized[4] === "UND.") {
    return "modern" as const;
  }

  if (normalized[1] === "DATA" && normalized[2] === "UND.") {
    return "legacy" as const;
  }

  return "unknown" as const;
}

function isOkModernDefectRow(row: unknown[]) {
  const ok = normalizeText(String(row[1] ?? "")).toUpperCase();
  const status = normalizeText(String(row[13] ?? row[14] ?? "")).toUpperCase();
  return ok === "OK" || status === "OK";
}

function normalizeDefectSourceArrayRow(
  row: unknown[],
  headers: unknown[],
  layout: ReturnType<typeof detectDefectLayout>,
): ParsedCustomerDefectRawRow | null {
  if (layout === "unknown") {
    return null;
  }

  if (layout === "modern" && !isOkModernDefectRow(row)) {
    return null;
  }

  const customerCode = layout === "legacy" ? normalizeCode(String(row[0] ?? "")) : normalizeCode(String(row[2] ?? ""));
  if (!customerCode) {
    return null;
  }

  const defectDate = parseCustomerDefectDate(layout === "legacy" ? row[1] : row[3]);
  if (!defectDate) {
    return null;
  }

  const movementPieces = safeNumber(layout === "legacy" ? row[2] : row[4]);
  if (movementPieces === 0) {
    return null;
  }

  const rawTotal = safeNumber(layout === "legacy" ? row[6] : row[8]);
  const returnedPieces = movementPieces < 0 ? Math.abs(movementPieces) : 0;
  const replacementPieces = movementPieces > 0 ? movementPieces : 0;
  const returnedAmount = movementPieces < 0 ? Math.abs(rawTotal) : 0;
  const sku = readDefectSku(row, layout === "legacy" ? 4 : 6);

  return {
    customerCode,
    sourceDisplayName: normalizeText(String(layout === "legacy" ? row[7] ?? "" : row[9] ?? "")) || null,
    defectDate,
    returnedPieces,
    replacementPieces,
    returnedAmount,
    sku,
    description: normalizeText(String(layout === "legacy" ? row[3] ?? "" : row[5] ?? "")) || null,
    rawPayload: buildRawPayload(headers, row),
  };
}

function emptyAggregate(row: ParsedCustomerDefectRawRow): ParsedCustomerDefectAggregate {
  return {
    customerCode: row.customerCode,
    sourceDisplayName: row.sourceDisplayName,
    returnedPieces: 0,
    replacementPieces: 0,
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
    current.replacementPieces += row.replacementPieces;
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
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet!, {
    header: 1,
    defval: null,
    raw: false,
  });
  const headers = rawRows[0] ?? [];
  const layout = detectDefectLayout(headers);
  const rows = rawRows
    .slice(1)
    .map((row) => normalizeDefectSourceArrayRow(row, headers, layout))
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
    sourceFiles: [
      {
        fullPath: filePath,
        sourcePath,
        fileName: candidate?.fileName ?? path.basename(filePath),
        fileSizeBytes: candidate?.fileSizeBytes ?? stat.size,
        fileUpdatedAt: candidate?.fileUpdatedAt ?? stat.mtime.toISOString(),
      },
    ],
    period: dates.length ? { startDate: dates[0]!, endDate: dates[dates.length - 1]! } : null,
    totalValidRows: rows.length,
    rowsByCode,
  };
}

export async function parseCustomerDefectWorkbooks(
  candidates: CustomerDefectWorkbookCandidate[],
): Promise<ParsedCustomerDefectWorkbook> {
  if (!candidates.length) {
    throw new HttpError(500, "Nenhuma planilha de defeitos foi encontrada para consolidar.");
  }

  const parsedWorkbooks = await Promise.all(
    candidates.map((candidate) => parseCustomerDefectWorkbook(candidate.fullPath, candidate.sourcePath, candidate)),
  );
  const rawRows = parsedWorkbooks.flatMap((workbook) => Array.from(workbook.rowsByCode.values()).flatMap((row) => row.rawRows));
  const rowsByCode = aggregateDefectRows(rawRows);
  const dates = rawRows.map((row) => row.defectDate).sort();
  const sourceFiles = parsedWorkbooks.flatMap((workbook) => workbook.sourceFiles);
  const latestSource = [...sourceFiles].sort((left, right) => right.fileUpdatedAt.localeCompare(left.fileUpdatedAt))[0]!;
  const fileSizeBytes = sourceFiles.reduce((sum, sourceFile) => sum + sourceFile.fileSizeBytes, 0);
  const sheetNames = Array.from(new Set(parsedWorkbooks.flatMap((workbook) => workbook.sheetNames)));

  return {
    candidate: {
      fullPath: latestSource.fullPath,
      sourcePath: sourceFiles.map((sourceFile) => sourceFile.sourcePath).join(";"),
      fileName: `${sourceFiles.length} planilhas de defeitos`,
      fileSizeBytes,
      fileUpdatedAt: latestSource.fileUpdatedAt,
    },
    sheetNames,
    sourceFiles,
    period: dates.length ? { startDate: dates[0]!, endDate: dates[dates.length - 1]! } : null,
    totalValidRows: rawRows.length,
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
        source_files_metadata AS "sourceFiles",
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

function isCustomerDefectWorkbookName(fileName: string, marker = CUSTOMER_DEFECT_WORKBOOK_NAME_MARKER) {
  return (
    fileName.toLowerCase().endsWith(".xlsx") &&
    normalizeText(fileName).toLowerCase().includes(normalizeText(marker).toLowerCase())
  );
}

async function listLocalCustomerDefectWorkbooks(directory: string, marker = CUSTOMER_DEFECT_WORKBOOK_NAME_MARKER) {
  const directories = [directory, path.join(directory, "Antigos")];
  const candidates: CustomerDefectWorkbookCandidate[] = [];

  for (const sourceDirectory of directories) {
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !isCustomerDefectWorkbookName(entry.name, marker)) {
        continue;
      }

      const fullPath = path.join(sourceDirectory, entry.name);
      const stat = await fs.stat(fullPath);
      candidates.push({
        fullPath,
        sourcePath: fullPath,
        fileName: entry.name,
        fileSizeBytes: stat.size,
        fileUpdatedAt: stat.mtime.toISOString(),
      });
    }
  }

  return candidates.sort((left, right) => left.fileName.localeCompare(right.fileName, "pt-BR"));
}

async function listDropboxCustomerDefectWorkbooks(marker = CUSTOMER_DEFECT_WORKBOOK_NAME_MARKER) {
  const basePath = env.DROPBOX_CUSTOMER_DEFECT_PATH.replace(/\/+$/, "");
  const folders = [basePath, `${basePath}/Antigos`];
  const files: CustomerDefectWorkbookCandidate[] = [];

  for (const folder of folders) {
    let entries: Awaited<ReturnType<typeof listDropboxFiles>>;
    try {
      entries = await listDropboxFiles(folder);
    } catch (error) {
      logger.warn("failed to list customer defect Dropbox folder", { folder, error: String(error) });
      continue;
    }

    const candidates = entries
      .filter((entry): entry is any => entry[".tag"] === "file")
      .filter((entry) => isCustomerDefectWorkbookName(entry.name, marker));

    for (const entry of candidates) {
      const downloaded = await downloadFileByPath(entry.path_display ?? entry.path_lower);
      files.push({
        fullPath: downloaded.localPath,
        sourcePath: downloaded.sourcePath,
        fileName: downloaded.fileName,
        fileSizeBytes: downloaded.fileSizeBytes,
        fileUpdatedAt: downloaded.fileUpdatedAt,
        isTemp: true,
      });
    }
  }

  return files.sort((left, right) => left.fileName.localeCompare(right.fileName, "pt-BR"));
}

export async function findCustomerDefectWorkbooks(
  directory = env.CUSTOMER_DEFECT_WORKBOOK_DIR,
  marker = CUSTOMER_DEFECT_WORKBOOK_NAME_MARKER,
): Promise<CustomerDefectWorkbookCandidate[]> {
  const canUseDropbox =
    directory === env.CUSTOMER_DEFECT_WORKBOOK_DIR &&
    Boolean(env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY));

  if (canUseDropbox) {
    const dropboxFiles = await listDropboxCustomerDefectWorkbooks(marker);
    if (dropboxFiles.length) {
      return dropboxFiles;
    }
  }

  return listLocalCustomerDefectWorkbooks(directory, marker);
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
  yearlyBreakdownByCode = new Map<string, CustomerDefectYearBreakdown[]>(),
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
      yearlyBreakdown: yearlyBreakdownByCode.get(row.customerCode) ?? [],
    };
  });
}

function toYearBreakdown(year: number, row: ResolvedCustomerDefectRow): CustomerDefectYearBreakdown {
  return {
    year,
    revenue: row.revenue,
    orderCount: row.orderCount,
    purchasedPieces: row.purchasedPieces,
    returnedPieces: row.returnedPieces,
    replacementPieces: row.replacementPieces,
    returnedAmount: row.returnedAmount,
    returnRate: row.returnRate,
    defectSkuCount: row.defectSkuCount,
    firstDefectDate: row.firstDefectDate,
    lastDefectDate: row.lastDefectDate,
  };
}

async function buildCustomerDefectYearlyBreakdown(
  parsedRows: ParsedCustomerDefectAggregate[],
  matches: Map<string, CustomerDefectMatch>,
  period: { startDate: string; endDate: string },
) {
  const breakdownByCode = new Map<string, CustomerDefectYearBreakdown[]>();
  const rawRows = parsedRows.flatMap((row) => row.rawRows);

  for (const yearPeriod of getCustomerDefectYearPeriods(period)) {
    const yearRows = aggregateDefectRows(
      rawRows.filter((row) => Number(row.defectDate.slice(0, 4)) === yearPeriod.year),
    );
    const aggregates = Array.from(yearRows.values());
    if (!aggregates.length) {
      continue;
    }

    const purchaseStats = await loadPurchaseStats(buildRowLookup(aggregates), yearPeriod);
    const resolvedRows = buildCustomerDefectRows(aggregates, matches, purchaseStats);
    for (const row of resolvedRows) {
      const entries = breakdownByCode.get(row.customerCode) ?? [];
      entries.push(toYearBreakdown(yearPeriod.year, row));
      breakdownByCode.set(row.customerCode, entries);
    }
  }

  return breakdownByCode;
}

type CustomerDefectSummaryRow = Pick<
  ResolvedCustomerDefectRow,
  "matched" | "revenue" | "purchasedPieces" | "returnedPieces" | "replacementPieces" | "returnedAmount" | "returnRate"
>;

export function buildCustomerDefectOverviewSummary(rows: CustomerDefectSummaryRow[]): CustomerDefectOverviewSummary {
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalPurchasedPieces = rows.reduce((sum, row) => sum + row.purchasedPieces, 0);
  const totalReturnedPieces = rows.reduce((sum, row) => sum + row.returnedPieces, 0);
  const totalReplacementPieces = rows.reduce((sum, row) => sum + row.replacementPieces, 0);
  const totalReturnedAmount = rows.reduce((sum, row) => sum + row.returnedAmount, 0);
  const overallReturnRate = totalPurchasedPieces > 0 ? totalReturnedPieces / totalPurchasedPieces : null;

  return {
    totalCustomers: rows.length,
    matchedCustomers: rows.filter((row) => row.matched).length,
    unmatchedCustomers: rows.filter((row) => !row.matched).length,
    totalRevenue,
    totalPurchasedPieces,
    totalReturnedPieces,
    totalReplacementPieces,
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

function customerDefectMatchedCustomersCte(customerCodesParam: string) {
  const displayNameSql = "UPPER(COALESCE(NULLIF(s.display_name, ''), c.display_name, ''))";

  return `
    input_customer_codes AS (
      SELECT DISTINCT UPPER(TRIM(value)) AS customer_code
      FROM unnest(${customerCodesParam}::text[]) AS input(value)
      WHERE TRIM(value) <> ''
    ),
    matched_customer_candidates AS (
      SELECT
        ic.customer_code AS defect_customer_code,
        c.id,
        COALESCE(NULLIF(s.display_name, ''), c.display_name, c.customer_code) AS display_name,
        c.updated_at,
        CASE
          WHEN UPPER(c.customer_code) = ic.customer_code THEN 0
          WHEN ${displayNameSql} LIKE ic.customer_code || ' -%' THEN 1
          WHEN ${displayNameSql} LIKE ic.customer_code || '-%' THEN 2
          WHEN ${displayNameSql} LIKE ic.customer_code || ' %' THEN 3
          ELSE 4
        END AS match_rank
      FROM input_customer_codes ic
      JOIN customers c ON TRUE
      LEFT JOIN customer_snapshot s ON s.customer_id = c.id
      WHERE UPPER(c.customer_code) = ic.customer_code
         OR ${displayNameSql} LIKE ic.customer_code || ' -%'
         OR ${displayNameSql} LIKE ic.customer_code || '-%'
         OR ${displayNameSql} LIKE ic.customer_code || ' %'
    ),
    matched_customers AS (
      SELECT DISTINCT ON (defect_customer_code)
        defect_customer_code,
        id,
        display_name
      FROM matched_customer_candidates
      ORDER BY defect_customer_code, match_rank, updated_at DESC NULLS LAST
    )
  `;
}

async function resolveCustomerMatches(rows: ParsedCustomerDefectAggregate[]) {
  const customerCodes = buildRowLookup(rows);
  if (!customerCodes.length) {
    return new Map<string, CustomerDefectMatch>();
  }

  const result = await pool.query(
    `
      WITH ${customerDefectMatchedCustomersCte("$1")}
      SELECT defect_customer_code, id, display_name
      FROM matched_customers
    `,
    [customerCodes],
  );

  return new Map(
    result.rows.map((row) => [
      String(row.defect_customer_code),
      {
        id: String(row.id),
        displayName: String(row.display_name ?? row.defect_customer_code ?? ""),
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
      WITH ${customerDefectMatchedCustomersCte("$1")},
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
        mc.defect_customer_code AS customer_code,
        COUNT(op.id)::int AS order_count,
        COALESCE(SUM(op.total_amount), 0)::numeric(14, 2) AS revenue,
        COALESCE(SUM(opt.purchased_pieces), 0)::numeric(14, 2) AS purchased_pieces
      FROM matched_customers mc
      LEFT JOIN orders_in_period op ON op.customer_id = mc.id
      LEFT JOIN order_piece_totals opt ON opt.order_id = op.id
      GROUP BY mc.defect_customer_code
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
        sourceFiles: workbook.sourceFiles,
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
    replacement_pieces: row.replacementPieces,
    returned_amount: row.returnedAmount,
    return_rate: row.returnRate,
    defect_sku_count: row.defectSkuCount,
    first_defect_date: row.firstDefectDate,
    last_defect_date: row.lastDefectDate,
    raw_payload: {
      sourceDisplayName: row.sourceDisplayName,
      defectRowCount: row.rawRows.length,
      defectSkuCount: row.defectSkuCount,
      yearlyBreakdown: row.yearlyBreakdown,
      defectRows: row.rawRows
        .map((rawRow) => ({
          defectDate: rawRow.defectDate,
          returnedPieces: rawRow.returnedPieces,
          replacementPieces: rawRow.replacementPieces,
          returnedAmount: rawRow.returnedAmount,
          sku: rawRow.sku,
          description: rawRow.description,
        }))
        .sort((left, right) => right.defectDate.localeCompare(left.defectDate)),
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
          replacement_pieces,
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
          COALESCE(entry.replacement_pieces, 0)::numeric(14, 2),
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
          replacement_pieces numeric,
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
          source_files_metadata,
          parser_version,
          period_start_date,
          period_end_date,
          total_rows,
          matched_rows,
          unmatched_rows,
          imported_at,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), TRUE)
        RETURNING
          id,
          source_file_id AS "sourceFileId",
          source_file_path AS "sourceFilePath",
          source_file_name AS "sourceFileName",
          source_file_size_bytes AS "sourceFileSizeBytes",
          source_file_updated_at::text AS "sourceFileUpdatedAt",
          source_files_metadata AS "sourceFiles",
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
        JSON.stringify(workbook.sourceFiles.map((sourceFile) => ({
          fileName: sourceFile.fileName,
          sourcePath: sourceFile.sourcePath,
          fileSizeBytes: sourceFile.fileSizeBytes,
          fileUpdatedAt: sourceFile.fileUpdatedAt,
        }))),
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
        replacement_pieces,
        returned_amount,
        return_rate,
        defect_sku_count,
        first_defect_date::text AS first_defect_date,
        last_defect_date::text AS last_defect_date,
        raw_payload
      FROM customer_defect_snapshot_rows
      WHERE snapshot_id = $1
      ORDER BY return_rate DESC NULLS LAST, returned_pieces DESC, revenue DESC, customer_display_name ASC
    `,
    [snapshotId],
  );

  return result.rows.map((row) => mapCustomerDefectRow(row));
}

export async function getCustomerDefectCustomerDetail(customerCode: string): Promise<CustomerDefectCustomerDetailResponse> {
  const normalizedCode = normalizeCode(customerCode);
  if (!normalizedCode) {
    throw new HttpError(400, "Codigo do cliente invalido.");
  }

  const snapshot = await ensureCustomerDefectSnapshot(false);
  if (!snapshot) {
    throw new HttpError(404, "Snapshot de defeitos nao encontrado.");
  }

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
        replacement_pieces,
        returned_amount,
        return_rate,
        defect_sku_count,
        first_defect_date::text AS first_defect_date,
        last_defect_date::text AS last_defect_date,
        raw_payload
      FROM customer_defect_snapshot_rows
      WHERE snapshot_id = $1
        AND customer_code = $2
      LIMIT 1
    `,
    [snapshot.id, normalizedCode],
  );

  const record = result.rows[0] as Record<string, unknown> | undefined;
  if (!record) {
    throw new HttpError(404, "Cliente nao encontrado no snapshot de defeitos.");
  }

  const rawPayload = readRawPayload(record);
  return {
    snapshot,
    row: mapCustomerDefectRow(record),
    defectRows: mapDefectMovementRows(rawPayload.defectRows),
  };
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
      totalReplacementPieces: 0,
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

function sourceFilesMatch(
  activeSnapshot: SnapshotMetaRecord,
  candidates: CustomerDefectWorkbookCandidate[],
) {
  const activeFiles = Array.isArray(activeSnapshot.sourceFiles) ? activeSnapshot.sourceFiles : [];
  if (activeFiles.length !== candidates.length) {
    return false;
  }

  const signature = (sourceFile: Pick<CustomerDefectWorkbookCandidate, "sourcePath" | "fileSizeBytes" | "fileUpdatedAt">) =>
    `${sourceFile.sourcePath}|${sourceFile.fileSizeBytes}|${toIsoTimestamp(sourceFile.fileUpdatedAt)}`;
  const activeSignatures = activeFiles.map(signature).sort();
  const candidateSignatures = candidates.map(signature).sort();
  return activeSignatures.every((activeSignature, index) => activeSignature === candidateSignatures[index]);
}

async function refreshSnapshotInternal(forceRefresh = false) {
  const activeSnapshot = await getActiveSnapshotRecord();
  let defectWorkbooks: CustomerDefectWorkbookCandidate[] = [];

  try {
    defectWorkbooks = await findCustomerDefectWorkbooks();
  } catch (error) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("failed to scan customer defect workbook source, using cached snapshot", { error: String(error) });
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }
    throw error;
  }

  if (!defectWorkbooks.length) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("customer defect workbook not found, using cached snapshot");
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }

    const isDropboxConfigured = Boolean(env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY));
    const locationInfo = isDropboxConfigured
      ? `no Dropbox (caminhos: ${env.DROPBOX_CUSTOMER_DEFECT_PATH} e ${env.DROPBOX_CUSTOMER_DEFECT_PATH}/Antigos)`
      : `na pasta local (caminhos: ${env.CUSTOMER_DEFECT_WORKBOOK_DIR} e Antigos)`;

    throw new HttpError(
      500,
      `Nao encontrei nenhuma planilha contendo "${CUSTOMER_DEFECT_WORKBOOK_NAME_MARKER}" ${locationInfo}.`,
    );
  }

  if (
    activeSnapshot &&
    !forceRefresh &&
    Number(activeSnapshot.parserVersion ?? 0) === CUSTOMER_DEFECT_PARSER_VERSION &&
    sourceFilesMatch(activeSnapshot, defectWorkbooks)
  ) {
    await Promise.all(defectWorkbooks.filter((workbook) => workbook.isTemp).map((workbook) => cleanupTempFile(workbook.fullPath)));
    return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
  }

  try {
    const workbook = await parseCustomerDefectWorkbooks(defectWorkbooks);
    if (!workbook.period || workbook.rowsByCode.size === 0) {
      if (activeSnapshot && !forceRefresh) {
        logger.warn("customer defect workbook parsed with zero valid rows, using cached snapshot");
        return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
      }

      throw new HttpError(500, "A planilha de defeitos nao trouxe linhas validas.");
    }

    const parsedRows = Array.from(workbook.rowsByCode.values());
    const matches = await resolveCustomerMatches(parsedRows);
    const yearlyBreakdownByCode = await buildCustomerDefectYearlyBreakdown(parsedRows, matches, workbook.period);
    const stats = await loadPurchaseStats(buildRowLookup(parsedRows), getCustomerDefectPurchasePeriod(workbook.period));
    const rows = sortCustomerDefectRows(buildCustomerDefectRows(parsedRows, matches, stats, yearlyBreakdownByCode));
    return persistSnapshot(workbook, rows);
  } finally {
    await Promise.all(defectWorkbooks.filter((workbook) => workbook.isTemp).map((workbook) => cleanupTempFile(workbook.fullPath)));
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

async function getLastDailyCustomerDefectSyncDate() {
  const result = await pool.query<{ cursor_value: string }>(
    "SELECT cursor_value FROM sync_cursors WHERE key = $1",
    [CUSTOMER_DEFECT_DAILY_SYNC_CURSOR_KEY],
  );
  return result.rows[0]?.cursor_value ?? null;
}

async function claimDailyCustomerDefectSync(dateKey: string): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [CUSTOMER_DEFECT_DAILY_SYNC_LOCK_NS, 1]);

    const result = await client.query<{ cursor_value: string }>(
      "SELECT cursor_value FROM sync_cursors WHERE key = $1 FOR UPDATE",
      [CUSTOMER_DEFECT_DAILY_SYNC_CURSOR_KEY],
    );

    if (result.rows[0]?.cursor_value === dateKey) {
      await client.query("COMMIT");
      return false;
    }

    await client.query(
      `
        INSERT INTO sync_cursors (key, cursor_value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE
        SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
      `,
      [CUSTOMER_DEFECT_DAILY_SYNC_CURSOR_KEY, dateKey],
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function startDailyCustomerDefectSyncScheduler() {
  if (!env.WORKER_DEFECT_SYNC_ENABLED) {
    logger.info("customer defect daily sync scheduler disabled");
    return {
      async close() {
        return;
      },
    };
  }

  const check = async () => {
    try {
      const now = getCustomerDefectSyncLocalParts();
      const lastRunDate = await getLastDailyCustomerDefectSyncDate();
      if (!shouldRunCustomerDefectSync(now, lastRunDate, env.WORKER_DEFECT_SYNC_HOUR)) {
        return;
      }

      const claimed = await claimDailyCustomerDefectSync(now.dateKey);
      if (!claimed) {
        return;
      }

      logger.info("customer defect daily sync started", { dateKey: now.dateKey });
      await refreshCustomerDefectOverview();
      logger.info("customer defect daily sync completed", { dateKey: now.dateKey });
    } catch (error) {
      logger.error("customer defect daily sync failed", { error: String(error) });
    }
  };

  const interval = setInterval(check, CUSTOMER_DEFECT_SYNC_CHECK_INTERVAL_MS);
  void check();

  logger.info("customer defect daily sync scheduler initialized", {
    hour: env.WORKER_DEFECT_SYNC_HOUR,
    timezone: CUSTOMER_DEFECT_SYNC_TIMEZONE,
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}

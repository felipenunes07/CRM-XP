import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import type { PoolClient } from "pg";
import type {
  CustomerCreditDetailResponse,
  CustomerCreditOperationalState,
  CustomerCreditOverviewResponse,
  CustomerCreditOverviewSummary,
  CustomerCreditRiskLevel,
  CustomerCreditRow,
  CustomerCreditSnapshotMeta,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber } from "../../lib/normalize.js";

const CUSTOMER_CREDIT_SOURCE_TYPE = "customer_credit_xlsx";
const CUSTOMER_CREDIT_SHEET_NAME = "RESUMO";
const CUSTOMER_CREDIT_LOCK_NS = 8201;
const CUSTOMER_CREDIT_LOCK_KEY = 1;
const CUSTOMER_CREDIT_PARSER_VERSION = 6;
const RISK_PRIORITY: Record<CustomerCreditRiskLevel, number> = {
  CRITICO: 0,
  ATENCAO: 1,
  MONITORAR: 2,
  OK: 3,
};
const STATE_PRIORITY: Record<CustomerCreditOperationalState, number> = {
  OVER_CREDIT: 0,
  OWES: 1,
  UNUSED_CREDIT: 2,
  HAS_CREDIT_BALANCE: 3,
  SETTLED: 4,
};

const FLAG_COLUMN_LABELS = [
  { key: "Ultrapassou Crédito", label: "Ultrapassou Crédito" },
  { key: "Pagamento Vencido", label: "Pagamento Vencido" },
  { key: "Pagamento Muito Vencido (diferença > 20)", label: "Pagamento Muito Vencido" },
  { key: "Nunca pagou", label: "Sem Pagamento" },
  { key: "Nunca pediu", label: "Sem Pedido" },
  { key: " Sem crédito e dívida >1000 ", label: "Cliente deve e não tem Crédito" },
  { key: "Crédito negativo", label: "Crédito negativo" },
  { key: "Deve além do crédito", label: "Deve além do crédito" },
  { key: "Pagamento anterior ao pedido >20 dias", label: "Pagamento anterior ao pedido >20 dias" },
] as const;

export interface CustomerCreditWorkbookCandidate {
  fullPath: string;
  fileName: string;
  fileSizeBytes: number;
  fileUpdatedAt: string;
}

export interface ParsedCustomerCreditRow {
  customerCode: string;
  sourceDisplayName: string | null;
  balanceAmount: number;
  debtAmount: number;
  creditBalanceAmount: number;
  creditLimit: number;
  availableCreditAmount: number;
  withinCreditLimit: boolean;
  operationalState: CustomerCreditOperationalState;
  riskLevel: CustomerCreditRiskLevel;
  observation: string;
  lastOrderDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastOrder: number | null;
  daysSinceLastPayment: number | null;
  paymentTerm: number | null;
  riskScore: number | null;
  flags: string[];
  hasOverCredit: boolean;
  hasOverduePayment: boolean;
  hasSeverelyOverduePayment: boolean;
  hasNoPayment: boolean;
  hasNoOrder: boolean;
  hasNegativeCredit: boolean;
  hasDebtWithoutCredit: boolean;
  rawPayload: Record<string, unknown>;
}

export interface ParsedCustomerCreditWorkbook {
  candidate: CustomerCreditWorkbookCandidate;
  sheetNames: string[];
  rows: ParsedCustomerCreditRow[];
}

interface ResolvedCustomerCreditRow extends ParsedCustomerCreditRow {
  customerId: string | null;
  customerDisplayName: string;
}

interface SnapshotMetaRecord {
  id: string;
  sourceFileId: string | null;
  sourceFilePath: string;
  sourceFileName: string;
  sourceFileSizeBytes: number;
  sourceFileUpdatedAt: string;
  parserVersion: number;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  importedAt: string;
}

let activeSnapshotPromise: Promise<CustomerCreditSnapshotMeta | null> | null = null;

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

function emptySummary(): CustomerCreditOverviewSummary {
  return {
    totalLinkedCustomers: 0,
    totalUnmatchedRows: 0,
    totalDebtAmount: 0,
    totalCreditBalanceAmount: 0,
    customersOwing: 0,
    customersWithCreditLimit: 0,
    customersWithUnusedCredit: 0,
    customersCritical: 0,
    customersAttention: 0,
    customersMonitoring: 0,
    customersOverCredit: 0,
    customersOverdue: 0,
  };
}

function mapSnapshotMeta(row: Record<string, unknown>): CustomerCreditSnapshotMeta {
  return {
    id: String(row.id),
    sourceFileName: String(row.sourceFileName ?? ""),
    sourceFilePath: String(row.sourceFilePath ?? ""),
    sourceFileUpdatedAt: toIsoTimestamp(row.sourceFileUpdatedAt),
    sourceFileSizeBytes: Number(row.sourceFileSizeBytes ?? 0),
    importedAt: toIsoTimestamp(row.importedAt),
    totalRows: Number(row.totalRows ?? 0),
    matchedRows: Number(row.matchedRows ?? 0),
    unmatchedRows: Number(row.unmatchedRows ?? 0),
  };
}

function normalizeRiskLevel(value: unknown): CustomerCreditRiskLevel {
  const normalized = normalizeHeaderLookup(String(value ?? ""));
  if (normalized.includes("crit")) {
    return "CRITICO";
  }
  if (normalized.includes("aten")) {
    return "ATENCAO";
  }
  if (normalized.includes("monitor")) {
    return "MONITORAR";
  }
  return "OK";
}

function parseNullableInteger(value: unknown) {
  const normalized = normalizeText(String(value ?? ""));
  if (!normalized) {
    return null;
  }

  const parsed = safeNumber(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

export function parseCustomerCreditDate(value: unknown) {
  const normalized = normalizeText(String(value ?? ""));
  if (!normalized) {
    return null;
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (!month || !day || !year) {
      return null;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function hasTruthyFlagValue(value: unknown) {
  const normalized = normalizeText(String(value ?? ""));
  return Boolean(normalized && normalized !== "0");
}

function collectFlags(row: Record<string, unknown>, observation: string) {
  const flags = new Set<string>();

  for (const item of FLAG_COLUMN_LABELS) {
    if (hasTruthyFlagValue(row[item.key])) {
      flags.add(item.label);
    }
  }

  observation
    .split(",")
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .forEach((entry) => flags.add(entry));

  return Array.from(flags);
}

function normalizeComparableText(value: string) {
  const repaired =
    /[ÃÂâå]/.test(value) && !/[\u4e00-\u9fff]/.test(value)
      ? Buffer.from(value, "latin1").toString("utf8")
      : value;

  return normalizeText(repaired)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesNormalizedFlag(flags: string[], fragment: string) {
  const normalizedFragment = normalizeComparableText(fragment);
  return flags.some((flag) => normalizeComparableText(flag).includes(normalizedFragment));
}

function normalizeHeaderLookup(value: string) {
  return normalizeComparableText(value).replace(/\?/g, "");
}

function readWorkbookValue(row: Record<string, unknown>, exactKey: string, fragments: string[] = []) {
  if (row[exactKey] !== undefined) {
    return row[exactKey];
  }

  const match = Object.entries(row).find(([key]) => {
    const normalizedKey = normalizeHeaderLookup(key);
    return fragments.every((fragment) => normalizedKey.includes(normalizeHeaderLookup(fragment)));
  });

  return match?.[1];
}

function getDebtAmount(balanceAmount: number) {
  return balanceAmount < 0 ? Math.abs(balanceAmount) : 0;
}

function getCreditBalanceAmount(balanceAmount: number) {
  return balanceAmount > 0 ? balanceAmount : 0;
}

function getAvailableCreditAmount(balanceAmount: number, creditLimit: number) {
  if (creditLimit <= 0) {
    return 0;
  }

  return creditLimit - getDebtAmount(balanceAmount);
}

function isOverCreditSignal(flag: string) {
  const comparable = normalizeComparableText(flag);
  return comparable.includes("ultrapassou credito") || comparable.includes("deve alem do credito");
}

function sanitizeCreditFlags(flags: string[], hasOverCredit: boolean) {
  const sanitized = flags.filter((flag) => hasOverCredit || !isOverCreditSignal(flag));

  if (hasOverCredit && !sanitized.some((flag) => isOverCreditSignal(flag))) {
    sanitized.unshift("Ultrapassou Credito");
  }

  return sanitized;
}

function sanitizeCreditObservation(observation: string, hasOverCredit: boolean) {
  if (!observation) {
    return observation;
  }

  const parts = observation
    .split(",")
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .filter((entry) => hasOverCredit || !isOverCreditSignal(entry));

  return parts.join(", ");
}

function isActuallyOverCredit(balanceAmount: number, creditLimit: number) {
  return creditLimit > 0 && getDebtAmount(balanceAmount) > creditLimit;
}

export function deriveCustomerCreditOperationalState(input: {
  balanceAmount: number;
  creditLimit: number;
  hasOverCredit: boolean;
}): CustomerCreditOperationalState {
  const debtAmount = getDebtAmount(input.balanceAmount);

  if (input.hasOverCredit) {
    return "OVER_CREDIT";
  }

  if (debtAmount > 0) {
    return "OWES";
  }

  if (input.creditLimit > 0) {
    return "UNUSED_CREDIT";
  }

  if (input.balanceAmount > 0) {
    return "HAS_CREDIT_BALANCE";
  }

  return "SETTLED";
}

function normalizeWorkbookRow(row: Record<string, unknown>): ParsedCustomerCreditRow | null {
  const customerCode = normalizeCode(String(row.COD ?? ""));
  if (!customerCode) {
    return null;
  }

  // Skip internal/system accounts (e.g. PP13, PP汇款6, PP汇款8).
  if (customerCode.toUpperCase().startsWith("PP")) {
    return null;
  }

  const sourceDisplayName = normalizeText(String(row["客户"] ?? "")) || null;
  const balanceAmount = safeNumber(row[" Devedor/未付 "]);
  const creditLimit = safeNumber(row[" CREDITO "]);
  const rawObservation = normalizeText(String(row.OBS ?? ""));
  const riskLevel = normalizeRiskLevel(row[" Grau de risco "] ?? row["Grau de Risco"]);
  const resolvedBalanceAmount = safeNumber(readWorkbookValue(row, " Devedor/æœªä»˜ ", ["devedor/"]));
  const resolvedLastOrderDate = parseCustomerCreditDate(
    readWorkbookValue(row, "Ãšltima data de pedido", ["data de pedido"]),
  );
  const resolvedLastPaymentDate = parseCustomerCreditDate(
    readWorkbookValue(row, "Ãšltima data de pagamento", ["data de pagamento"]),
  );
  const resolvedDaysSinceLastOrder = parseNullableInteger(
    readWorkbookValue(row, "Dias desde Ãºltimo pedido", ["dias desde", "pedido"]),
  );
  const resolvedDaysSinceLastPayment = parseNullableInteger(
    readWorkbookValue(row, "Dias desde Ãºltimo pagamento", ["dias desde", "pagamento"]),
  );
  const resolvedPaymentTerm = parseNullableInteger(readWorkbookValue(row, " PRAZO ", ["prazo"]));
  const resolvedRiskScore = parseNullableInteger(
    readWorkbookValue(row, "PontuaÃ§Ã£o de Risco", ["pontuacao", "risco"]),
  );
  const debtAmount = getDebtAmount(resolvedBalanceAmount);
  const creditBalanceAmount = getCreditBalanceAmount(resolvedBalanceAmount);
  const withinCreditLimit = debtAmount > 0 && creditLimit > 0 && debtAmount <= creditLimit;
  const hasOverCredit = isActuallyOverCredit(resolvedBalanceAmount, creditLimit);
  const observation = sanitizeCreditObservation(rawObservation, hasOverCredit);
  const rawFlags = sanitizeCreditFlags(collectFlags(row, rawObservation), hasOverCredit);

  // When the client has no debt, suppress debt-related flags — they are historical
  // artifacts from the Excel that no longer reflect the client's current situation.
  // This covers both zero-balance clients AND clients with saldo a favor.
  const hasNoDebt = debtAmount === 0;
  const flags = hasNoDebt
    ? rawFlags.filter((flag) => {
        const comparable = normalizeComparableText(flag);
        return (
          !comparable.includes("pagamento vencido") &&
          !comparable.includes("pagamento muito vencido") &&
          !comparable.includes("sem pagamento") &&
          !comparable.includes("ultrapassou credito") &&
          !comparable.includes("deve alem do credito") &&
          !comparable.includes("cliente deve e nao tem credito") &&
          !comparable.includes("credito negativo")
        );
      })
    : rawFlags;

  const _overCreditSignal =
    includesNormalizedFlag(flags, "ultrapassou crédito") || includesNormalizedFlag(flags, "deve além do crédito");
  const hasOverduePayment = includesNormalizedFlag(flags, "pagamento vencido");
  const hasSeverelyOverduePayment = includesNormalizedFlag(flags, "pagamento muito vencido");
  const hasNoPayment = includesNormalizedFlag(flags, "sem pagamento");
  const hasNoOrder = includesNormalizedFlag(flags, "sem pedido");
  const hasNegativeCredit = includesNormalizedFlag(flags, "crédito negativo");
  const hasDebtWithoutCredit = includesNormalizedFlag(flags, "cliente deve e não tem crédito");
  const operationalState = deriveCustomerCreditOperationalState({
    balanceAmount: resolvedBalanceAmount,
    creditLimit,
    hasOverCredit,
  });

  // Derive a consistent risk level from the actual financial state, overriding the
  // Excel when the raw value contradicts the numbers.
  let resolvedRiskLevel: CustomerCreditRiskLevel = riskLevel;
  if (hasNoDebt) {
    // Client owes nothing — stale flags shouldn't inflate risk.
    resolvedRiskLevel = "OK";
  } else if (hasOverCredit) {
    // Client exceeded their credit limit — always critical.
    resolvedRiskLevel = "CRITICO";
  } else if (hasDebtWithoutCredit && riskLevel === "OK") {
    // Client has debt but no credit limit — at least attention.
    resolvedRiskLevel = "ATENCAO";
  } else if ((hasOverduePayment || hasSeverelyOverduePayment) && riskLevel === "OK") {
    // Client has overdue payments but Excel says OK — at least attention.
    resolvedRiskLevel = "ATENCAO";
  }

  return {
    customerCode,
    sourceDisplayName,
    balanceAmount: resolvedBalanceAmount,
    debtAmount,
    creditBalanceAmount,
    creditLimit,
    availableCreditAmount: getAvailableCreditAmount(resolvedBalanceAmount, creditLimit),
    withinCreditLimit,
    operationalState,
    riskLevel: resolvedRiskLevel,
    observation,
    /*
    lastOrderDate: parseCustomerCreditDate(row["Última data de pedido"]),
    lastPaymentDate: parseCustomerCreditDate(row["Última data de pagamento"]),
    daysSinceLastOrder: parseNullableInteger(row["Dias desde último pedido"]),
    daysSinceLastPayment: parseNullableInteger(row["Dias desde último pagamento"]),
    riskScore: parseNullableInteger(row["Pontuação de Risco"]),
    */
    lastOrderDate: resolvedLastOrderDate,
    lastPaymentDate: resolvedLastPaymentDate,
    daysSinceLastOrder: resolvedDaysSinceLastOrder,
    daysSinceLastPayment: resolvedDaysSinceLastPayment,
    paymentTerm: resolvedPaymentTerm,
    riskScore: resolvedRiskScore,
    flags,
    hasOverCredit,
    hasOverduePayment,
    hasSeverelyOverduePayment,
    hasNoPayment,
    hasNoOrder,
    hasNegativeCredit,
    hasDebtWithoutCredit,
    rawPayload: row,
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
        total_rows AS "totalRows",
        matched_rows AS "matchedRows",
        unmatched_rows AS "unmatchedRows",
        imported_at::text AS "importedAt"
      FROM customer_credit_snapshots
      WHERE is_active = TRUE
      ORDER BY imported_at DESC
      LIMIT 1
    `,
  );

  return (result.rows[0] as SnapshotMetaRecord | undefined) ?? null;
}

export async function findLatestCustomerCreditWorkbookInDirectory(
  directory = env.CUSTOMER_CREDIT_WORKBOOK_DIR,
  prefix = env.CUSTOMER_CREDIT_WORKBOOK_PREFIX,
): Promise<CustomerCreditWorkbookCandidate | null> {
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
          fileName: entry.name,
          fileSizeBytes: stat.size,
          fileUpdatedAt: stat.mtime.toISOString(),
        } satisfies CustomerCreditWorkbookCandidate;
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

export async function parseCustomerCreditWorkbook(filePath: string): Promise<ParsedCustomerCreditWorkbook> {
  const stat = await fs.stat(filePath);
  const workbook = XLSX.readFile(filePath, {
    raw: false,
    cellDates: false,
  });
  const sheet = workbook.Sheets[CUSTOMER_CREDIT_SHEET_NAME];
  if (!sheet) {
    throw new HttpError(400, `A planilha ${path.basename(filePath)} não contém a aba '${CUSTOMER_CREDIT_SHEET_NAME}'.`);
  }

  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    })
    .map((row) => normalizeWorkbookRow(row))
    .filter((row): row is ParsedCustomerCreditRow => Boolean(row));

  return {
    candidate: {
      fullPath: filePath,
      fileName: path.basename(filePath),
      fileSizeBytes: stat.size,
      fileUpdatedAt: stat.mtime.toISOString(),
    },
    sheetNames: workbook.SheetNames,
    rows,
  };
}

function buildRowLookup(rows: ParsedCustomerCreditRow[]) {
  return Array.from(new Set(rows.map((row) => row.customerCode)));
}

async function resolveCustomerMatches(rows: ParsedCustomerCreditRow[]) {
  const customerCodes = buildRowLookup(rows);
  if (!customerCodes.length) {
    return new Map<string, { id: string; displayName: string }>();
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

function resolveParsedRows(
  rows: ParsedCustomerCreditRow[],
  matches: Map<string, { id: string; displayName: string }>,
): ResolvedCustomerCreditRow[] {
  return rows.map((row) => {
    const matchedCustomer = matches.get(row.customerCode) ?? null;

    return {
      ...row,
      customerId: matchedCustomer?.id ?? null,
      customerDisplayName: matchedCustomer?.displayName ?? row.sourceDisplayName ?? row.customerCode,
    };
  });
}

async function registerSourceFile(
  client: PoolClient,
  workbook: ParsedCustomerCreditWorkbook,
) {
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
      CUSTOMER_CREDIT_SOURCE_TYPE,
      workbook.candidate.fullPath,
      workbook.candidate.fileName,
      `${workbook.candidate.fileUpdatedAt}-${workbook.candidate.fileSizeBytes}`,
      workbook.candidate.fileSizeBytes,
      JSON.stringify({
        sheetNames: workbook.sheetNames,
        rows: workbook.rows.length,
        fileUpdatedAt: workbook.candidate.fileUpdatedAt,
      }),
    ],
  );

  return String(result.rows[0]?.id);
}

async function insertSnapshotRows(
  client: PoolClient,
  snapshotId: string,
  rows: ResolvedCustomerCreditRow[],
) {
  if (!rows.length) {
    return;
  }

  const payload = rows.map((row) => ({
    customer_id: row.customerId,
    customer_code: row.customerCode,
    customer_display_name: row.customerDisplayName,
    source_display_name: row.sourceDisplayName,
    balance_amount: row.balanceAmount,
    credit_limit: row.creditLimit,
    operational_state: row.operationalState,
    risk_level: row.riskLevel,
    observation: row.observation,
    last_order_date: row.lastOrderDate,
    last_payment_date: row.lastPaymentDate,
    days_since_last_order: row.daysSinceLastOrder,
    days_since_last_payment: row.daysSinceLastPayment,
    payment_term: row.paymentTerm,
    risk_score: row.riskScore,
    flags: row.flags,
    has_over_credit: row.hasOverCredit,
    has_overdue_payment: row.hasOverduePayment,
    has_severely_overdue_payment: row.hasSeverelyOverduePayment,
    has_no_payment: row.hasNoPayment,
    has_no_order: row.hasNoOrder,
    has_negative_credit: row.hasNegativeCredit,
    has_debt_without_credit: row.hasDebtWithoutCredit,
    raw_payload: row.rawPayload,
  }));

  await client.query(
    `
      INSERT INTO customer_credit_snapshot_rows (
        snapshot_id,
        customer_id,
        customer_code,
        customer_display_name,
        source_display_name,
        balance_amount,
        credit_limit,
        operational_state,
        risk_level,
        observation,
        last_order_date,
        last_payment_date,
        days_since_last_order,
        days_since_last_payment,
        payment_term,
        risk_score,
        flags,
        has_over_credit,
        has_overdue_payment,
        has_severely_overdue_payment,
        has_no_payment,
        has_no_order,
        has_negative_credit,
        has_debt_without_credit,
        raw_payload
      )
      SELECT
        $1::uuid,
        NULLIF(entry.customer_id, '')::uuid,
        entry.customer_code,
        entry.customer_display_name,
        entry.source_display_name,
        COALESCE(entry.balance_amount, 0)::numeric(14, 2),
        COALESCE(entry.credit_limit, 0)::numeric(14, 2),
        entry.operational_state,
        entry.risk_level,
        COALESCE(entry.observation, ''),
        NULLIF(entry.last_order_date, '')::date,
        NULLIF(entry.last_payment_date, '')::date,
        entry.days_since_last_order,
        entry.days_since_last_payment,
        entry.payment_term,
        entry.risk_score,
        COALESCE(entry.flags, ARRAY[]::text[]),
        COALESCE(entry.has_over_credit, FALSE),
        COALESCE(entry.has_overdue_payment, FALSE),
        COALESCE(entry.has_severely_overdue_payment, FALSE),
        COALESCE(entry.has_no_payment, FALSE),
        COALESCE(entry.has_no_order, FALSE),
        COALESCE(entry.has_negative_credit, FALSE),
        COALESCE(entry.has_debt_without_credit, FALSE),
        COALESCE(entry.raw_payload, '{}'::jsonb)
      FROM jsonb_to_recordset($2::jsonb) AS entry(
        customer_id text,
        customer_code text,
        customer_display_name text,
        source_display_name text,
        balance_amount numeric,
        credit_limit numeric,
        operational_state text,
        risk_level text,
        observation text,
        last_order_date text,
        last_payment_date text,
        days_since_last_order integer,
        days_since_last_payment integer,
        payment_term integer,
        risk_score integer,
        flags text[],
        has_over_credit boolean,
        has_overdue_payment boolean,
        has_severely_overdue_payment boolean,
        has_no_payment boolean,
        has_no_order boolean,
        has_negative_credit boolean,
        has_debt_without_credit boolean,
        raw_payload jsonb
      )
    `,
    [snapshotId, JSON.stringify(payload)],
  );
}

async function persistSnapshot(workbook: ParsedCustomerCreditWorkbook, rows: ResolvedCustomerCreditRow[]) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [CUSTOMER_CREDIT_LOCK_NS, CUSTOMER_CREDIT_LOCK_KEY]);

    const sourceFileId = await registerSourceFile(client, workbook);
    await client.query("UPDATE customer_credit_snapshots SET is_active = FALSE WHERE is_active = TRUE");

    const snapshotResult = await client.query(
      `
        INSERT INTO customer_credit_snapshots (
          source_file_id,
          source_file_path,
          source_file_name,
          source_file_size_bytes,
          source_file_updated_at,
          parser_version,
          total_rows,
          matched_rows,
          unmatched_rows,
          imported_at,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), TRUE)
        RETURNING
          id,
          source_file_id,
          source_file_path,
          source_file_name,
          source_file_size_bytes,
          source_file_updated_at::text AS source_file_updated_at,
          parser_version,
          total_rows,
          matched_rows,
          unmatched_rows,
          imported_at::text AS imported_at
      `,
      [
        sourceFileId,
        workbook.candidate.fullPath,
        workbook.candidate.fileName,
        workbook.candidate.fileSizeBytes,
        workbook.candidate.fileUpdatedAt,
        CUSTOMER_CREDIT_PARSER_VERSION,
        rows.length,
        rows.filter((row) => row.customerId).length,
        rows.filter((row) => !row.customerId).length,
      ],
    );

    const snapshot = snapshotResult.rows[0] as SnapshotMetaRecord;
    await insertSnapshotRows(client, String(snapshot.id), rows);
    await client.query("COMMIT");

    logger.info("customer credit snapshot refreshed", {
      fileName: workbook.candidate.fileName,
      totalRows: rows.length,
      matchedRows: rows.filter((row) => row.customerId).length,
      unmatchedRows: rows.filter((row) => !row.customerId).length,
    });

    return mapSnapshotMeta(snapshot as unknown as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function refreshSnapshotInternal(forceRefresh = false) {
  const activeSnapshot = await getActiveSnapshotRecord();
  let latestWorkbook: CustomerCreditWorkbookCandidate | null = null;

  try {
    latestWorkbook = await findLatestCustomerCreditWorkbookInDirectory();
  } catch (error) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("failed to scan customer credit workbook directory, using cached snapshot", {
        error: String(error),
      });
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }
    throw error;
  }

  if (!latestWorkbook) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("customer credit workbook not found, using cached snapshot");
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }

    throw new HttpError(
      500,
      `Não encontrei nenhum arquivo ${env.CUSTOMER_CREDIT_WORKBOOK_PREFIX}*.xlsx em ${env.CUSTOMER_CREDIT_WORKBOOK_DIR}.`,
    );
  }

  if (
    activeSnapshot &&
    !forceRefresh &&
    Number(activeSnapshot.parserVersion ?? 0) === CUSTOMER_CREDIT_PARSER_VERSION &&
    activeSnapshot.sourceFilePath === latestWorkbook.fullPath &&
    Number(activeSnapshot.sourceFileSizeBytes) === latestWorkbook.fileSizeBytes &&
    toIsoTimestamp(activeSnapshot.sourceFileUpdatedAt) === latestWorkbook.fileUpdatedAt
  ) {
    return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
  }

  const workbook = await parseCustomerCreditWorkbook(latestWorkbook.fullPath);
  const matches = await resolveCustomerMatches(workbook.rows);
  const rows = resolveParsedRows(workbook.rows, matches);

  return persistSnapshot(workbook, rows);
}

export async function ensureCustomerCreditSnapshot(forceRefresh = false): Promise<CustomerCreditSnapshotMeta | null> {
  if (activeSnapshotPromise) {
    return activeSnapshotPromise;
  }

  activeSnapshotPromise = refreshSnapshotInternal(forceRefresh).finally(() => {
    activeSnapshotPromise = null;
  });

  return activeSnapshotPromise;
}

function mapCustomerCreditRow(row: Record<string, unknown>): CustomerCreditRow {
  const balanceAmount = Number(row.balance_amount ?? 0);
  const creditLimit = Number(row.credit_limit ?? 0);
  const debtAmount = getDebtAmount(balanceAmount);
  const creditBalanceAmount = getCreditBalanceAmount(balanceAmount);

  return {
    id: String(row.id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: String(row.customer_code ?? ""),
    customerDisplayName: String(row.customer_display_name ?? row.source_display_name ?? row.customer_code ?? ""),
    sourceDisplayName: row.source_display_name ? String(row.source_display_name) : null,
    matched: Boolean(row.customer_id),
    balanceAmount,
    debtAmount,
    creditBalanceAmount,
    creditLimit,
    availableCreditAmount: getAvailableCreditAmount(balanceAmount, creditLimit),
    withinCreditLimit: debtAmount > 0 && creditLimit > 0 && debtAmount <= creditLimit,
    operationalState: String(row.operational_state) as CustomerCreditOperationalState,
    riskLevel: String(row.risk_level) as CustomerCreditRiskLevel,
    observation: String(row.observation ?? ""),
    lastOrderDate: row.last_order_date ? String(row.last_order_date) : null,
    lastPaymentDate: row.last_payment_date ? String(row.last_payment_date) : null,
    daysSinceLastOrder:
      row.days_since_last_order === null || row.days_since_last_order === undefined
        ? null
        : Number(row.days_since_last_order),
    daysSinceLastPayment:
      row.days_since_last_payment === null || row.days_since_last_payment === undefined
        ? null
        : Number(row.days_since_last_payment),
    paymentTerm:
      row.payment_term === null || row.payment_term === undefined
        ? null
        : Number(row.payment_term),
    riskScore: row.risk_score === null || row.risk_score === undefined ? null : Number(row.risk_score),
    flags: Array.isArray(row.flags) ? row.flags.map((entry) => String(entry)) : [],
    hasOverCredit: Boolean(row.has_over_credit),
    hasOverduePayment: Boolean(row.has_overdue_payment),
    hasSeverelyOverduePayment: Boolean(row.has_severely_overdue_payment),
    hasNoPayment: Boolean(row.has_no_payment),
    hasNoOrder: Boolean(row.has_no_order),
    hasNegativeCredit: Boolean(row.has_negative_credit),
    hasDebtWithoutCredit: Boolean(row.has_debt_without_credit),
  };
}

function compareCreditRows(left: CustomerCreditRow, right: CustomerCreditRow) {
  const riskComparison = RISK_PRIORITY[left.riskLevel] - RISK_PRIORITY[right.riskLevel];
  if (riskComparison !== 0) {
    return riskComparison;
  }

  const stateComparison = STATE_PRIORITY[left.operationalState] - STATE_PRIORITY[right.operationalState];
  if (stateComparison !== 0) {
    return stateComparison;
  }

  const balanceComparison = Math.abs(right.balanceAmount) - Math.abs(left.balanceAmount);
  if (balanceComparison !== 0) {
    return balanceComparison;
  }

  return left.customerDisplayName.localeCompare(right.customerDisplayName, "pt-BR");
}

function buildOverviewSummary(linkedRows: CustomerCreditRow[], unmatchedRows: CustomerCreditRow[]): CustomerCreditOverviewSummary {
  return {
    totalLinkedCustomers: linkedRows.length,
    totalUnmatchedRows: unmatchedRows.length,
    totalDebtAmount: linkedRows.reduce((sum, row) => sum + row.debtAmount, 0),
    totalCreditBalanceAmount: linkedRows.reduce((sum, row) => sum + row.creditBalanceAmount, 0),
    customersOwing: linkedRows.filter((row) => row.debtAmount > 0).length,
    customersWithCreditLimit: linkedRows.filter((row) => row.creditLimit > 0).length,
    customersWithUnusedCredit: linkedRows.filter((row) => row.operationalState === "UNUSED_CREDIT").length,
    customersCritical: linkedRows.filter((row) => row.riskLevel === "CRITICO").length,
    customersAttention: linkedRows.filter((row) => row.riskLevel === "ATENCAO").length,
    customersMonitoring: linkedRows.filter((row) => row.riskLevel === "MONITORAR").length,
    customersOverCredit: linkedRows.filter((row) => row.hasOverCredit || row.operationalState === "OVER_CREDIT").length,
    customersOverdue: linkedRows.filter((row) => {
      // Must have active debt to be counted as "delayed" in high-level metrics
      if (row.debtAmount <= 0) return false;

      // Flag-based checks
      const isFlagged = row.hasOverduePayment || row.hasSeverelyOverduePayment || row.hasNoPayment;
      if (isFlagged) return true;

      // Date-based delay (Days since last payment > term)
      if (
        row.daysSinceLastPayment !== null &&
        row.paymentTerm !== null &&
        row.daysSinceLastPayment > row.paymentTerm &&
        row.daysSinceLastPayment > 1
      ) {
        return true;
      }

      return false;
    }).length,
  };
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
        balance_amount,
        credit_limit,
        operational_state,
        risk_level,
        observation,
        last_order_date::text AS last_order_date,
        last_payment_date::text AS last_payment_date,
        days_since_last_order,
        days_since_last_payment,
        payment_term,
        risk_score,
        flags,
        has_over_credit,
        has_overdue_payment,
        has_severely_overdue_payment,
        has_no_payment,
        has_no_order,
        has_negative_credit,
        has_debt_without_credit
      FROM customer_credit_snapshot_rows
      WHERE snapshot_id = $1
    `,
    [snapshotId],
  );

  const mappedRows = result.rows.map((row) => mapCustomerCreditRow(row));

  const filteredRows = mappedRows.filter((row) => {
    const name = (row.customerDisplayName || "").toLowerCase();
    const source = (row.sourceDisplayName || "").toLowerCase();
    return !name.includes("shop online") && !source.includes("shop online");
  });

  return filteredRows.sort(compareCreditRows);
}

export async function getCustomerCreditOverview(): Promise<CustomerCreditOverviewResponse> {
  const snapshot = await ensureCustomerCreditSnapshot(false);
  if (!snapshot) {
    return {
      snapshot: null,
      summary: emptySummary(),
      linkedRows: [],
      unmatchedRows: [],
    };
  }

  const rows = await loadOverviewRows(snapshot.id);
  const linkedRows = rows.filter((row) => row.matched);
  const unmatchedRows = rows.filter((row) => !row.matched);

  return {
    snapshot,
    summary: buildOverviewSummary(linkedRows, unmatchedRows),
    linkedRows,
    unmatchedRows,
  };
}

export async function refreshCustomerCreditOverview(): Promise<CustomerCreditOverviewResponse> {
  const snapshot = await ensureCustomerCreditSnapshot(true);
  if (!snapshot) {
    return {
      snapshot: null,
      summary: emptySummary(),
      linkedRows: [],
      unmatchedRows: [],
    };
  }

  const rows = await loadOverviewRows(snapshot.id);
  const linkedRows = rows.filter((row) => row.matched);
  const unmatchedRows = rows.filter((row) => !row.matched);

  return {
    snapshot,
    summary: buildOverviewSummary(linkedRows, unmatchedRows),
    linkedRows,
    unmatchedRows,
  };
}

export async function getCustomerCreditDetail(customerId: string): Promise<CustomerCreditDetailResponse> {
  const snapshot = await ensureCustomerCreditSnapshot(false);
  if (!snapshot) {
    return {
      snapshot: null,
      row: null,
    };
  }

  const result = await pool.query(
    `
      SELECT
        id,
        customer_id,
        customer_code,
        customer_display_name,
        source_display_name,
        balance_amount,
        credit_limit,
        operational_state,
        risk_level,
        observation,
        last_order_date::text AS last_order_date,
        last_payment_date::text AS last_payment_date,
        days_since_last_order,
        days_since_last_payment,
        payment_term,
        risk_score,
        flags,
        has_over_credit,
        has_overdue_payment,
        has_severely_overdue_payment,
        has_no_payment,
        has_no_order,
        has_negative_credit,
        has_debt_without_credit
      FROM customer_credit_snapshot_rows
      WHERE snapshot_id = $1
        AND customer_id = $2
      LIMIT 1
    `,
    [snapshot.id, customerId],
  );

  return {
    snapshot,
    row: result.rows[0] ? mapCustomerCreditRow(result.rows[0]) : null,
  };
}

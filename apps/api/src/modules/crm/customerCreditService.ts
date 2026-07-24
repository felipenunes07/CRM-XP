import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import type { PoolClient } from "pg";
import type {
  CustomerCreditDetailResponse,
  CustomerCreditOperationalState,
  CustomerCreditOrderEntry,
  CustomerCreditOverviewResponse,
  CustomerCreditOverviewSummary,
  CustomerCreditPaymentEntry,
  CustomerCreditRiskLevel,
  CustomerCreditRow,
  CustomerCreditSettingsUpdate,
  CustomerCreditSnapshotMeta,
} from "@olist-crm/shared";
import { pool, redis } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber } from "../../lib/normalize.js";
import type { JwtUser } from "../platform/authService.js";
import {
  cleanupTempFile,
  downloadFileByPath,
  findLatestDropboxFileByPrefix,
} from "../../lib/dropboxClient.js";

const CUSTOMER_CREDIT_SOURCE_TYPE = "customer_credit_xlsx";
const CUSTOMER_CREDIT_SHEET_NAME = "RESUMO";
const CUSTOMER_CREDIT_LOCK_NS = 8201;
const CUSTOMER_CREDIT_LOCK_KEY = 1;
const CUSTOMER_CREDIT_PARSER_VERSION = 7;
const CUSTOMER_CREDIT_DETAIL_INSERT_CHUNK_SIZE = 5000;
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
  sourcePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileUpdatedAt: string;
}

interface CustomerCreditWorkbookSource {
  sourcePath: string;
  fileName: string;
  fileSizeBytes: number;
  fileUpdatedAt: string;
  fullPath?: string;
  dropboxPath?: string;
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

export interface ParsedCustomerCreditOrder {
  customerCode: string;
  customerDisplayName: string | null;
  orderKey: string;
  orderNumber: string;
  orderDate: string | null;
  totalAmount: number;
  units: number;
  seller: string | null;
  doc: string | null;
  status: string;
  lineCount: number;
  rawPayload: Record<string, unknown>;
}

export interface ParsedCustomerCreditPayment {
  customerCode: string;
  customerDisplayName: string | null;
  paymentKey: string;
  paymentNumber: string;
  paymentDate: string | null;
  amount: number;
  paymentType: string;
  observation: string;
  rawPayload: Record<string, unknown>;
}

export interface ParsedCustomerCreditWorkbook {
  candidate: CustomerCreditWorkbookCandidate;
  sheetNames: string[];
  rows: ParsedCustomerCreditRow[];
  orders: ParsedCustomerCreditOrder[];
  payments: ParsedCustomerCreditPayment[];
}

type CustomerCreditMatch = { id: string; displayName: string };

interface ResolvedCustomerCreditRow extends ParsedCustomerCreditRow {
  customerId: string | null;
  customerDisplayName: string;
}

interface ResolvedCustomerCreditOrder extends Omit<ParsedCustomerCreditOrder, "customerDisplayName"> {
  customerId: string | null;
  customerDisplayName: string;
  sourceDisplayName: string | null;
}

interface ResolvedCustomerCreditPayment extends Omit<ParsedCustomerCreditPayment, "customerDisplayName"> {
  customerId: string | null;
  customerDisplayName: string;
  sourceDisplayName: string | null;
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

export function isCustomerCreditSourceCurrent(
  snapshot: Pick<
    SnapshotMetaRecord,
    "parserVersion" | "sourceFilePath" | "sourceFileSizeBytes" | "sourceFileUpdatedAt"
  >,
  source: Pick<CustomerCreditWorkbookSource, "sourcePath" | "fileSizeBytes" | "fileUpdatedAt">,
) {
  return (
    Number(snapshot.parserVersion ?? 0) === CUSTOMER_CREDIT_PARSER_VERSION &&
    snapshot.sourceFilePath === source.sourcePath &&
    Number(snapshot.sourceFileSizeBytes) === source.fileSizeBytes &&
    toIsoTimestamp(snapshot.sourceFileUpdatedAt) === toIsoTimestamp(source.fileUpdatedAt)
  );
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
  const normalizedExactKey = normalizeHeaderLookup(exactKey);
  
  // Try case-insensitive exact match first
  const exactMatch = Object.entries(row).find(([key]) => normalizeHeaderLookup(key) === normalizedExactKey);
  if (exactMatch) {
    return exactMatch[1];
  }

  // Fallback to fragment matching
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

function isInternalCustomerCode(customerCode: string) {
  return customerCode.toUpperCase().startsWith("PP");
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
  if (isInternalCustomerCode(customerCode)) {
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

function normalizePaymentType(value: unknown) {
  const normalized = normalizeComparableText(String(value ?? ""));
  if (!normalized) {
    return "";
  }
  if (normalized.includes("转账") || normalized.includes("trf")) {
    return "TRF";
  }
  if (normalized.includes("现金") || normalized.includes("dinheiro")) {
    return "DINHEIRO";
  }
  if (normalized.includes("坏品抵账表") || normalized.includes("trocas")) {
    return "TROCAS";
  }
  if (normalized.includes("退回") || normalized.includes("cancel")) {
    return "CANCEL";
  }
  if (normalized.includes("cupom site")) {
    return "CUPOM SITE";
  }
  if (normalized.includes("打标") || normalized.includes("logo")) {
    return "LOGO";
  }
  if (normalized.includes("采购")) {
    return "COMPRA";
  }
  return normalizeText(String(value ?? ""));
}

function normalizeCustomerName(value: unknown) {
  return normalizeText(String(value ?? "")) || null;
}

function normalizeOrderSourceRow(row: Record<string, unknown>): ParsedCustomerCreditOrder | null {
  const customerCode = normalizeCode(String(readWorkbookValue(row, "COD") ?? ""));
  if (!customerCode || isInternalCustomerCode(customerCode)) {
    return null;
  }

  const orderNumber = normalizeText(String(readWorkbookValue(row, "单号") ?? ""));
  const orderDate = parseCustomerCreditDate(readWorkbookValue(row, "DATA"));
  const totalAmount = safeNumber(readWorkbookValue(row, " TOTAL ", ["total"]));
  const units = parseNullableInteger(readWorkbookValue(row, "N")) ?? 0;
  const customerDisplayName = normalizeCustomerName(readWorkbookValue(row, "CLIENTE/客户", ["cliente"]));
  const seller = normalizeText(String(readWorkbookValue(row, "VENDEDOR") ?? "")) || null;
  const doc = normalizeText(String(readWorkbookValue(row, "DOC") ?? "")) || null;
  const status = normalizeText(String(readWorkbookValue(row, "👌") ?? ""));
  const fallbackOrderNumber = normalizeText(String(readWorkbookValue(row, "DATE COD") ?? ""));
  const orderKey = [customerCode, orderDate ?? "", orderNumber || fallbackOrderNumber].join("|");

  if (!orderNumber && !orderDate && totalAmount === 0) {
    return null;
  }

  return {
    customerCode,
    customerDisplayName,
    orderKey,
    orderNumber,
    orderDate,
    totalAmount,
    units,
    seller,
    doc,
    status,
    lineCount: 1,
    rawPayload: {
      dateCode: readWorkbookValue(row, "DATE COD") ?? null,
      firstDescription: readWorkbookValue(row, "DESCRIÇÃO") ?? null,
      firstSku: readWorkbookValue(row, "SKU") ?? null,
      observation: readWorkbookValue(row, "OBS") ?? null,
    },
  };
}

function parseCustomerCreditOrders(sheet: XLSX.WorkSheet | undefined): ParsedCustomerCreditOrder[] {
  if (!sheet) {
    return [];
  }

  const grouped = new Map<string, ParsedCustomerCreditOrder>();
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  for (const row of rows) {
    const parsed = normalizeOrderSourceRow(row);
    if (!parsed) {
      continue;
    }

    const existing = grouped.get(parsed.orderKey);
    if (!existing) {
      grouped.set(parsed.orderKey, parsed);
      continue;
    }

    existing.totalAmount += parsed.totalAmount;
    existing.units += parsed.units;
    existing.lineCount += parsed.lineCount;
    existing.seller ??= parsed.seller;
    existing.doc ??= parsed.doc;
    if (!existing.status && parsed.status) {
      existing.status = parsed.status;
    }
  }

  return Array.from(grouped.values());
}

function normalizePaymentSourceRow(row: Record<string, unknown>): ParsedCustomerCreditPayment | null {
  const customerCode = normalizeCode(String(readWorkbookValue(row, "COD") ?? ""));
  if (!customerCode || isInternalCustomerCode(customerCode)) {
    return null;
  }

  const paymentNumber = normalizeText(String(readWorkbookValue(row, "N") ?? ""));
  const paymentDate = parseCustomerCreditDate(readWorkbookValue(row, "Data/日期", ["data"]));
  const amount = safeNumber(readWorkbookValue(row, " Valor/已付 ", ["valor"]));
  const paymentType = normalizePaymentType(readWorkbookValue(row, "TIPO"));
  const observation = normalizeText(String(readWorkbookValue(row, "OBS") ?? ""));
  const customerDisplayName = normalizeCustomerName(readWorkbookValue(row, "Cliente/客户", ["cliente"]));
  const paymentKey = [customerCode, paymentDate ?? "", paymentNumber, amount.toFixed(2), paymentType].join("|");

  if (!paymentNumber && !paymentDate && amount === 0) {
    return null;
  }

  return {
    customerCode,
    customerDisplayName,
    paymentKey,
    paymentNumber,
    paymentDate,
    amount,
    paymentType,
    observation,
    rawPayload: {
      code: readWorkbookValue(row, "CODIGO") ?? null,
      postedToGroupAt: readWorkbookValue(row, "单子发群") ?? null,
      mini: readWorkbookValue(row, "MINI") ?? null,
    },
  };
}

function parseCustomerCreditPayments(sheet: XLSX.WorkSheet | undefined): ParsedCustomerCreditPayment[] {
  if (!sheet) {
    return [];
  }

  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    })
    .map((row) => normalizePaymentSourceRow(row))
    .filter((row): row is ParsedCustomerCreditPayment => Boolean(row));
}

function isAfterCustomerCreditDate(candidate: string | null, current: string | null) {
  if (!candidate) {
    return false;
  }

  if (!current) {
    return true;
  }

  return candidate > current;
}

function reconcileRowsWithParsedPayments(
  rows: ParsedCustomerCreditRow[],
  payments: ParsedCustomerCreditPayment[],
): ParsedCustomerCreditRow[] {
  if (!payments.length) {
    return rows;
  }

  const latestPaymentByCode = new Map<string, string>();
  payments.forEach((payment) => {
    if (isAfterCustomerCreditDate(payment.paymentDate, latestPaymentByCode.get(payment.customerCode) ?? null)) {
      latestPaymentByCode.set(payment.customerCode, payment.paymentDate!);
    }
  });

  if (!latestPaymentByCode.size) {
    return rows;
  }

  return rows.map((row) => {
    const latestPaymentDate = latestPaymentByCode.get(row.customerCode) ?? null;
    if (!isAfterCustomerCreditDate(latestPaymentDate, row.lastPaymentDate)) {
      return row;
    }

    return {
      ...row,
      lastPaymentDate: latestPaymentDate,
      // RESUMO and PAG can disagree. Once the date comes from PAG, the stale
      // RESUMO day count should not remain attached to the newer date.
      daysSinceLastPayment: null,
    };
  });
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

export async function findLatestCustomerCreditWorkbook(
  directory = env.CUSTOMER_CREDIT_WORKBOOK_DIR,
  prefix = env.CUSTOMER_CREDIT_WORKBOOK_PREFIX,
): Promise<(CustomerCreditWorkbookCandidate & { isTemp?: boolean }) | null> {
  const source = await discoverLatestCustomerCreditWorkbook(directory, prefix);
  if (!source) {
    return null;
  }

  return materializeCustomerCreditWorkbook(source);
}

async function discoverLatestCustomerCreditWorkbook(
  directory = env.CUSTOMER_CREDIT_WORKBOOK_DIR,
  prefix = env.CUSTOMER_CREDIT_WORKBOOK_PREFIX,
): Promise<CustomerCreditWorkbookSource | null> {
  if (env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY)) {
    logger.info("Searching for latest credit workbook in Dropbox", {
      path: env.DROPBOX_CUSTOMER_CREDIT_PATH,
      prefix,
    });

    const dropboxFile = await findLatestDropboxFileByPrefix(env.DROPBOX_CUSTOMER_CREDIT_PATH, prefix);

    if (dropboxFile) {
      return {
        sourcePath: dropboxFile.sourcePath,
        fileName: dropboxFile.fileName,
        fileSizeBytes: dropboxFile.fileSizeBytes,
        fileUpdatedAt: dropboxFile.fileUpdatedAt,
        dropboxPath: dropboxFile.sourcePath,
      };
    }
  }

  // Fallback to local directory
  logger.info("Searching for latest credit workbook in local directory", { directory, prefix });
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

async function materializeCustomerCreditWorkbook(
  source: CustomerCreditWorkbookSource,
): Promise<CustomerCreditWorkbookCandidate & { isTemp?: boolean }> {
  if (source.fullPath) {
    return {
      fullPath: source.fullPath,
      sourcePath: source.sourcePath,
      fileName: source.fileName,
      fileSizeBytes: source.fileSizeBytes,
      fileUpdatedAt: source.fileUpdatedAt,
    };
  }

  const downloaded = await downloadFileByPath(source.dropboxPath ?? source.sourcePath);
  return {
    fullPath: downloaded.localPath,
    sourcePath: source.sourcePath,
    fileName: source.fileName,
    fileSizeBytes: source.fileSizeBytes,
    fileUpdatedAt: source.fileUpdatedAt,
    isTemp: true,
  };
}

export async function parseCustomerCreditWorkbook(
  filePath: string,
  sourcePath = filePath,
  candidate?: CustomerCreditWorkbookCandidate,
): Promise<ParsedCustomerCreditWorkbook> {
  const stat = await fs.stat(filePath);
  logger.info("Parsing customer credit workbook", { filePath, size: stat.size });
  
  const workbook = XLSX.readFile(filePath, {
    raw: false,
    cellDates: false,
  });
  
  // Find RESUMO sheet case-insensitively
  const targetSheetName = CUSTOMER_CREDIT_SHEET_NAME.toUpperCase();
  const actualSheetName = workbook.SheetNames.find(s => s.toUpperCase() === targetSheetName);
  
  if (!actualSheetName) {
    logger.error("Required sheet not found in workbook", { 
      expected: CUSTOMER_CREDIT_SHEET_NAME, 
      available: workbook.SheetNames,
      fileName: path.basename(filePath)
    });
    throw new HttpError(400, `A planilha ${path.basename(filePath)} não contém a aba '${CUSTOMER_CREDIT_SHEET_NAME}'. Abas disponíveis: ${workbook.SheetNames.join(", ")}`);
  }

  const sheet = workbook.Sheets[actualSheetName];

  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet!, {
      defval: null,
      raw: false,
    })
    .map((row) => normalizeWorkbookRow(row))
    .filter((row): row is ParsedCustomerCreditRow => Boolean(row));
  const orders = parseCustomerCreditOrders(workbook.Sheets.OUT);
  const payments = parseCustomerCreditPayments(workbook.Sheets.PAG);
  const reconciledRows = reconcileRowsWithParsedPayments(rows, payments);

  return {
    candidate: {
      fullPath: filePath,
      sourcePath,
      fileName: candidate?.fileName ?? path.basename(filePath),
      fileSizeBytes: candidate?.fileSizeBytes ?? stat.size,
      fileUpdatedAt: candidate?.fileUpdatedAt ?? stat.mtime.toISOString(),
    },
    sheetNames: workbook.SheetNames,
    rows: reconciledRows,
    orders,
    payments,
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
  matches: Map<string, CustomerCreditMatch>,
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

export function resolveParsedCreditOrders(
  orders: ParsedCustomerCreditOrder[],
  matches: Map<string, CustomerCreditMatch>,
): ResolvedCustomerCreditOrder[] {
  return orders.map((order) => {
    const matchedCustomer = matches.get(order.customerCode) ?? null;

    return {
      ...order,
      customerId: matchedCustomer?.id ?? null,
      customerDisplayName: matchedCustomer?.displayName ?? order.customerDisplayName ?? order.customerCode,
      sourceDisplayName: order.customerDisplayName,
    };
  });
}

export function resolveParsedCreditPayments(
  payments: ParsedCustomerCreditPayment[],
  matches: Map<string, CustomerCreditMatch>,
): ResolvedCustomerCreditPayment[] {
  return payments.map((payment) => {
    const matchedCustomer = matches.get(payment.customerCode) ?? null;

    return {
      ...payment,
      customerId: matchedCustomer?.id ?? null,
      customerDisplayName: matchedCustomer?.displayName ?? payment.customerDisplayName ?? payment.customerCode,
      sourceDisplayName: payment.customerDisplayName,
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
      workbook.candidate.sourcePath,
      workbook.candidate.fileName,
      `${workbook.candidate.fileUpdatedAt}-${workbook.candidate.fileSizeBytes}`,
      workbook.candidate.fileSizeBytes,
      JSON.stringify({
        sheetNames: workbook.sheetNames,
        rows: workbook.rows.length,
        orders: workbook.orders.length,
        payments: workbook.payments.length,
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

async function insertSnapshotOrders(
  client: PoolClient,
  snapshotId: string,
  orders: ResolvedCustomerCreditOrder[],
) {
  if (!orders.length) {
    return;
  }

  const payload = orders.map((order) => ({
    customer_id: order.customerId,
    customer_code: order.customerCode,
    customer_display_name: order.customerDisplayName,
    source_display_name: order.sourceDisplayName,
    order_key: order.orderKey,
    order_number: order.orderNumber,
    order_date: order.orderDate,
    total_amount: order.totalAmount,
    units: order.units,
    seller: order.seller,
    doc: order.doc,
    status: order.status,
    line_count: order.lineCount,
    raw_payload: order.rawPayload,
  }));

  for (const chunk of chunkArray(payload, CUSTOMER_CREDIT_DETAIL_INSERT_CHUNK_SIZE)) {
    await client.query(
      `
        INSERT INTO customer_credit_order_entries (
          snapshot_id,
          customer_id,
          customer_code,
          customer_display_name,
          source_display_name,
          order_key,
          order_number,
          order_date,
          total_amount,
          units,
          seller,
          doc,
          status,
          line_count,
          raw_payload
        )
        SELECT
          $1::uuid,
          NULLIF(entry.customer_id, '')::uuid,
          entry.customer_code,
          entry.customer_display_name,
          entry.source_display_name,
          entry.order_key,
          COALESCE(entry.order_number, ''),
          NULLIF(entry.order_date, '')::date,
          COALESCE(entry.total_amount, 0)::numeric(14, 2),
          COALESCE(entry.units, 0),
          entry.seller,
          entry.doc,
          COALESCE(entry.status, ''),
          COALESCE(entry.line_count, 0),
          COALESCE(entry.raw_payload, '{}'::jsonb)
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          customer_id text,
          customer_code text,
          customer_display_name text,
          source_display_name text,
          order_key text,
          order_number text,
          order_date text,
          total_amount numeric,
          units integer,
          seller text,
          doc text,
          status text,
          line_count integer,
          raw_payload jsonb
        )
      `,
      [snapshotId, JSON.stringify(chunk)],
    );
  }
}

async function insertSnapshotPayments(
  client: PoolClient,
  snapshotId: string,
  payments: ResolvedCustomerCreditPayment[],
) {
  if (!payments.length) {
    return;
  }

  const payload = payments.map((payment) => ({
    customer_id: payment.customerId,
    customer_code: payment.customerCode,
    customer_display_name: payment.customerDisplayName,
    source_display_name: payment.sourceDisplayName,
    payment_key: payment.paymentKey,
    payment_number: payment.paymentNumber,
    payment_date: payment.paymentDate,
    amount: payment.amount,
    payment_type: payment.paymentType,
    observation: payment.observation,
    raw_payload: payment.rawPayload,
  }));

  for (const chunk of chunkArray(payload, CUSTOMER_CREDIT_DETAIL_INSERT_CHUNK_SIZE)) {
    await client.query(
      `
        INSERT INTO customer_credit_payment_entries (
          snapshot_id,
          customer_id,
          customer_code,
          customer_display_name,
          source_display_name,
          payment_key,
          payment_number,
          payment_date,
          amount,
          payment_type,
          observation,
          raw_payload
        )
        SELECT
          $1::uuid,
          NULLIF(entry.customer_id, '')::uuid,
          entry.customer_code,
          entry.customer_display_name,
          entry.source_display_name,
          entry.payment_key,
          COALESCE(entry.payment_number, ''),
          NULLIF(entry.payment_date, '')::date,
          COALESCE(entry.amount, 0)::numeric(14, 2),
          COALESCE(entry.payment_type, ''),
          COALESCE(entry.observation, ''),
          COALESCE(entry.raw_payload, '{}'::jsonb)
        FROM jsonb_to_recordset($2::jsonb) AS entry(
          customer_id text,
          customer_code text,
          customer_display_name text,
          source_display_name text,
          payment_key text,
          payment_number text,
          payment_date text,
          amount numeric,
          payment_type text,
          observation text,
          raw_payload jsonb
        )
      `,
      [snapshotId, JSON.stringify(chunk)],
    );
  }
}

async function persistSnapshot(
  workbook: ParsedCustomerCreditWorkbook,
  rows: ResolvedCustomerCreditRow[],
  orders: ResolvedCustomerCreditOrder[],
  payments: ResolvedCustomerCreditPayment[],
) {
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
        workbook.candidate.sourcePath,
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
    await insertSnapshotOrders(client, String(snapshot.id), orders);
    await insertSnapshotPayments(client, String(snapshot.id), payments);
    await client.query("COMMIT");

    logger.info("customer credit snapshot refreshed", {
      fileName: workbook.candidate.fileName,
      totalRows: rows.length,
      matchedRows: rows.filter((row) => row.customerId).length,
      unmatchedRows: rows.filter((row) => !row.customerId).length,
      orderEntries: orders.length,
      paymentEntries: payments.length,
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
  let latestSource: CustomerCreditWorkbookSource | null = null;
  let latestWorkbook: (CustomerCreditWorkbookCandidate & { isTemp?: boolean }) | null = null;

  try {
    latestSource = await discoverLatestCustomerCreditWorkbook();
  } catch (error) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("failed to scan customer credit workbook source, using cached snapshot", {
        error: String(error),
      });
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }
    throw error;
  }

  if (!latestSource) {
    if (activeSnapshot && !forceRefresh) {
      logger.warn("customer credit workbook not found, using cached snapshot");
      return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
    }

    const isDropboxConfigured = Boolean(env.DROPBOX_ACCESS_TOKEN || (env.DROPBOX_REFRESH_TOKEN && env.DROPBOX_APP_KEY));
    const locationInfo = isDropboxConfigured 
      ? `no Dropbox (caminho: ${env.DROPBOX_CUSTOMER_CREDIT_PATH})`
      : `na pasta local (caminho: ${env.CUSTOMER_CREDIT_WORKBOOK_DIR})`;

    logger.error("No credit workbook found", { 
      prefix: env.CUSTOMER_CREDIT_WORKBOOK_PREFIX, 
      isDropboxConfigured,
      path: isDropboxConfigured ? env.DROPBOX_CUSTOMER_CREDIT_PATH : env.CUSTOMER_CREDIT_WORKBOOK_DIR
    });

    throw new HttpError(
      500,
      `Não encontrei nenhum arquivo começando com "${env.CUSTOMER_CREDIT_WORKBOOK_PREFIX}" ${locationInfo}. Verifique se o nome do arquivo e as configurações de pasta estão corretos na VPS.`,
    );
  }

  if (
    activeSnapshot &&
    !forceRefresh &&
    isCustomerCreditSourceCurrent(activeSnapshot, latestSource)
  ) {
    return mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>);
  }

  try {
    latestWorkbook = await materializeCustomerCreditWorkbook(latestSource);
    const workbook = await parseCustomerCreditWorkbook(
      latestWorkbook.fullPath,
      latestWorkbook.sourcePath,
      latestWorkbook,
    );
    const matches = await resolveCustomerMatches(workbook.rows);
    const rows = resolveParsedRows(workbook.rows, matches);
    const orders = resolveParsedCreditOrders(workbook.orders, matches);
    const payments = resolveParsedCreditPayments(workbook.payments, matches);

    const snapshot = await persistSnapshot(workbook, rows, orders, payments);
    return snapshot;
  } finally {
    if (latestWorkbook?.isTemp) {
      await cleanupTempFile(latestWorkbook.fullPath);
    }
  }
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
  const creditLimitIsManual = Boolean(row.credit_limit_is_manual);
  const paymentTermIsManual = Boolean(row.payment_term_is_manual);
  const hasOverCredit = creditLimitIsManual
    ? debtAmount > 0 && creditLimit > 0 && debtAmount > creditLimit
    : Boolean(row.has_over_credit);
  const hasDebtWithoutCredit = creditLimitIsManual
    ? debtAmount > 0 && creditLimit <= 0
    : Boolean(row.has_debt_without_credit);
  const operationalState: CustomerCreditOperationalState = creditLimitIsManual
    ? balanceAmount > 0
      ? "HAS_CREDIT_BALANCE"
      : debtAmount <= 0
        ? creditLimit > 0
          ? "UNUSED_CREDIT"
          : "SETTLED"
        : hasOverCredit
          ? "OVER_CREDIT"
          : "OWES"
    : String(row.operational_state) as CustomerCreditOperationalState;

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
    operationalState,
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
    hasOverCredit,
    hasOverduePayment: Boolean(row.has_overdue_payment),
    hasSeverelyOverduePayment: Boolean(row.has_severely_overdue_payment),
    hasNoPayment: Boolean(row.has_no_payment),
    hasNoOrder: Boolean(row.has_no_order),
    hasNegativeCredit: Boolean(row.has_negative_credit),
    hasDebtWithoutCredit,
    creditLimitSource: creditLimitIsManual ? "MANUAL" : "SPREADSHEET",
    paymentTermSource: paymentTermIsManual ? "MANUAL" : "SPREADSHEET",
    manualOverrideUpdatedAt: row.manual_override_updated_at
      ? String(row.manual_override_updated_at)
      : null,
    manualOverrideUpdatedByName: row.manual_override_updated_by_name
      ? String(row.manual_override_updated_by_name)
      : null,
  };
}

function mapCustomerCreditOrderEntry(row: Record<string, unknown>): CustomerCreditOrderEntry {
  return {
    id: String(row.id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: String(row.customer_code ?? ""),
    customerDisplayName: String(row.customer_display_name ?? row.source_display_name ?? row.customer_code ?? ""),
    sourceDisplayName: row.source_display_name ? String(row.source_display_name) : null,
    orderNumber: String(row.order_number ?? ""),
    orderDate: row.order_date ? String(row.order_date) : null,
    totalAmount: Number(row.total_amount ?? 0),
    units: Number(row.units ?? 0),
    seller: row.seller ? String(row.seller) : null,
    doc: row.doc ? String(row.doc) : null,
    status: String(row.status ?? ""),
    lineCount: Number(row.line_count ?? 0),
  };
}

function mapCustomerCreditPaymentEntry(row: Record<string, unknown>): CustomerCreditPaymentEntry {
  return {
    id: String(row.id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: String(row.customer_code ?? ""),
    customerDisplayName: String(row.customer_display_name ?? row.source_display_name ?? row.customer_code ?? ""),
    sourceDisplayName: row.source_display_name ? String(row.source_display_name) : null,
    paymentNumber: String(row.payment_number ?? ""),
    paymentDate: row.payment_date ? String(row.payment_date) : null,
    amount: Number(row.amount ?? 0),
    paymentType: String(row.payment_type ?? ""),
    observation: String(row.observation ?? ""),
  };
}

export function reconcileCustomerCreditRowWithPayments(
  row: CustomerCreditRow,
  payments: Pick<CustomerCreditPaymentEntry, "paymentDate">[],
): CustomerCreditRow {
  const latestPaymentDate = payments.reduce<string | null>((latest, payment) => {
    return isAfterCustomerCreditDate(payment.paymentDate, latest) ? payment.paymentDate : latest;
  }, null);

  if (!isAfterCustomerCreditDate(latestPaymentDate, row.lastPaymentDate)) {
    return row;
  }

  return {
    ...row,
    lastPaymentDate: latestPaymentDate,
    daysSinceLastPayment: null,
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
        snapshot_row.id,
        snapshot_row.customer_id,
        customer_code,
        customer_display_name,
        source_display_name,
        balance_amount,
        COALESCE(override.credit_limit, snapshot_row.credit_limit) AS credit_limit,
        operational_state,
        risk_level,
        observation,
        last_order_date::text AS last_order_date,
        last_payment_date::text AS last_payment_date,
        days_since_last_order,
        days_since_last_payment,
        COALESCE(override.payment_term, snapshot_row.payment_term) AS payment_term,
        risk_score,
        flags,
        has_over_credit,
        has_overdue_payment,
        has_severely_overdue_payment,
        has_no_payment,
        has_no_order,
        has_negative_credit,
        has_debt_without_credit,
        override.credit_limit IS NOT NULL AS credit_limit_is_manual,
        override.payment_term IS NOT NULL AS payment_term_is_manual,
        override.updated_at AS manual_override_updated_at,
        override.updated_by_name AS manual_override_updated_by_name
      FROM customer_credit_snapshot_rows snapshot_row
      LEFT JOIN customer_credit_overrides override
        ON override.customer_id = snapshot_row.customer_id
      WHERE snapshot_row.snapshot_id = $1
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

const CREDIT_OVERVIEW_CACHE_KEY = "crm:customer_credit:overview";
// A planilha de saldos so muda uma vez por dia, e o worker (alem do refresh em
// background abaixo) reaquece o cache. Por isso guardamos por bastante tempo:
// abrir a aba repetidas vezes responde em milissegundos.
const CREDIT_OVERVIEW_CACHE_TTL_SECONDS = 60 * 60; // 1 hora

let overviewBackgroundRefreshInFlight = false;

async function buildOverviewResponse(snapshot: CustomerCreditSnapshotMeta): Promise<CustomerCreditOverviewResponse> {
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

async function cacheOverviewResponse(response: CustomerCreditOverviewResponse) {
  try {
    // @ts-ignore
    await redis.set(CREDIT_OVERVIEW_CACHE_KEY, JSON.stringify(response), "EX", CREDIT_OVERVIEW_CACHE_TTL_SECONDS);
  } catch (error) {
    logger.warn("failed to save credit overview to cache", { error: String(error) });
  }
}

// Reprocessa a planilha (caso tenha mudado) fora do caminho da requisicao e
// reaquece o cache quando terminar. Garantimos uma execucao por vez para nao
// disparar varios parses pesados em paralelo.
function refreshOverviewInBackground() {
  if (overviewBackgroundRefreshInFlight) {
    return;
  }
  overviewBackgroundRefreshInFlight = true;

  void (async () => {
    try {
      const snapshot = await ensureCustomerCreditSnapshot(false);
      if (snapshot) {
        await cacheOverviewResponse(await buildOverviewResponse(snapshot));
      }
    } catch (error) {
      logger.warn("background credit overview refresh failed", { error: String(error) });
    } finally {
      overviewBackgroundRefreshInFlight = false;
    }
  })();
}

export async function getCustomerCreditOverview(): Promise<CustomerCreditOverviewResponse> {
  // 1. Cache quente: resposta instantanea.
  try {
    const cached = await redis.get(CREDIT_OVERVIEW_CACHE_KEY);
    if (cached) {
      refreshOverviewInBackground();
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.warn("failed to read credit overview from cache", { error: String(error) });
  }

  // 2. Ja existe um snapshot? Servimos ele na hora (so leitura do banco) e
  //    reprocessamos a planilha em background. Assim, mesmo no dia em que o
  //    arquivo de 60MB muda, a aba abre rapido em vez de travar ~1min no parse.
  const activeSnapshot = await getActiveSnapshotRecord();
  if (activeSnapshot) {
    const response = await buildOverviewResponse(
      mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>),
    );
    await cacheOverviewResponse(response);
    refreshOverviewInBackground();
    return response;
  }

  // 3. Primeira carga absoluta: inicia a materialização em background e
  //    responde imediatamente. A tela consulta novamente até o snapshot ficar
  //    pronto, sem prender a navegação durante o parse do XLSX.
  refreshOverviewInBackground();
  return {
    snapshot: null,
    summary: emptySummary(),
    linkedRows: [],
    unmatchedRows: [],
  };
}

export async function refreshCustomerCreditOverview(): Promise<CustomerCreditOverviewResponse> {
  // A atualização manual e a periódica sempre consultam o Dropbox, mas só
  // baixam/reprocessam quando os metadados ou a versão do parser mudaram.
  const snapshot = await ensureCustomerCreditSnapshot(false);
  if (!snapshot) {
    return {
      snapshot: null,
      summary: emptySummary(),
      linkedRows: [],
      unmatchedRows: [],
    };
  }

  const response = await buildOverviewResponse(snapshot);

  // Reaquece o cache com o snapshot recem-processado.
  try {
    await redis.del(CREDIT_OVERVIEW_CACHE_KEY);
  } catch (error) {
    logger.warn("failed to invalidate credit overview cache", { error: String(error) });
  }
  await cacheOverviewResponse(response);

  return response;
}

export interface CustomerCreditDetailOptions {
  ordersOffset?: number;
  paymentsOffset?: number;
  pageSize?: number;
}

function normalizeDetailPageValue(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(0, Math.trunc(value!)));
}

export async function getCustomerCreditDetail(
  customerId: string,
  options: CustomerCreditDetailOptions = {},
): Promise<CustomerCreditDetailResponse> {
  // O detalhe nunca deve aguardar a sincronização pesada que pode estar rodando
  // em background. Ele lê o snapshot ativo; somente a primeira carga absoluta,
  // sem snapshot persistido, precisa materializar a planilha.
  const activeSnapshot = await getActiveSnapshotRecord();
  const snapshot = activeSnapshot
    ? mapSnapshotMeta(activeSnapshot as unknown as Record<string, unknown>)
    : await ensureCustomerCreditSnapshot(false);
  if (!snapshot) {
    return {
      snapshot: null,
      row: null,
      orders: [],
      payments: [],
      totalOrders: 0,
      totalPayments: 0,
    };
  }

  const pageSize = Math.max(1, normalizeDetailPageValue(options.pageSize, 100, 200));
  const ordersOffset = normalizeDetailPageValue(options.ordersOffset, 0, 1_000_000);
  const paymentsOffset = normalizeDetailPageValue(options.paymentsOffset, 0, 1_000_000);

  const [result, ordersResult, paymentsResult, totalsResult] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          snapshot_row.customer_id,
          customer_code,
          customer_display_name,
          source_display_name,
          balance_amount,
          COALESCE(override.credit_limit, snapshot_row.credit_limit) AS credit_limit,
          operational_state,
          risk_level,
          observation,
          last_order_date::text AS last_order_date,
          last_payment_date::text AS last_payment_date,
          days_since_last_order,
          days_since_last_payment,
          COALESCE(override.payment_term, snapshot_row.payment_term) AS payment_term,
          risk_score,
          flags,
          has_over_credit,
          has_overdue_payment,
          has_severely_overdue_payment,
          has_no_payment,
          has_no_order,
          has_negative_credit,
          has_debt_without_credit,
          override.credit_limit IS NOT NULL AS credit_limit_is_manual,
          override.payment_term IS NOT NULL AS payment_term_is_manual,
          override.updated_at AS manual_override_updated_at,
          override.updated_by_name AS manual_override_updated_by_name
        FROM customer_credit_snapshot_rows snapshot_row
        LEFT JOIN customer_credit_overrides override
          ON override.customer_id = snapshot_row.customer_id
        WHERE snapshot_row.snapshot_id = $1
          AND snapshot_row.customer_id = $2
        LIMIT 1
      `,
      [snapshot.id, customerId],
    ),
    pool.query(
      `
        SELECT
          id,
          customer_id,
          customer_code,
          customer_display_name,
          source_display_name,
          order_number,
          order_date::text AS order_date,
          total_amount,
          units,
          seller,
          doc,
          status,
          line_count
        FROM customer_credit_order_entries
        WHERE snapshot_id = $1
          AND customer_id = $2
        ORDER BY order_date DESC NULLS LAST, order_number DESC
        LIMIT $3
        OFFSET $4
      `,
      [snapshot.id, customerId, pageSize, ordersOffset],
    ),
    pool.query(
      `
        SELECT
          id,
          customer_id,
          customer_code,
          customer_display_name,
          source_display_name,
          payment_number,
          payment_date::text AS payment_date,
          amount,
          payment_type,
          observation
        FROM customer_credit_payment_entries
        WHERE snapshot_id = $1
          AND customer_id = $2
        ORDER BY payment_date DESC NULLS LAST, payment_number DESC
        LIMIT $3
        OFFSET $4
      `,
      [snapshot.id, customerId, pageSize, paymentsOffset],
    ),
    pool.query(
      `
        SELECT
          (
            SELECT COUNT(*)::integer
            FROM customer_credit_order_entries
            WHERE snapshot_id = $1
              AND customer_id = $2
          ) AS total_orders,
          (
            SELECT COUNT(*)::integer
            FROM customer_credit_payment_entries
            WHERE snapshot_id = $1
              AND customer_id = $2
          ) AS total_payments
      `,
      [snapshot.id, customerId],
    ),
  ]);

  const mappedPayments = paymentsResult.rows.map((row) => mapCustomerCreditPaymentEntry(row));
  const mappedRow = result.rows[0] ? mapCustomerCreditRow(result.rows[0]) : null;

  return {
    snapshot,
    row: mappedRow ? reconcileCustomerCreditRowWithPayments(mappedRow, mappedPayments) : null,
    orders: ordersResult.rows.map((row) => mapCustomerCreditOrderEntry(row)),
    payments: mappedPayments,
    totalOrders: Number(totalsResult.rows[0]?.total_orders ?? 0),
    totalPayments: Number(totalsResult.rows[0]?.total_payments ?? 0),
  };
}

export async function updateCustomerCreditSettings(
  customerId: string,
  input: CustomerCreditSettingsUpdate,
  user: JwtUser,
): Promise<CustomerCreditDetailResponse> {
  const existingCustomer = await pool.query(
    `SELECT id FROM customers WHERE id = $1 LIMIT 1`,
    [customerId],
  );
  if (!existingCustomer.rowCount) {
    throw new HttpError(404, "Cliente não encontrado");
  }

  const hasCreditLimit = Object.prototype.hasOwnProperty.call(input, "creditLimit");
  const hasPaymentTerm = Object.prototype.hasOwnProperty.call(input, "paymentTerm");

  await pool.query(
    `
      INSERT INTO customer_credit_overrides (
        customer_id,
        credit_limit,
        payment_term,
        updated_by_user_id,
        updated_by_name,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (customer_id) DO UPDATE SET
        credit_limit = CASE
          WHEN $6::boolean THEN EXCLUDED.credit_limit
          ELSE customer_credit_overrides.credit_limit
        END,
        payment_term = CASE
          WHEN $7::boolean THEN EXCLUDED.payment_term
          ELSE customer_credit_overrides.payment_term
        END,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_by_name = EXCLUDED.updated_by_name,
        updated_at = NOW()
    `,
    [
      customerId,
      hasCreditLimit ? input.creditLimit ?? null : null,
      hasPaymentTerm ? input.paymentTerm ?? null : null,
      user.id,
      user.name,
      hasCreditLimit,
      hasPaymentTerm,
    ],
  );

  await pool.query(
    `
      DELETE FROM customer_credit_overrides
      WHERE customer_id = $1
        AND credit_limit IS NULL
        AND payment_term IS NULL
    `,
    [customerId],
  );

  try {
    await redis.del(CREDIT_OVERVIEW_CACHE_KEY);
  } catch (error) {
    logger.warn("failed to invalidate credit overview cache after manual override", {
      error: String(error),
      customerId,
    });
  }

  return getCustomerCreditDetail(customerId);
}

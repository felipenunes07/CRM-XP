import { readFile } from "node:fs/promises";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

export interface MetaAdsMonthlySpendPoint {
  month: string;
  spend: number;
  currency: string;
}

interface MetaInsightsResponse {
  data?: Array<{
    date_start?: string;
    spend?: string;
    account_currency?: string;
  }>;
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
  };
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addMonths(value: Date, months: number) {
  const result = new Date(value);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function isValidDateString(value: string) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

function parseBrazilianAmount(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function toMonthFromBrazilianDate(value: string) {
  const [, month, year] = value.split("/");
  return `${year}-${month}`;
}

function clampDateOnly(value: string, min: string, max: string) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function buildInsightsUrl(since: string, until: string) {
  const search = new URLSearchParams({
    access_token: env.META_ADS_ACCESS_TOKEN ?? "",
    fields: "spend,date_start,account_currency",
    level: "account",
    time_increment: "monthly",
    limit: "100",
    time_range: JSON.stringify({
      since,
      until,
    }),
  });

  return `https://graph.facebook.com/${env.META_ADS_API_VERSION}/${env.META_ADS_ACCOUNT_ID}/insights?${search.toString()}`;
}

function toMonthKey(value: string) {
  return value.slice(0, 7);
}

export function mergeMetaAdsMonthlySpend(
  invoiceRows: MetaAdsMonthlySpendPoint[],
  apiRows: MetaAdsMonthlySpendPoint[],
) {
  const combined = new Map<string, MetaAdsMonthlySpendPoint>();

  for (const row of invoiceRows) {
    combined.set(row.month, row);
  }

  for (const row of apiRows) {
    combined.set(row.month, row);
  }

  return Array.from(combined.values()).sort((left, right) => left.month.localeCompare(right.month));
}

export async function readMetaAdsInvoiceSummary(
  filePath: string,
  since: string,
  until: string,
): Promise<MetaAdsMonthlySpendPoint[]> {
  if (!filePath) {
    return [];
  }

  const minDate = clampDateOnly(since, "0001-01-01", until);
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const spendByMonth = new Map<string, number>();

  for (const line of lines.slice(1)) {
    const parts = line.split(";");
    if (parts.length < 6) {
      continue;
    }

    const date = parts[0]?.trim() ?? "";
    const description = parts[2]?.trim() ?? "";
    const amountText = parts[4]?.trim() ?? "";

    if (!isValidDateString(date) || !amountText) {
      continue;
    }

    const [day, month, year] = date.split("/");
    const isoDate = `${year}-${month}-${day}`;
    if (isoDate < minDate || isoDate > until) {
      continue;
    }

    if (description && !description.toLowerCase().includes("meta")) {
      continue;
    }

    const amount = parseBrazilianAmount(amountText);
    if (amount === null) {
      continue;
    }

    const monthKey = toMonthFromBrazilianDate(date);
    spendByMonth.set(monthKey, (spendByMonth.get(monthKey) ?? 0) + amount);
  }

  return Array.from(spendByMonth.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, spend]) => ({
      month,
      spend: Number(spend.toFixed(2)),
      currency: env.META_ADS_CURRENCY,
    }));
}

export async function getMetaAdsApiMonthlySpend(since: string, until: string): Promise<MetaAdsMonthlySpendPoint[]> {
  if (!env.META_ADS_ACCESS_TOKEN || !env.META_ADS_ACCOUNT_ID) {
    return [];
  }

  const today = new Date();
  const earliestFullMonthAllowed = startOfMonth(addMonths(startOfMonth(today), -36));
  const requestedSince = parseDateOnly(since);
  const effectiveSince = requestedSince < earliestFullMonthAllowed ? earliestFullMonthAllowed : requestedSince;

  if (effectiveSince > parseDateOnly(until)) {
    return [];
  }

  const rows: MetaAdsMonthlySpendPoint[] = [];
  let nextUrl: string | null = buildInsightsUrl(formatDateOnly(effectiveSince), until);
  let pageGuard = 0;

  while (nextUrl && pageGuard < 100) {
    pageGuard += 1;
    const response = await fetch(nextUrl);
    const payload = (await response.json()) as MetaInsightsResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Erro ao consultar gasto do Meta Ads");
    }

    for (const row of payload.data ?? []) {
      const dateStart = String(row.date_start ?? "");
      if (!dateStart) {
        continue;
      }

      rows.push({
        month: toMonthKey(dateStart),
        spend: Number(row.spend ?? 0),
        currency: String(row.account_currency ?? env.META_ADS_CURRENCY),
      });
    }

    nextUrl = payload.paging?.next ?? null;
  }

  return rows;
}

export async function getMetaAdsMonthlySpend(since: string, until: string): Promise<MetaAdsMonthlySpendPoint[]> {
  let apiRows: MetaAdsMonthlySpendPoint[] = [];
  try {
    apiRows = await getMetaAdsApiMonthlySpend(since, until);
  } catch (error) {
    logger.warn("meta ads api unavailable, using invoice summary fallback", {
      error: error instanceof Error ? error.message : String(error),
      since,
      until,
    });
  }

  const invoiceRows = await readMetaAdsInvoiceSummary(env.META_ADS_INVOICE_SUMMARY_PATH, since, until).catch((error) => {
    logger.warn("meta ads invoice summary unavailable", {
      error: error instanceof Error ? error.message : String(error),
      since,
      until,
      path: env.META_ADS_INVOICE_SUMMARY_PATH,
    });
    return [];
  });

  return mergeMetaAdsMonthlySpend(invoiceRows, apiRows);
}

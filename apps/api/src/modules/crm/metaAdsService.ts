import { env } from "../../lib/env.js";

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

export async function getMetaAdsMonthlySpend(since: string, until: string): Promise<MetaAdsMonthlySpendPoint[]> {
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

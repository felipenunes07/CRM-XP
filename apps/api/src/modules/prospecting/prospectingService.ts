import type {
  ProspectContactAttempt,
  ProspectContactAttemptResult,
  ProspectContactChannel,
  ProspectContactType,
  ProspectKeywordPreset,
  ProspectLead,
  ProspectLeadAssignee,
  ProspectQuotaSnapshot,
  ProspectSearchQuery,
  ProspectSearchResponse,
  ProspectingConfig,
  ProspectingDailySummary,
} from "@olist-crm/shared";
import type { JwtUser } from "../platform/authService.js";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { normalizeName, normalizeText } from "../../lib/normalize.js";
import { getGooglePlaceDetails, searchGooglePlacesText } from "./googlePlacesService.js";
import {
  buildWhatsappUrl,
  calculateProspectScore,
  normalizeProspectPhone,
} from "./prospectingCore.js";

const TEXT_SEARCH_SKU = "TEXT_SEARCH_PRO";
const PLACE_DETAILS_SKU = "PLACE_DETAILS_ENTERPRISE";
const DEFAULT_PRESET_DEFINITIONS = [
  {
    label: "Assistencia Tecnica",
    keyword: "assistencia tecnica",
    description: "Busca ampla para assistencias tecnicas do nicho.",
    sortOrder: 10,
  },
  {
    label: "Distribuidora de Telas",
    keyword: "distribuidora de telas",
    description: "Distribuidores e atacados com foco em telas e reposicao.",
    sortOrder: 20,
  },
  {
    label: "Troca de Tela",
    keyword: "troca de tela",
    description: "Leads com forte aderencia a reparo rapido e manutencao.",
    sortOrder: 30,
  },
] as const;
const LEGACY_PRESET_KEYWORDS_TO_HIDE = [
  "assistencia tecnica iphone",
  "assistencia tecnica celular",
  "loja de celular",
  "loja de acessorios para celular",
  "peliculas para celular",
  "assistencia tecnica samsung",
  "revenda de celulares",
];

interface ProspectLeadRow extends Record<string, unknown> {
  id: string;
  google_place_id: string;
  source: "GOOGLE_PLACES";
  display_name: string;
  primary_category: string | null;
  rating: number | null;
  user_rating_count: number;
  phone: string | null;
  normalized_phone: string | null;
  website_url: string | null;
  address: string | null;
  state: string;
  city: string | null;
  maps_url: string | null;
  score: number;
  status: ProspectLead["status"];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  assigned_to_role: ProspectLeadAssignee["role"] | null;
  claimed_at: string | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  last_contact_by_name: string | null;
  discard_reason: string | null;
  last_google_basic_sync_at: string | null;
  last_google_detail_sync_at: string | null;
}

interface UsageCountsRow {
  text_search_daily_used: number | string | null;
  text_search_monthly_used: number | string | null;
  place_details_daily_used: number | string | null;
  place_details_monthly_used: number | string | null;
}

function toCount(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function mapRole(value: unknown): ProspectLeadAssignee["role"] {
  return value === "ADMIN" || value === "SELLER" ? value : "MANAGER";
}

function mapAssignee(user: JwtUser): ProspectLeadAssignee {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

function mapLead(row: ProspectLeadRow, currentUserId: string): ProspectLead {
  const assignedTo =
    row.assigned_to_user_id && row.assigned_to_name
      ? {
          id: String(row.assigned_to_user_id),
          name: String(row.assigned_to_name),
          role: mapRole(row.assigned_to_role),
        }
      : null;

  const phone = row.phone ? String(row.phone) : null;
  const normalizedPhone = row.normalized_phone ? String(row.normalized_phone) : null;

  return {
    id: String(row.id),
    googlePlaceId: String(row.google_place_id),
    source: "GOOGLE_PLACES",
    displayName: String(row.display_name),
    primaryCategory: row.primary_category ? String(row.primary_category) : null,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    reviewCount: toCount(row.user_rating_count),
    phone,
    normalizedPhone,
    whatsappUrl: buildWhatsappUrl(normalizedPhone ?? phone),
    websiteUrl: row.website_url ? String(row.website_url) : null,
    address: row.address ? String(row.address) : null,
    state: String(row.state),
    city: row.city ? String(row.city) : null,
    mapsUrl: row.maps_url ? String(row.maps_url) : null,
    score: Number(row.score ?? 0),
    status: String(row.status) as ProspectLead["status"],
    assignedTo,
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    firstContactAt: row.first_contact_at ? String(row.first_contact_at) : null,
    lastContactAt: row.last_contact_at ? String(row.last_contact_at) : null,
    lastContactByName: row.last_contact_by_name ? String(row.last_contact_by_name) : null,
    discardReason: row.discard_reason ? String(row.discard_reason) : null,
    lastGoogleBasicSyncAt: row.last_google_basic_sync_at ? String(row.last_google_basic_sync_at) : null,
    lastGoogleDetailSyncAt: row.last_google_detail_sync_at ? String(row.last_google_detail_sync_at) : null,
    isAvailable: !assignedTo || assignedTo.id === currentUserId,
    hasCachedContact: Boolean(normalizedPhone || row.website_url),
    isWorked: Boolean(row.first_contact_at),
  };
}

function mapAttempt(row: Record<string, unknown>): ProspectContactAttempt {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    seller: {
      id: String(row.seller_user_id),
      name: String(row.seller_name),
      role: mapRole(row.seller_role),
    },
    channel: String(row.channel) as ProspectContactChannel,
    contactType: String(row.contact_type) as ProspectContactType,
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at),
  };
}

function buildQuerySignature(keyword: string, state: string, city?: string | null) {
  return [normalizeName(keyword), normalizeName(state), normalizeName(city ?? "")].join("|");
}

function formatPresetLabel(keyword: string) {
  const cleaned = normalizeText(keyword);
  if (!cleaned) {
    return "Busca salva";
  }

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isCacheStillValid(lastFetchedAt: string | Date) {
  const lastFetchedTime = new Date(lastFetchedAt).getTime();
  if (Number.isNaN(lastFetchedTime)) {
    return false;
  }

  return Date.now() - lastFetchedTime <= env.PROSPECTING_SNAPSHOT_CACHE_HOURS * 60 * 60 * 1000;
}

function isDetailStillFresh(lastFetchedAt: string | null, lead: ProspectLead) {
  if (!lastFetchedAt || (!lead.phone && !lead.websiteUrl && lead.rating === null && lead.reviewCount === 0)) {
    return false;
  }

  const lastFetchedTime = new Date(lastFetchedAt).getTime();
  if (Number.isNaN(lastFetchedTime)) {
    return false;
  }

  return Date.now() - lastFetchedTime <= env.PROSPECTING_DETAIL_CACHE_HOURS * 60 * 60 * 1000;
}

async function getQuotaSnapshot(): Promise<ProspectQuotaSnapshot> {
  const result = await pool.query<UsageCountsRow>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE sku = $1
            AND (created_at AT TIME ZONE $3)::date = (NOW() AT TIME ZONE $3)::date
        )::int AS text_search_daily_used,
        COUNT(*) FILTER (
          WHERE sku = $1
            AND TO_CHAR(created_at AT TIME ZONE $3, 'YYYY-MM') = TO_CHAR(NOW() AT TIME ZONE $3, 'YYYY-MM')
        )::int AS text_search_monthly_used,
        COUNT(*) FILTER (
          WHERE sku = $2
            AND (created_at AT TIME ZONE $3)::date = (NOW() AT TIME ZONE $3)::date
        )::int AS place_details_daily_used,
        COUNT(*) FILTER (
          WHERE sku = $2
            AND TO_CHAR(created_at AT TIME ZONE $3, 'YYYY-MM') = TO_CHAR(NOW() AT TIME ZONE $3, 'YYYY-MM')
        )::int AS place_details_monthly_used
      FROM prospect_api_usage_logs
    `,
    [TEXT_SEARCH_SKU, PLACE_DETAILS_SKU, env.PROSPECTING_TIMEZONE],
  );

  const row = result.rows[0];
  const textSearchDailyUsed = toCount(row?.text_search_daily_used);
  const textSearchMonthlyUsed = toCount(row?.text_search_monthly_used);
  const placeDetailsDailyUsed = toCount(row?.place_details_daily_used);
  const placeDetailsMonthlyUsed = toCount(row?.place_details_monthly_used);

  return {
    googleEnabled: Boolean(env.GOOGLE_MAPS_API_KEY),
    searchPageSize: env.PROSPECTING_SEARCH_PAGE_SIZE,
    snapshotCacheHours: env.PROSPECTING_SNAPSHOT_CACHE_HOURS,
    detailCacheHours: env.PROSPECTING_DETAIL_CACHE_HOURS,
    textSearch: {
      dailyLimit: env.PROSPECTING_TEXT_SEARCH_DAILY_LIMIT,
      dailyUsed: textSearchDailyUsed,
      dailyRemaining: Math.max(0, env.PROSPECTING_TEXT_SEARCH_DAILY_LIMIT - textSearchDailyUsed),
      monthlyLimit: env.PROSPECTING_TEXT_SEARCH_MONTHLY_LIMIT,
      monthlyUsed: textSearchMonthlyUsed,
      monthlyRemaining: Math.max(0, env.PROSPECTING_TEXT_SEARCH_MONTHLY_LIMIT - textSearchMonthlyUsed),
    },
    placeDetails: {
      dailyLimit: env.PROSPECTING_PLACE_DETAILS_DAILY_LIMIT,
      dailyUsed: placeDetailsDailyUsed,
      dailyRemaining: Math.max(0, env.PROSPECTING_PLACE_DETAILS_DAILY_LIMIT - placeDetailsDailyUsed),
      monthlyLimit: env.PROSPECTING_PLACE_DETAILS_MONTHLY_LIMIT,
      monthlyUsed: placeDetailsMonthlyUsed,
      monthlyRemaining: Math.max(0, env.PROSPECTING_PLACE_DETAILS_MONTHLY_LIMIT - placeDetailsMonthlyUsed),
    },
  };
}

async function recordGoogleUsage(
  sku: typeof TEXT_SEARCH_SKU | typeof PLACE_DETAILS_SKU,
  user: JwtUser,
  metadata: Record<string, unknown> = {},
) {
  await pool.query(
    `
      INSERT INTO prospect_api_usage_logs (sku, requested_by_user_id, requested_by_name, metadata)
      VALUES ($1, $2::uuid, $3, $4::jsonb)
    `,
    [sku, user.id, user.name, JSON.stringify(metadata)],
  );
}

async function getLeadById(leadId: string, currentUserId: string) {
  const result = await pool.query<ProspectLeadRow>(
    `
      SELECT
        id,
        google_place_id,
        source,
        display_name,
        primary_category,
        rating,
        user_rating_count,
        phone,
        normalized_phone,
        website_url,
        address,
        state,
        city,
        maps_url,
        score,
        status,
        assigned_to_user_id,
        assigned_to_name,
        assigned_to_role,
        claimed_at::text AS claimed_at,
        first_contact_at::text AS first_contact_at,
        last_contact_at::text AS last_contact_at,
        last_contact_by_name,
        discard_reason,
        last_google_basic_sync_at::text AS last_google_basic_sync_at,
        last_google_detail_sync_at::text AS last_google_detail_sync_at
      FROM prospect_leads
      WHERE id = $1::uuid
    `,
    [leadId],
  );

  const row = result.rows[0];
  return row ? mapLead(row, currentUserId) : null;
}

async function listKeywordPresets(): Promise<ProspectKeywordPreset[]> {
  const result = await pool.query(
    `
      SELECT id, label, keyword, description, sort_order
      FROM prospect_keyword_presets
      ORDER BY sort_order ASC, label ASC
    `,
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    keyword: String(row.keyword),
    description: String(row.description ?? ""),
    sortOrder: toCount(row.sort_order),
  }));
}

async function ensureDefaultKeywordPresets() {
  for (const preset of DEFAULT_PRESET_DEFINITIONS) {
    await pool.query(
      `
        INSERT INTO prospect_keyword_presets (label, keyword, description, sort_order, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (keyword) DO UPDATE
        SET
          label = EXCLUDED.label,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `,
      [preset.label, preset.keyword, preset.description, preset.sortOrder],
    );
  }

  await pool.query(
    `
      DELETE FROM prospect_keyword_presets
      WHERE keyword = ANY($1::text[])
    `,
    [LEGACY_PRESET_KEYWORDS_TO_HIDE],
  );
}

async function upsertLeadBasicsFromGoogle(
  place: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    googleMapsUri?: string;
    primaryTypeDisplayName?: { text?: string };
  },
  query: {
    keyword: string;
    state: string;
    city?: string | null;
  },
) {
  const displayName = normalizeText(place.displayName?.text ?? "Lead Google Maps");
  const primaryCategory = normalizeText(place.primaryTypeDisplayName?.text ?? "");
  const address = normalizeText(place.formattedAddress ?? "");
  const mapsUrl = normalizeText(place.googleMapsUri ?? "");

  const score = calculateProspectScore({
    keyword: query.keyword,
    state: query.state,
    city: query.city,
    displayName,
    primaryCategory,
    leadState: query.state,
    leadCity: query.city,
    isWorked: false,
  });

  await pool.query(
    `
      INSERT INTO prospect_leads (
        google_place_id,
        source,
        display_name,
        normalized_name,
        primary_category,
        normalized_primary_category,
        address,
        state,
        city,
        maps_url,
        score,
        last_google_basic_sync_at,
        updated_at
      )
      VALUES ($1, 'GOOGLE_PLACES', $2, $3, $4, $5, $6, $7, NULLIF($8, ''), NULLIF($9, ''), $10, NOW(), NOW())
      ON CONFLICT (google_place_id) DO UPDATE
      SET
        display_name = EXCLUDED.display_name,
        normalized_name = EXCLUDED.normalized_name,
        primary_category = COALESCE(NULLIF(EXCLUDED.primary_category, ''), prospect_leads.primary_category),
        normalized_primary_category = COALESCE(NULLIF(EXCLUDED.normalized_primary_category, ''), prospect_leads.normalized_primary_category),
        address = COALESCE(NULLIF(EXCLUDED.address, ''), prospect_leads.address),
        state = EXCLUDED.state,
        city = COALESCE(NULLIF(EXCLUDED.city, ''), prospect_leads.city),
        maps_url = COALESCE(NULLIF(EXCLUDED.maps_url, ''), prospect_leads.maps_url),
        score = EXCLUDED.score,
        last_google_basic_sync_at = NOW(),
        updated_at = NOW()
    `,
    [
      place.id,
      displayName,
      normalizeName(displayName),
      primaryCategory,
      normalizeName(primaryCategory),
      address,
      normalizeText(query.state).toUpperCase(),
      normalizeText(query.city ?? ""),
      mapsUrl,
      score,
    ],
  );
}

async function saveSearchSnapshot(
  signature: string,
  query: {
    keyword: string;
    state: string;
    city?: string | null;
  },
  placeIds: string[],
) {
  await pool.query(
    `
      INSERT INTO prospect_search_snapshots (
        query_signature,
        keyword,
        state,
        city,
        result_place_ids,
        last_fetched_at,
        updated_at
      )
      VALUES ($1, $2, $3, NULLIF($4, ''), $5::text[], NOW(), NOW())
      ON CONFLICT (query_signature) DO UPDATE
      SET
        keyword = EXCLUDED.keyword,
        state = EXCLUDED.state,
        city = EXCLUDED.city,
        result_place_ids = EXCLUDED.result_place_ids,
        last_fetched_at = NOW(),
        updated_at = NOW()
    `,
    [signature, normalizeText(query.keyword), normalizeText(query.state).toUpperCase(), normalizeText(query.city ?? ""), placeIds],
  );
}

async function getSearchSnapshot(signature: string) {
  const result = await pool.query(
    `
      SELECT query_signature, result_place_ids, last_fetched_at::text AS last_fetched_at
      FROM prospect_search_snapshots
      WHERE query_signature = $1
    `,
    [signature],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    querySignature: String(row.query_signature),
    resultPlaceIds: Array.isArray(row.result_place_ids) ? row.result_place_ids.map((value: unknown) => String(value)) : [],
    lastFetchedAt: String(row.last_fetched_at),
  };
}

async function listProspectLeads(
  filters: Required<Pick<ProspectSearchQuery, "keyword" | "state">> &
    Omit<ProspectSearchQuery, "keyword" | "state">,
  user: JwtUser,
  scopedPlaceIds?: string[],
) {
  const clauses = ["status <> 'DISCARDED'"];
  const params: unknown[] = [];
  let orderSql = "score DESC, user_rating_count DESC, display_name ASC";

  const push = (sqlFactory: (index: number) => string, value: unknown) => {
    params.push(value);
    clauses.push(sqlFactory(params.length));
  };

  const normalizedKeyword = normalizeText(filters.keyword);
  const normalizedState = normalizeText(filters.state).toUpperCase();
  const normalizedCity = normalizeText(filters.city ?? "");

  if (scopedPlaceIds?.length) {
    params.push(scopedPlaceIds);
    const placeIdsIndex = params.length;
    clauses.push(`google_place_id = ANY($${placeIdsIndex}::text[])`);
    orderSql = `COALESCE(array_position($${placeIdsIndex}::text[], google_place_id), 2147483647), ${orderSql}`;
  }

  push((index) => `state = $${index}`, normalizedState);

  if (normalizedCity) {
    push((index) => `LOWER(COALESCE(city, '')) = LOWER($${index})`, normalizedCity);
  }

  if (!scopedPlaceIds?.length) {
    const likeValue = `%${normalizeName(normalizedKeyword)}%`;
    params.push(likeValue);
    const keywordNameIndex = params.length;
    params.push(likeValue);
    const keywordCategoryIndex = params.length;
    clauses.push(`(normalized_name LIKE $${keywordNameIndex} OR COALESCE(normalized_primary_category, '') LIKE $${keywordCategoryIndex})`);
  }

  if (filters.myLeads) {
    push((index) => `assigned_to_user_id = $${index}::uuid`, user.id);
  } else if (filters.onlyUnassigned) {
    clauses.push("assigned_to_user_id IS NULL");
  } else {
    push((index) => `(assigned_to_user_id IS NULL OR assigned_to_user_id = $${index}::uuid)`, user.id);
  }

  if (filters.hasPhone) {
    clauses.push("normalized_phone IS NOT NULL");
  }

  if (!filters.includeWorked || filters.onlyNew) {
    clauses.push("first_contact_at IS NULL");
  }

  params.push(Math.max(1, Math.min(filters.limit ?? env.PROSPECTING_SEARCH_PAGE_SIZE, 20)));
  const limitIndex = params.length;

  const result = await pool.query<ProspectLeadRow>(
    `
      SELECT
        id,
        google_place_id,
        source,
        display_name,
        primary_category,
        rating,
        user_rating_count,
        phone,
        normalized_phone,
        website_url,
        address,
        state,
        city,
        maps_url,
        score,
        status,
        assigned_to_user_id,
        assigned_to_name,
        assigned_to_role,
        claimed_at::text AS claimed_at,
        first_contact_at::text AS first_contact_at,
        last_contact_at::text AS last_contact_at,
        last_contact_by_name,
        discard_reason,
        last_google_basic_sync_at::text AS last_google_basic_sync_at,
        last_google_detail_sync_at::text AS last_google_detail_sync_at
      FROM prospect_leads
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${orderSql}
      LIMIT $${limitIndex}
    `,
    params,
  );

  return result.rows.map((row) => mapLead(row, user.id));
}

async function refreshLeadDetailsIfAllowed(lead: ProspectLead, user: JwtUser, force = false) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return lead;
  }

  if (!force && isDetailStillFresh(lead.lastGoogleDetailSyncAt, lead)) {
    return lead;
  }

  const quota = await getQuotaSnapshot();
  if (quota.placeDetails.dailyRemaining <= 0 || quota.placeDetails.monthlyRemaining <= 0) {
    return lead;
  }

  const details = await getGooglePlaceDetails(lead.googlePlaceId);
  const normalizedPhone = normalizeProspectPhone(details.nationalPhoneNumber ?? null);

  const score = calculateProspectScore({
    keyword: lead.primaryCategory ?? lead.displayName,
    state: lead.state,
    city: lead.city,
    displayName: lead.displayName,
    primaryCategory: lead.primaryCategory,
    rating: details.rating ?? lead.rating,
    reviewCount: details.userRatingCount ?? lead.reviewCount,
    phone: details.nationalPhoneNumber ?? lead.phone,
    websiteUrl: details.websiteUri ?? lead.websiteUrl,
    leadState: lead.state,
    leadCity: lead.city,
    isWorked: lead.isWorked,
  });

  await pool.query(
    `
      UPDATE prospect_leads
      SET
        rating = $2,
        user_rating_count = $3,
        phone = NULLIF($4, ''),
        normalized_phone = NULLIF($5, ''),
        website_url = NULLIF($6, ''),
        score = $7,
        last_google_detail_sync_at = NOW(),
        updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [
      lead.id,
      details.rating ?? lead.rating,
      details.userRatingCount ?? lead.reviewCount,
      normalizeText(details.nationalPhoneNumber ?? lead.phone ?? ""),
      normalizedPhone ?? "",
      normalizeText(details.websiteUri ?? lead.websiteUrl ?? ""),
      score,
    ],
  );

  await recordGoogleUsage(PLACE_DETAILS_SKU, user, { leadId: lead.id, googlePlaceId: lead.googlePlaceId });
  const updated = await getLeadById(lead.id, user.id);
  if (!updated) {
    throw new HttpError(404, "Lead nao encontrado apos atualizar detalhes.");
  }
  return updated;
}

export async function getProspectingConfig(): Promise<ProspectingConfig> {
  await ensureDefaultKeywordPresets();
  const [presets, quota] = await Promise.all([listKeywordPresets(), getQuotaSnapshot()]);

  return {
    apiEnabled: quota.googleEnabled,
    defaultDailyTarget: env.PROSPECTING_DAILY_TARGET,
    defaultSearchFilters: {
      onlyNew: true,
      onlyUnassigned: false,
      includeWorked: false,
      hasPhone: false,
      myLeads: false,
      limit: env.PROSPECTING_SEARCH_PAGE_SIZE,
    },
    quota,
    presets,
    guardrails: [
      "Busca manual e enxuta: sem carregamento automatico ao digitar.",
      "Priorize reaproveitar o cache antes de atualizar no Google.",
      "Detalhes completos so aparecem ao assumir o lead ou quando ja estiverem em cache.",
      "Quando a franquia interna bater 100%, o CRM deixa de consultar o Google ate virar o mes.",
    ],
  };
}

export async function getProspectingSummary(user: JwtUser): Promise<ProspectingDailySummary> {
  const [quota, contactsResult, claimedResult] = await Promise.all([
    getQuotaSnapshot(),
    pool.query(
      `
        SELECT COUNT(DISTINCT lead_id)::int AS unique_contacts_today
        FROM prospect_contact_attempts
        WHERE seller_user_id = $1::uuid
          AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
      `,
      [user.id, env.PROSPECTING_TIMEZONE],
    ),
    pool.query(
      `
        SELECT COUNT(*)::int AS claimed_lead_count
        FROM prospect_leads
        WHERE assigned_to_user_id = $1::uuid
          AND status = 'CLAIMED'
      `,
      [user.id],
    ),
  ]);

  const uniqueContactsToday = toCount(contactsResult.rows[0]?.unique_contacts_today);
  const claimedLeadCount = toCount(claimedResult.rows[0]?.claimed_lead_count);

  return {
    date: new Intl.DateTimeFormat("sv-SE", {
      timeZone: env.PROSPECTING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    seller: mapAssignee(user),
    dailyTarget: env.PROSPECTING_DAILY_TARGET,
    uniqueContactsToday,
    claimedLeadCount,
    remainingToGoal: Math.max(0, env.PROSPECTING_DAILY_TARGET - uniqueContactsToday),
    quota,
  };
}

export async function createProspectKeywordPreset(input: { keyword: string }) {
  const keyword = normalizeText(input.keyword);
  if (!keyword) {
    throw new HttpError(400, "Informe uma palavra-chave para salvar.");
  }

  const result = await pool.query(
    `
      INSERT INTO prospect_keyword_presets (label, keyword, description, sort_order, updated_at)
      VALUES (
        $1,
        $2,
        'Busca salva manualmente pela equipe.',
        COALESCE((SELECT MAX(sort_order) + 10 FROM prospect_keyword_presets), 100),
        NOW()
      )
      ON CONFLICT (keyword) DO UPDATE
      SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        updated_at = NOW()
      RETURNING id, label, keyword, description, sort_order
    `,
    [formatPresetLabel(keyword), keyword],
  );

  const row = result.rows[0];
  return {
    id: String(row.id),
    label: String(row.label),
    keyword: String(row.keyword),
    description: String(row.description ?? ""),
    sortOrder: toCount(row.sort_order),
  } satisfies ProspectKeywordPreset;
}

export async function searchProspectLeads(query: ProspectSearchQuery, user: JwtUser): Promise<ProspectSearchResponse> {
  const cleanedQuery = {
    keyword: normalizeText(query.keyword),
    state: normalizeText(query.state).toUpperCase(),
    city: normalizeText(query.city ?? "") || undefined,
    onlyNew: query.onlyNew ?? true,
    onlyUnassigned: query.onlyUnassigned ?? false,
    hasPhone: query.hasPhone ?? false,
    myLeads: query.myLeads ?? false,
    includeWorked: query.includeWorked ?? false,
    limit: Math.max(1, Math.min(query.limit ?? env.PROSPECTING_SEARCH_PAGE_SIZE, 20)),
    refresh: query.refresh ?? false,
  } satisfies Required<Pick<ProspectSearchQuery, "keyword" | "state">> &
    Omit<ProspectSearchQuery, "keyword" | "state">;

  let source: ProspectSearchResponse["source"] = "local";
  let cacheHit = false;
  let notice: string | null = null;
  let scopedPlaceIds: string[] | undefined;

  const signature = buildQuerySignature(cleanedQuery.keyword, cleanedQuery.state, cleanedQuery.city);
  const [snapshot, initialQuota] = await Promise.all([getSearchSnapshot(signature), getQuotaSnapshot()]);

  if (snapshot && isCacheStillValid(snapshot.lastFetchedAt) && !cleanedQuery.refresh) {
    source = "snapshot";
    cacheHit = true;
    scopedPlaceIds = snapshot.resultPlaceIds;
    notice = "Resultado reaproveitado do cache para proteger a franquia gratuita.";
  } else if (
    initialQuota.googleEnabled &&
    initialQuota.textSearch.dailyRemaining > 0 &&
    initialQuota.textSearch.monthlyRemaining > 0
  ) {
    const places = await searchGooglePlacesText({
      keyword: cleanedQuery.keyword,
      state: cleanedQuery.state,
      city: cleanedQuery.city,
      pageSize: cleanedQuery.limit,
    });

    for (const place of places) {
      await upsertLeadBasicsFromGoogle(place, cleanedQuery);
    }

    scopedPlaceIds = places.map((place) => place.id);
    await saveSearchSnapshot(signature, cleanedQuery, scopedPlaceIds);
    await recordGoogleUsage(TEXT_SEARCH_SKU, user, {
      keyword: cleanedQuery.keyword,
      state: cleanedQuery.state,
      city: cleanedQuery.city,
      resultCount: scopedPlaceIds.length,
    });

    source = "google";
    notice =
      scopedPlaceIds.length > 0
        ? "Busca atualizada no Google com lista curta para manter o uso dentro da faixa gratuita."
        : "Nenhum lead novo encontrado para essa busca no Google Places.";
  } else if (snapshot) {
    source = "snapshot";
    cacheHit = true;
    scopedPlaceIds = snapshot.resultPlaceIds;
    notice = initialQuota.googleEnabled
      ? "Franquia protegida: exibindo os ultimos resultados salvos para essa busca."
      : "Google Places nao configurado: exibindo os ultimos resultados salvos.";
  } else {
    notice = initialQuota.googleEnabled
      ? "Sem consulta externa por limite gratuito. Refine os filtros ou aguarde o reset da franquia."
      : "Google Places nao configurado neste ambiente. Defina GOOGLE_MAPS_API_KEY no .env para a busca real funcionar.";
  }

  const items = await listProspectLeads(cleanedQuery, user, scopedPlaceIds);
  const quota = await getQuotaSnapshot();

  return {
    query: {
      keyword: cleanedQuery.keyword,
      state: cleanedQuery.state,
      city: cleanedQuery.city ?? null,
    },
    source,
    cacheHit,
    notice,
    quota,
    items,
  };
}

export async function claimProspectLead(leadId: string, user: JwtUser) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<ProspectLeadRow>(
      `
        SELECT
          id,
          google_place_id,
          source,
          display_name,
          primary_category,
          rating,
          user_rating_count,
          phone,
          normalized_phone,
          website_url,
          address,
          state,
          city,
          maps_url,
          score,
          status,
          assigned_to_user_id,
          assigned_to_name,
          assigned_to_role,
          claimed_at::text AS claimed_at,
          first_contact_at::text AS first_contact_at,
          last_contact_at::text AS last_contact_at,
          last_contact_by_name,
          discard_reason,
          last_google_basic_sync_at::text AS last_google_basic_sync_at,
          last_google_detail_sync_at::text AS last_google_detail_sync_at
        FROM prospect_leads
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [leadId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(404, "Lead nao encontrado.");
    }

    if (row.status === "DISCARDED") {
      throw new HttpError(400, "Lead descartado nao pode ser assumido.");
    }

    if (row.assigned_to_user_id && String(row.assigned_to_user_id) !== user.id) {
      throw new HttpError(409, "Esse lead ja foi assumido por outra pessoa.");
    }

    await client.query(
      `
        UPDATE prospect_leads
        SET
          status = CASE WHEN first_contact_at IS NULL THEN 'CLAIMED' ELSE 'CONTACTED' END,
          assigned_to_user_id = $2::uuid,
          assigned_to_name = $3,
          assigned_to_role = $4,
          claimed_at = COALESCE(claimed_at, NOW()),
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [leadId, user.id, user.name, user.role],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const claimedLead = await getLeadById(leadId, user.id);
  if (!claimedLead) {
    throw new HttpError(404, "Lead nao encontrado apos assumir.");
  }

  return refreshLeadDetailsIfAllowed(claimedLead, user);
}

export async function releaseProspectLead(leadId: string, user: JwtUser) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<ProspectLeadRow>(
      `
        SELECT
          id,
          google_place_id,
          source,
          display_name,
          primary_category,
          rating,
          user_rating_count,
          phone,
          normalized_phone,
          website_url,
          address,
          state,
          city,
          maps_url,
          score,
          status,
          assigned_to_user_id,
          assigned_to_name,
          assigned_to_role,
          claimed_at::text AS claimed_at,
          first_contact_at::text AS first_contact_at,
          last_contact_at::text AS last_contact_at,
          last_contact_by_name,
          discard_reason,
          last_google_basic_sync_at::text AS last_google_basic_sync_at,
          last_google_detail_sync_at::text AS last_google_detail_sync_at
        FROM prospect_leads
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [leadId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(404, "Lead nao encontrado.");
    }
    const lead = mapLead(row, user.id);

    if (lead.assignedTo?.id !== user.id && user.role !== "ADMIN") {
      throw new HttpError(403, "Somente quem assumiu o lead pode libera-lo.");
    }

    if (lead.firstContactAt && user.role !== "ADMIN") {
      throw new HttpError(400, "Depois do primeiro contato, apenas um admin pode liberar esse lead.");
    }

    await client.query(
      `
        UPDATE prospect_leads
        SET
          status = CASE WHEN first_contact_at IS NULL THEN 'NEW' ELSE 'CONTACTED' END,
          assigned_to_user_id = NULL,
          assigned_to_name = NULL,
          assigned_to_role = NULL,
          claimed_at = NULL,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [leadId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const releasedLead = await getLeadById(leadId, user.id);
  if (!releasedLead) {
    throw new HttpError(404, "Lead nao encontrado apos liberar.");
  }
  return releasedLead;
}

export async function discardProspectLead(leadId: string, user: JwtUser, reason?: string) {
  const lead = await getLeadById(leadId, user.id);
  if (!lead) {
    throw new HttpError(404, "Lead nao encontrado.");
  }

  if (lead.assignedTo?.id && lead.assignedTo.id !== user.id && user.role !== "ADMIN") {
    throw new HttpError(403, "Esse lead esta reservado por outra pessoa.");
  }

  await pool.query(
    `
      UPDATE prospect_leads
      SET
        status = 'DISCARDED',
        discard_reason = NULLIF($2, ''),
        assigned_to_user_id = CASE WHEN assigned_to_user_id IS NULL THEN NULL ELSE assigned_to_user_id END,
        assigned_to_name = CASE WHEN assigned_to_name IS NULL THEN NULL ELSE assigned_to_name END,
        assigned_to_role = CASE WHEN assigned_to_role IS NULL THEN NULL ELSE assigned_to_role END,
        updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [leadId, normalizeText(reason ?? "")],
  );

  const discardedLead = await getLeadById(leadId, user.id);
  if (!discardedLead) {
    throw new HttpError(404, "Lead nao encontrado apos descartar.");
  }
  return discardedLead;
}

export async function createProspectContactAttempt(
  leadId: string,
  user: JwtUser,
  input: {
    channel: ProspectContactChannel;
    contactType: ProspectContactType;
    notes?: string;
  },
): Promise<ProspectContactAttemptResult> {
  const client = await pool.connect();

  let attempt: ProspectContactAttempt | null = null;

  try {
    await client.query("BEGIN");
    const result = await client.query<ProspectLeadRow>(
      `
        SELECT
          id,
          google_place_id,
          source,
          display_name,
          primary_category,
          rating,
          user_rating_count,
          phone,
          normalized_phone,
          website_url,
          address,
          state,
          city,
          maps_url,
          score,
          status,
          assigned_to_user_id,
          assigned_to_name,
          assigned_to_role,
          claimed_at::text AS claimed_at,
          first_contact_at::text AS first_contact_at,
          last_contact_at::text AS last_contact_at,
          last_contact_by_name,
          discard_reason,
          last_google_basic_sync_at::text AS last_google_basic_sync_at,
          last_google_detail_sync_at::text AS last_google_detail_sync_at
        FROM prospect_leads
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [leadId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new HttpError(404, "Lead nao encontrado.");
    }
    const lead = mapLead(row, user.id);

    if (lead.assignedTo?.id && lead.assignedTo.id !== user.id && user.role !== "ADMIN") {
      throw new HttpError(403, "Esse lead esta reservado por outra pessoa.");
    }

    const attemptResult = await client.query(
      `
        INSERT INTO prospect_contact_attempts (
          lead_id,
          seller_user_id,
          seller_name,
          seller_role,
          channel,
          contact_type,
          notes
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
        RETURNING
          id,
          lead_id,
          seller_user_id,
          seller_name,
          seller_role,
          channel,
          contact_type,
          notes,
          created_at::text AS created_at
      `,
      [leadId, user.id, user.name, user.role, input.channel, input.contactType, normalizeText(input.notes ?? "")],
    );

    attempt = mapAttempt(attemptResult.rows[0]);

    await client.query(
      `
        UPDATE prospect_leads
        SET
          status = 'CONTACTED',
          assigned_to_user_id = $2::uuid,
          assigned_to_name = $3,
          assigned_to_role = $4,
          claimed_at = COALESCE(claimed_at, NOW()),
          first_contact_at = COALESCE(first_contact_at, NOW()),
          last_contact_at = NOW(),
          last_contact_by_user_id = $2::uuid,
          last_contact_by_name = $3,
          updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [leadId, user.id, user.name, user.role],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const [lead, summary] = await Promise.all([getLeadById(leadId, user.id), getProspectingSummary(user)]);
  if (!attempt || !lead) {
    throw new HttpError(500, "Nao foi possivel finalizar o registro de contato.");
  }

  return {
    attempt,
    lead,
    summary,
  };
}

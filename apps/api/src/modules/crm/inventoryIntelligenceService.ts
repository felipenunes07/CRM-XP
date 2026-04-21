import type {
  InventoryBuyingListItem,
  InventoryBuyingResponse,
  InventoryBuyRecommendation,
  InventoryCustomerSuggestion,
  InventoryDailySeriesPoint,
  InventoryDemandStatus,
  InventoryIntelligenceAppliedFilters,
  InventoryIntelligenceDetailResponse,
  InventoryIntelligenceFilters,
  InventoryIntelligenceItem,
  InventoryIntelligenceResponse,
  InventoryModelBenchmarks,
  InventoryModelDepositBalance,
  InventoryModelDetailResponse,
  InventoryModelListItem,
  InventoryModelTopCustomer,
  InventoryModelsResponse,
  InventoryOverviewCard,
  InventoryOverviewResponse,
  InventoryProductEnrichment,
  InventoryQuadrant,
  InventoryQuadrantCell,
  InventoryRestockListItem,
  InventoryRestockResponse,
  InventoryRestockStatus,
  InventorySellerActionItem,
  InventorySellerActionType,
  InventorySnapshotMeta,
  InventoryStaleAction,
  InventoryStaleListItem,
  InventoryStaleResponse,
  InventoryStockHistoryPoint,
  InventoryStockStatus,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText } from "../../lib/normalize.js";
import {
  OlistClient,
  type OlistContactDetail,
  type OlistProductDetail,
  type OlistProductSearchItem,
  type OlistProductStock,
  withRetry,
} from "../ingestion/olistClient.js";
import { getInventorySnapshotWithItems } from "./inventoryService.js";

const INVENTORY_COVERAGE_LOW_DAYS = 15;
const INVENTORY_HIGH_STOCK_THRESHOLD = 50;
const INVENTORY_WARM_SALES_90D = 40;
const INVENTORY_HOT_SALES_90D = 200;
const INVENTORY_WARM_ORDERS_90D = 6;
const INVENTORY_HOT_ORDERS_90D = 20;
const PRODUCT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INTELLIGENCE_PREVIEW_ENRICHMENT_LIMIT = 18;
const FAMILY_DETAIL_LIMIT = 8;
const STOCK_HISTORY_LIMIT = 14;
const SELLER_QUEUE_LIMIT = 8;

const INVENTORY_STOPWORDS = new Set([
  "doc",
  "de",
  "carga",
  "premier",
  "max",
  "outlet",
  "conector",
  "lcd",
  "oled",
  "ori",
  "original",
  "com",
  "aro",
  "destaque",
  "preto",
  "branco",
  "azul",
  "verde",
  "rosa",
  "roxo",
  "roxa",
  "prata",
  "cinza",
  "dourado",
  "gold",
  "black",
  "white",
  "versao",
  "versão",
  "troca",
  "borda",
  "fina",
  "grossa",
  "plus",
  "mini",
]);

interface InventorySalesAggregate {
  sales30: number;
  sales90: number;
  orders30: number;
  orders90: number;
}

interface InventorySnapshotRow {
  id: string;
  sourceName: string;
  sourceUrl: string;
  importedAt: string;
  totalRows: number;
  inStockRows: number;
  matchedSkuRows: number;
}

interface TinyProductCacheRow {
  sku: string;
  match_method: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  category_tree: string | null;
  supplier_name: string | null;
  price: string | number | null;
  promotional_price: string | number | null;
  cost_price: string | number | null;
  average_cost_price: string | number | null;
  location: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  contact_id: string | null;
  seller_id: string | null;
  seller_name: string | null;
  city: string | null;
  state: string | null;
  reserved_stock: string | number | null;
  deposits: unknown;
  fetched_at: string;
}

interface TinyContactCacheRow {
  customer_code: string;
  contact_id: string | null;
  contact_name: string | null;
  fantasy_name: string | null;
  city: string | null;
  state: string | null;
  seller_id: string | null;
  seller_name: string | null;
  fetched_at: string;
}

interface BuiltInventoryContext {
  snapshot: InventorySnapshotMeta | null;
  previousSnapshot: InventorySnapshotMeta | null;
  items: InventoryIntelligenceItem[];
}

interface ProvisionalSellerAction {
  actionType: InventorySellerActionType;
  item: InventoryIntelligenceItem;
  headline: string;
  reason: string;
}

interface SuggestedCustomerRow {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  lastAttendant: string | null;
  availableCreditAmount: number;
  creditBalanceAmount: number;
  sellerName: string | null;
}

function scheduleInventoryBackgroundTask(task: Promise<unknown>, context: Record<string, unknown>) {
  void task.catch((error) => {
    logger.warn("inventory background refresh failed", {
      ...context,
      error: String(error),
    });
  });
}

const olistClient = new OlistClient();

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanInventoryModelLabel(model: string) {
  let cleaned = normalizeText(model);
  
  // Remove SKU code prefixes from the spreadsheet like "12/31/00 - " or "1338-1 - "
  // It matches a single word starting with a digit and containing alphanumeric/slashes/dashes
  cleaned = cleaned.replace(/^\d[\w/-]*\s+-\s+/, "");

  return cleaned
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveInventoryProductKind(model: string) {
  return removeDiacritics(normalizeText(model)).toUpperCase().includes("DOC DE CARGA") ? "DOC_DE_CARGA" : "TELA";
}

function tokenizeInventoryValue(value: string) {
  return removeDiacritics(cleanInventoryModelLabel(value))
    .toLowerCase()
    .replace(/[.,;:*"'`´~^()[\]{}|\\/_-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !INVENTORY_STOPWORDS.has(token));
}

function deriveInventoryGrouping(model: string) {
  const tokens = tokenizeInventoryValue(model);
  const brand = tokens[0]?.toUpperCase() ?? "OUTROS";
  const familyTokens = tokens.slice(1, 4);

  return {
    brand,
    family: familyTokens.length ? familyTokens.join(" ").toUpperCase() : brand,
    productKind: deriveInventoryProductKind(model),
  };
}

function toNumber(value: unknown) {
  const maybe = Number(value ?? 0);
  return Number.isFinite(maybe) ? maybe : 0;
}

function toMaybeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const maybe = Number(value);
  return Number.isFinite(maybe) ? maybe : null;
}

function toMeta(row: InventorySnapshotRow | null): InventorySnapshotMeta | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    importedAt: new Date(row.importedAt).toISOString(),
    totalRows: row.totalRows,
    inStockRows: row.inStockRows,
    matchedSkuRows: row.matchedSkuRows,
  };
}

function parseCachedAt(value: string | null | undefined) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCacheStale(cachedAt: string | null | undefined) {
  const parsed = parseCachedAt(cachedAt);
  if (!parsed) {
    return true;
  }

  return Date.now() - parsed.getTime() > PRODUCT_CACHE_TTL_MS;
}

export function resolveInventoryDemandStatus(sales90: number, orders90: number): InventoryDemandStatus {
  if (sales90 <= 0 && orders90 <= 0) {
    return "NO_SALES";
  }

  if (sales90 >= INVENTORY_HOT_SALES_90D || orders90 >= INVENTORY_HOT_ORDERS_90D) {
    return "HOT";
  }

  if (sales90 >= INVENTORY_WARM_SALES_90D || orders90 >= INVENTORY_WARM_ORDERS_90D) {
    return "WARM";
  }

  return "COLD";
}

export function resolveInventoryStockStatus(stockCurrent: number, coverageDays: number | null): InventoryStockStatus {
  if (stockCurrent < 0) {
    return "NEGATIVE";
  }

  if (stockCurrent === 0) {
    return "OUT";
  }

  if ((coverageDays !== null && coverageDays <= INVENTORY_COVERAGE_LOW_DAYS) || stockCurrent <= 10) {
    return "LOW";
  }

  if (stockCurrent >= INVENTORY_HIGH_STOCK_THRESHOLD) {
    return "HIGH";
  }

  return "HEALTHY";
}

export function resolveInventoryQuadrant(input: {
  stockCurrent: number;
  coverageDays: number | null;
  sales90: number;
  orders90: number;
}): InventoryQuadrant {
  const hasDemand = input.sales90 >= INVENTORY_WARM_SALES_90D || input.orders90 >= INVENTORY_WARM_ORDERS_90D;
  const stockNeedsAttention =
    input.stockCurrent <= 0 ||
    (input.coverageDays !== null && input.coverageDays <= INVENTORY_COVERAGE_LOW_DAYS);
  const overstockCold = input.stockCurrent >= INVENTORY_HIGH_STOCK_THRESHOLD && input.sales90 <= 0;

  if (hasDemand && stockNeedsAttention) {
    return "REPLENISH_URGENT";
  }

  if (hasDemand) {
    return "DRIVE_NOW";
  }

  if (overstockCold) {
    return "STALLED";
  }

  return "MONITOR";
}

function sortUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

function mapProductCache(row: TinyProductCacheRow): InventoryProductEnrichment {
  const deposits = Array.isArray(row.deposits)
    ? row.deposits
    : typeof row.deposits === "string"
      ? JSON.parse(row.deposits)
      : [];

  return {
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    matchMethod:
      row.match_method === "SKU" || row.match_method === "MODEL" || row.match_method === "NONE"
        ? row.match_method
        : "NONE",
    categoryTree: row.category_tree,
    supplierName: row.supplier_name,
    price: toMaybeNumber(row.price),
    promotionalPrice: toMaybeNumber(row.promotional_price),
    costPrice: toMaybeNumber(row.cost_price),
    averageCostPrice: toMaybeNumber(row.average_cost_price),
    location: row.location,
    createdAt: row.external_created_at ? new Date(row.external_created_at).toISOString() : null,
    updatedAt: row.external_updated_at ? new Date(row.external_updated_at).toISOString() : null,
    contactId: row.contact_id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    city: row.city,
    state: row.state,
    reservedStock: toMaybeNumber(row.reserved_stock),
    deposits: Array.isArray(deposits)
      ? deposits
          .map((deposit) => {
            const entry = deposit && typeof deposit === "object" ? (deposit as Record<string, unknown>) : null;
            if (!entry) {
              return null;
            }

            return {
              id: entry.id ? String(entry.id) : null,
              name: String(entry.name ?? "Sem deposito"),
              companyName: entry.companyName ? String(entry.companyName) : null,
              balance: toNumber(entry.balance),
              reservedBalance: toMaybeNumber(entry.reservedBalance),
              includesInTotal:
                typeof entry.includesInTotal === "boolean"
                  ? entry.includesInTotal
                  : entry.includesInTotal === null || entry.includesInTotal === undefined
                    ? null
                    : Boolean(entry.includesInTotal),
            };
          })
          .filter((deposit): deposit is NonNullable<InventoryProductEnrichment["deposits"][number]> => Boolean(deposit))
      : [],
    cachedAt: new Date(row.fetched_at).toISOString(),
    stale: isCacheStale(row.fetched_at),
  };
}

function mergeItemWithEnrichment(item: InventoryIntelligenceItem, enrichment: InventoryProductEnrichment | null) {
  return {
    ...item,
    depositNames: enrichment ? sortUnique(enrichment.deposits.map((deposit) => deposit.name)) : item.depositNames,
    sellerNames:
      enrichment?.sellerName
        ? sortUnique([...item.sellerNames, enrichment.sellerName])
        : item.sellerNames,
    enrichment,
  } satisfies InventoryIntelligenceItem;
}

function buildInventoryItem(input: {
  sku: string;
  model: string;
  color: string | null;
  quality: string | null;
  price: number;
  promotionLabel: string | null;
  stockCurrent: number;
  previousStock: number;
  sales: InventorySalesAggregate;
  enrichment: InventoryProductEnrichment | null;
}) {
  const grouping = deriveInventoryGrouping(input.model);
  const deltaNet = input.stockCurrent - input.previousStock;
  const deltaEntry = Math.max(deltaNet, 0);
  const deltaExit = Math.min(deltaNet, 0);
  const coverageDays =
    input.stockCurrent > 0 && input.sales.sales90 > 0
      ? Number(((input.stockCurrent / input.sales.sales90) * 90).toFixed(1))
      : null;

  const demandStatus = resolveInventoryDemandStatus(input.sales.sales90, input.sales.orders90);
  const stockStatus = resolveInventoryStockStatus(input.stockCurrent, coverageDays);
  const quadrant = resolveInventoryQuadrant({
    stockCurrent: input.stockCurrent,
    coverageDays,
    sales90: input.sales.sales90,
    orders90: input.sales.orders90,
  });

  const item = {
    sku: input.sku,
    model: cleanInventoryModelLabel(input.model),
    brand: grouping.brand,
    family: grouping.family,
    productKind: grouping.productKind,
    color: input.color,
    quality: input.quality,
    price: input.price,
    promotionLabel: input.promotionLabel,
    stockCurrent: input.stockCurrent,
    previousStock: input.previousStock,
    deltaNet,
    deltaEntry,
    deltaExit,
    sales30: input.sales.sales30,
    sales90: input.sales.sales90,
    orders30: input.sales.orders30,
    orders90: input.sales.orders90,
    coverageDays,
    stockStatus,
    demandStatus,
    quadrant,
    isHotRupture: input.stockCurrent <= 0 && input.sales.sales90 > 0,
    isLowCoverage: input.stockCurrent > 0 && coverageDays !== null && coverageDays <= INVENTORY_COVERAGE_LOW_DAYS,
    isOverstockCold: input.stockCurrent >= INVENTORY_HIGH_STOCK_THRESHOLD && input.sales.sales90 === 0,
    isNewArrival: deltaEntry > 0,
    isStrongOutgoing: deltaExit < 0 && input.sales.sales30 > 0,
    depositNames: input.enrichment ? sortUnique(input.enrichment.deposits.map((deposit) => deposit.name)) : [],
    sellerNames: input.enrichment?.sellerName ? [input.enrichment.sellerName] : [],
    enrichment: input.enrichment,
  } satisfies InventoryIntelligenceItem;

  return item;
}

function patchItemsWithEnrichment(
  items: InventoryIntelligenceItem[],
  enrichmentBySku: Map<string, InventoryProductEnrichment>,
) {
  return items.map((item) => mergeItemWithEnrichment(item, enrichmentBySku.get(item.sku) ?? item.enrichment));
}

function applyBaseFilters(items: InventoryIntelligenceItem[], filters: InventoryIntelligenceAppliedFilters) {
  return items.filter((item) => {
    if (filters.brand && item.brand !== filters.brand) {
      return false;
    }

    if (filters.family && item.family !== filters.family) {
      return false;
    }

    if (filters.quality && (item.quality ?? "SEM QUALIDADE") !== filters.quality) {
      return false;
    }

    if (filters.stockStatus && item.stockStatus !== filters.stockStatus) {
      return false;
    }

    if (filters.demandStatus && item.demandStatus !== filters.demandStatus) {
      return false;
    }

    if (filters.newArrivalOnly && !item.isNewArrival) {
      return false;
    }

    if (filters.depositName && !item.depositNames.includes(filters.depositName)) {
      return false;
    }

    return true;
  });
}

function sortByHotRupture(left: InventoryIntelligenceItem, right: InventoryIntelligenceItem) {
  return (
    right.sales90 - left.sales90 ||
    right.orders90 - left.orders90 ||
    left.stockCurrent - right.stockCurrent ||
    left.model.localeCompare(right.model, "pt-BR")
  );
}

function sortByLowCoverage(left: InventoryIntelligenceItem, right: InventoryIntelligenceItem) {
  return (
    (left.coverageDays ?? Number.POSITIVE_INFINITY) - (right.coverageDays ?? Number.POSITIVE_INFINITY) ||
    right.sales90 - left.sales90 ||
    left.model.localeCompare(right.model, "pt-BR")
  );
}

function sortByArrival(left: InventoryIntelligenceItem, right: InventoryIntelligenceItem) {
  return right.deltaEntry - left.deltaEntry || right.sales90 - left.sales90 || left.model.localeCompare(right.model, "pt-BR");
}

function sortByDeparture(left: InventoryIntelligenceItem, right: InventoryIntelligenceItem) {
  return left.deltaExit - right.deltaExit || right.sales30 - left.sales30 || left.model.localeCompare(right.model, "pt-BR");
}

function sortByColdOverstock(left: InventoryIntelligenceItem, right: InventoryIntelligenceItem) {
  return right.stockCurrent - left.stockCurrent || left.model.localeCompare(right.model, "pt-BR");
}

function buildMatrix(items: InventoryIntelligenceItem[]): InventoryQuadrantCell[] {
  const definitions: Array<{ quadrant: InventoryQuadrant; label: string }> = [
    { quadrant: "DRIVE_NOW", label: "Girar agora" },
    { quadrant: "REPLENISH_URGENT", label: "Repor urgente" },
    { quadrant: "MONITOR", label: "Monitorar" },
    { quadrant: "STALLED", label: "Parado" },
  ];

  return definitions.map(({ quadrant, label }) => {
    const bucket = items.filter((item) => item.quadrant === quadrant);
    const sorted = [...bucket].sort((left, right) => right.sales90 - left.sales90 || right.stockCurrent - left.stockCurrent);

    return {
      quadrant,
      label,
      itemCount: bucket.length,
      totalUnits: bucket.reduce((sum, item) => sum + item.stockCurrent, 0),
      topItems: sorted.slice(0, 3).map((item) => ({ sku: item.sku, model: item.model })),
    };
  });
}

function buildSummary(items: InventoryIntelligenceItem[]) {
  return {
    activeSkus: items.filter((item) => item.stockCurrent > 0).length,
    totalUnits: items.reduce((sum, item) => sum + item.stockCurrent, 0),
    hotRuptureCount: items.filter((item) => item.isHotRupture).length,
    lowCoverageCount: items.filter((item) => item.isLowCoverage).length,
    newArrivalCount: items.filter((item) => item.isNewArrival).length,
    stagnantCount: items.filter((item) => item.isOverstockCold).length,
    negativeStockCount: items.filter((item) => item.stockCurrent < 0).length,
  };
}

function buildFilters(items: InventoryIntelligenceItem[], actionItems: InventorySellerActionItem[]): InventoryIntelligenceFilters {
  return {
    brands: sortUnique(items.map((item) => item.brand)),
    families: sortUnique(items.map((item) => item.family)),
    qualities: sortUnique(items.map((item) => item.quality ?? "SEM QUALIDADE")),
    stockStatuses: ["NEGATIVE", "OUT", "LOW", "HEALTHY", "HIGH"],
    demandStatuses: ["NO_SALES", "COLD", "WARM", "HOT"],
    depositNames: sortUnique(items.flatMap((item) => item.depositNames)),
    sellers: sortUnique(
      actionItems.flatMap((action) =>
        action.suggestedCustomers.map((customer) => customer.sellerName ?? action.item.sellerNames[0] ?? ""),
      ),
    ),
  };
}

async function loadPreviousSnapshotMeta(currentSnapshotId: string) {
  const result = await pool.query<InventorySnapshotRow>(
    `
      SELECT
        id,
        source_name AS "sourceName",
        source_url AS "sourceUrl",
        imported_at::text AS "importedAt",
        total_rows AS "totalRows",
        in_stock_rows AS "inStockRows",
        matched_sku_rows AS "matchedSkuRows"
      FROM inventory_snapshots
      WHERE id <> $1
      ORDER BY imported_at DESC
      LIMIT 1
    `,
    [currentSnapshotId],
  );

  return toMeta(result.rows[0] ?? null);
}

async function loadSnapshotStockMap(snapshotId: string | null) {
  if (!snapshotId) {
    return new Map<string, number>();
  }

  const result = await pool.query<{ sku: string; stock_quantity: number }>(
    `
      SELECT sku, stock_quantity
      FROM inventory_snapshot_items
      WHERE snapshot_id = $1
    `,
    [snapshotId],
  );

  return new Map(result.rows.map((row) => [String(row.sku), Number(row.stock_quantity ?? 0)]));
}

async function loadSalesAggregates(skus: string[]) {
  if (!skus.length) {
    return new Map<string, InventorySalesAggregate>();
  }

  const result = await pool.query<{
    sku: string;
    sales30: string | number;
    sales90: string | number;
    orders30: number;
    orders90: number;
  }>(
    `
      SELECT
        oi.sku,
        COALESCE(SUM(CASE WHEN o.order_date >= CURRENT_DATE - INTERVAL '29 days' THEN oi.quantity ELSE 0 END), 0)::numeric(14,2) AS sales30,
        COALESCE(SUM(CASE WHEN o.order_date >= CURRENT_DATE - INTERVAL '89 days' THEN oi.quantity ELSE 0 END), 0)::numeric(14,2) AS sales90,
        COUNT(DISTINCT CASE WHEN o.order_date >= CURRENT_DATE - INTERVAL '29 days' THEN o.id END)::int AS orders30,
        COUNT(DISTINCT CASE WHEN o.order_date >= CURRENT_DATE - INTERVAL '89 days' THEN o.id END)::int AS orders90
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku = ANY($1::text[])
      GROUP BY oi.sku
    `,
    [skus],
  );

  return new Map(
    result.rows.map((row) => [
      row.sku,
      {
        sales30: toNumber(row.sales30),
        sales90: toNumber(row.sales90),
        orders30: Number(row.orders30 ?? 0),
        orders90: Number(row.orders90 ?? 0),
      } satisfies InventorySalesAggregate,
    ]),
  );
}

async function loadTinyProductCaches(skus: string[]) {
  if (!skus.length) {
    return new Map<string, InventoryProductEnrichment>();
  }

  const result = await pool.query<TinyProductCacheRow>(
    `
      SELECT
        sku,
        match_method,
        product_id,
        product_code,
        product_name,
        category_tree,
        supplier_name,
        price,
        promotional_price,
        cost_price,
        average_cost_price,
        location,
        external_created_at::text,
        external_updated_at::text,
        contact_id,
        seller_id,
        seller_name,
        city,
        state,
        reserved_stock,
        deposits,
        fetched_at::text
      FROM tiny_product_cache
      WHERE sku = ANY($1::text[])
    `,
    [skus],
  );

  return new Map(result.rows.map((row) => [row.sku, mapProductCache(row)]));
}

async function loadTinyContactCaches(customerCodes: string[]) {
  if (!customerCodes.length) {
    return new Map<string, TinyContactCacheRow>();
  }

  const result = await pool.query<TinyContactCacheRow>(
    `
      SELECT
        customer_code,
        contact_id,
        contact_name,
        fantasy_name,
        city,
        state,
        seller_id,
        seller_name,
        fetched_at::text
      FROM tiny_contact_cache
      WHERE customer_code = ANY($1::text[])
    `,
    [customerCodes],
  );

  return new Map(result.rows.map((row) => [row.customer_code, row]));
}

function scoreProductCandidate(item: Pick<InventoryIntelligenceItem, "sku" | "model" | "family">, candidate: OlistProductSearchItem) {
  if (normalizeCode(candidate.code) === normalizeCode(item.sku)) {
    return 10_000;
  }

  const itemTokens = tokenizeInventoryValue(item.model);
  const candidateTokens = new Set(tokenizeInventoryValue(candidate.name));
  const overlap = itemTokens.filter((token) => candidateTokens.has(token)).length;

  return overlap * 100 - Math.abs(candidate.name.length - item.model.length);
}

async function lookupBestProductMatch(item: InventoryIntelligenceItem) {
  const exactSearch = await withRetry(() => olistClient.searchProducts({ search: item.sku, page: 1 }));
  const exactMatch =
    exactSearch.products.find((product) => normalizeCode(product.code) === normalizeCode(item.sku)) ?? exactSearch.products[0] ?? null;

  if (exactMatch) {
    return {
      matchMethod: normalizeCode(exactMatch.code) === normalizeCode(item.sku) ? "SKU" : "MODEL",
      product: exactMatch,
    } as const;
  }

  const fallbackSearchTerm = cleanInventoryModelLabel(item.model).slice(0, 60);
  if (!fallbackSearchTerm) {
    return { matchMethod: "NONE", product: null } as const;
  }

  const search = await withRetry(() => olistClient.searchProducts({ search: fallbackSearchTerm, page: 1 }));
  const ranked = [...search.products].sort((left, right) => scoreProductCandidate(item, right) - scoreProductCandidate(item, left));
  return ranked[0]
    ? ({ matchMethod: "MODEL", product: ranked[0] } as const)
    : ({ matchMethod: "NONE", product: null } as const);
}

async function lookupBestContactMatch(searchTerm: string) {
  const trimmed = normalizeText(searchTerm);
  if (!trimmed) {
    return null;
  }

  const result = await withRetry(() => olistClient.searchContacts({ search: trimmed, page: 1 }));
  return result.contacts.find((contact) => normalizeCode(contact.code) === normalizeCode(trimmed)) ?? result.contacts[0] ?? null;
}

async function upsertTinyProductCache(input: {
  sku: string;
  matchMethod: "SKU" | "MODEL" | "NONE";
  product: OlistProductDetail | null;
  stock: OlistProductStock | null;
  contact: OlistContactDetail | null;
}) {
  const deposits = input.stock?.deposits.map((deposit) => ({
    id: deposit.id,
    name: deposit.name,
    companyName: deposit.companyName,
    balance: deposit.balance,
    reservedBalance: deposit.reservedBalance,
    includesInTotal: deposit.includesInTotal,
  })) ?? [];

  await pool.query(
    `
      INSERT INTO tiny_product_cache (
        sku,
        match_method,
        product_id,
        product_code,
        product_name,
        category_tree,
        supplier_name,
        price,
        promotional_price,
        cost_price,
        average_cost_price,
        location,
        external_created_at,
        external_updated_at,
        contact_id,
        seller_id,
        seller_name,
        city,
        state,
        reserved_stock,
        deposit_names,
        deposits,
        product_payload,
        contact_payload,
        stock_payload,
        fetched_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, NOW(), NOW()
      )
      ON CONFLICT (sku) DO UPDATE
      SET
        match_method = EXCLUDED.match_method,
        product_id = EXCLUDED.product_id,
        product_code = EXCLUDED.product_code,
        product_name = EXCLUDED.product_name,
        category_tree = EXCLUDED.category_tree,
        supplier_name = EXCLUDED.supplier_name,
        price = EXCLUDED.price,
        promotional_price = EXCLUDED.promotional_price,
        cost_price = EXCLUDED.cost_price,
        average_cost_price = EXCLUDED.average_cost_price,
        location = EXCLUDED.location,
        external_created_at = EXCLUDED.external_created_at,
        external_updated_at = EXCLUDED.external_updated_at,
        contact_id = EXCLUDED.contact_id,
        seller_id = EXCLUDED.seller_id,
        seller_name = EXCLUDED.seller_name,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        reserved_stock = EXCLUDED.reserved_stock,
        deposit_names = EXCLUDED.deposit_names,
        deposits = EXCLUDED.deposits,
        product_payload = EXCLUDED.product_payload,
        contact_payload = EXCLUDED.contact_payload,
        stock_payload = EXCLUDED.stock_payload,
        fetched_at = NOW(),
        updated_at = NOW()
    `,
    [
      input.sku,
      input.matchMethod,
      input.product?.id ?? null,
      input.product?.code ?? null,
      input.product?.name ?? null,
      input.product?.categoryTree ?? null,
      input.product?.supplierName ?? null,
      input.product?.price ?? null,
      input.product?.promotionalPrice ?? null,
      input.product?.costPrice ?? null,
      input.product?.averageCostPrice ?? null,
      input.product?.location ?? null,
      input.product?.createdAt ?? null,
      input.product?.updatedAt ?? null,
      input.contact?.id ?? null,
      input.contact?.sellerId ?? null,
      input.contact?.sellerName ?? null,
      input.contact?.city ?? null,
      input.contact?.state ?? null,
      input.stock?.reservedBalance ?? null,
      deposits.map((deposit) => deposit.name),
      JSON.stringify(deposits),
      JSON.stringify(input.product?.raw ?? {}),
      JSON.stringify(input.contact?.raw ?? {}),
      JSON.stringify(input.stock?.raw ?? {}),
    ],
  );
}

async function upsertTinyContactCache(input: { customerCode: string; contact: OlistContactDetail | null }) {
  await pool.query(
    `
      INSERT INTO tiny_contact_cache (
        customer_code,
        contact_id,
        contact_name,
        fantasy_name,
        city,
        state,
        seller_id,
        seller_name,
        contact_payload,
        fetched_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
      ON CONFLICT (customer_code) DO UPDATE
      SET
        contact_id = EXCLUDED.contact_id,
        contact_name = EXCLUDED.contact_name,
        fantasy_name = EXCLUDED.fantasy_name,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        seller_id = EXCLUDED.seller_id,
        seller_name = EXCLUDED.seller_name,
        contact_payload = EXCLUDED.contact_payload,
        fetched_at = NOW(),
        updated_at = NOW()
    `,
    [
      input.customerCode,
      input.contact?.id ?? null,
      input.contact?.name ?? null,
      input.contact?.fantasyName ?? null,
      input.contact?.city ?? null,
      input.contact?.state ?? null,
      input.contact?.sellerId ?? null,
      input.contact?.sellerName ?? null,
      JSON.stringify(input.contact?.raw ?? {}),
    ],
  );
}

async function refreshTinyProductCacheForItem(item: InventoryIntelligenceItem) {
  if (!env.OLIST_API_TOKEN) {
    return;
  }

  try {
    const match = await lookupBestProductMatch(item);
    if (!match.product) {
      await upsertTinyProductCache({
        sku: item.sku,
        matchMethod: "NONE",
        product: null,
        stock: null,
        contact: null,
      });
      return;
    }

    const [product, stock] = await Promise.all([
      withRetry(() => olistClient.getProduct(match.product.id)),
      withRetry(() => olistClient.getProductStock(match.product.id)),
    ]);

    let contact: OlistContactDetail | null = null;
    if (product.supplierId) {
      try {
        contact = await withRetry(() => olistClient.getContact(product.supplierId!));
      } catch (error) {
        logger.warn("inventory tiny contact fetch failed", { sku: item.sku, productId: product.id, error: String(error) });
      }
    } else if (product.supplierCode || product.supplierName) {
      try {
        const contactSearch = await lookupBestContactMatch(product.supplierCode ?? product.supplierName ?? "");
        if (contactSearch) {
          contact = await withRetry(() => olistClient.getContact(contactSearch.id));
        }
      } catch (error) {
        logger.warn("inventory tiny supplier search failed", { sku: item.sku, error: String(error) });
      }
    }

    await upsertTinyProductCache({
      sku: item.sku,
      matchMethod: match.matchMethod,
      product,
      stock,
      contact,
    });
  } catch (error) {
    logger.warn("inventory tiny cache refresh failed", { sku: item.sku, error: String(error) });
  }
}

async function ensureTinyProductCacheForItems(items: InventoryIntelligenceItem[]) {
  if (!env.OLIST_API_TOKEN || !items.length) {
    return;
  }

  const currentCache = await loadTinyProductCaches(items.map((item) => item.sku));
  const targets = items.filter((item) => isCacheStale(currentCache.get(item.sku)?.cachedAt)).slice(0, INTELLIGENCE_PREVIEW_ENRICHMENT_LIMIT);
  if (!targets.length) {
    return;
  }

  scheduleInventoryBackgroundTask(
    Promise.allSettled(targets.map((item) => refreshTinyProductCacheForItem(item))),
    {
      type: "product-cache",
      targetCount: targets.length,
      skus: targets.map((item) => item.sku).slice(0, 6),
    },
  );
}

async function ensureTinyContactCacheForCustomerCodes(customers: Array<{ customerCode: string; customerName: string }>) {
  if (!env.OLIST_API_TOKEN || !customers.length) {
    return;
  }

  const currentCache = await loadTinyContactCaches(customers.map((customer) => customer.customerCode));
  const staleCustomers = customers.filter((customer) => isCacheStale(currentCache.get(customer.customerCode)?.fetched_at));
  if (!staleCustomers.length) {
    return;
  }

  scheduleInventoryBackgroundTask(
    Promise.allSettled(
      staleCustomers.map(async (customer) => {
        try {
          const search = await lookupBestContactMatch(customer.customerCode || customer.customerName);
          const contact = search ? await withRetry(() => olistClient.getContact(search.id)) : null;
          await upsertTinyContactCache({ customerCode: customer.customerCode, contact });
        } catch (error) {
          logger.warn("inventory tiny customer contact cache failed", {
            customerCode: customer.customerCode,
            error: String(error),
          });
        }
      }),
    ),
    {
      type: "contact-cache",
      targetCount: staleCustomers.length,
      customerCodes: staleCustomers.map((customer) => customer.customerCode).slice(0, 6),
    },
  );
}

async function buildInventoryContext(): Promise<BuiltInventoryContext> {
  const { snapshot, items } = await getInventorySnapshotWithItems();
  if (!snapshot) {
    return {
      snapshot: null,
      previousSnapshot: null,
      items: [],
    };
  }

  const previousSnapshot = await loadPreviousSnapshotMeta(snapshot.id);
  const skus = items.map((item) => item.sku);
  const [previousStockBySku, salesBySku, productCacheBySku] = await Promise.all([
    loadSnapshotStockMap(previousSnapshot?.id ?? null),
    loadSalesAggregates(skus),
    loadTinyProductCaches(skus),
  ]);

  const builtItems = items.map((item) =>
    buildInventoryItem({
      sku: item.sku,
      model: item.model,
      color: item.color,
      quality: item.quality,
      price: item.price,
      promotionLabel: item.promotionLabel,
      stockCurrent: item.stockQuantity,
      previousStock: previousStockBySku.get(item.sku) ?? 0,
      sales: salesBySku.get(item.sku) ?? {
        sales30: 0,
        sales90: 0,
        orders30: 0,
        orders90: 0,
      },
      enrichment: productCacheBySku.get(item.sku) ?? null,
    }),
  );

  return {
    snapshot,
    previousSnapshot,
    items: builtItems,
  };
}

function buildInventoryTables(items: InventoryIntelligenceItem[]) {
  return {
    hotRuptures: [...items].filter((item) => item.isHotRupture).sort(sortByHotRupture).slice(0, 8),
    lowCoverage: [...items].filter((item) => item.isLowCoverage).sort(sortByLowCoverage).slice(0, 8),
    arrivals: [...items].filter((item) => item.isNewArrival).sort(sortByArrival).slice(0, 8),
    departures: [...items].filter((item) => item.isStrongOutgoing).sort(sortByDeparture).slice(0, 8),
    overstockCold: [...items].filter((item) => item.isOverstockCold).sort(sortByColdOverstock).slice(0, 8),
  };
}

function buildProvisionalSellerActions(items: InventoryIntelligenceItem[]) {
  const pushStagnant = [...items]
    .filter((item) => item.isOverstockCold)
    .sort(sortByColdOverstock)
    .slice(0, SELLER_QUEUE_LIMIT)
    .map(
      (item) =>
        ({
          actionType: "PUSH_STAGNANT",
          item,
          headline: "Empurrar estoque parado",
          reason: `Sem venda nos ultimos 90 dias e ${item.stockCurrent} unidades paradas em estoque.`,
        }) satisfies ProvisionalSellerAction,
    );

  const announceArrival = [...items]
    .filter((item) => item.isNewArrival && item.sales90 > 0)
    .sort(sortByArrival)
    .slice(0, SELLER_QUEUE_LIMIT)
    .map(
      (item) =>
        ({
          actionType: "ANNOUNCE_ARRIVAL",
          item,
          headline: "Avisar que chegou",
          reason: `Entraram ${item.deltaEntry} unidades e o SKU segue com demanda historica forte.`,
        }) satisfies ProvisionalSellerAction,
    );

  const holdBack = [...items]
    .filter((item) => item.isHotRupture || item.isLowCoverage)
    .sort(sortByHotRupture)
    .slice(0, SELLER_QUEUE_LIMIT)
    .map(
      (item) =>
        ({
          actionType: "HOLD_BACK",
          item,
          headline: "Nao ofertar agora",
          reason:
            item.stockCurrent <= 0
              ? `Sem saldo no momento, mas o item teve ${item.sales90} pecas vendidas nos ultimos 90 dias.`
              : `Cobertura estimada em ${item.coverageDays ?? 0} dias, abaixo do piso de seguranca.`,
        }) satisfies ProvisionalSellerAction,
    );

  return {
    pushStagnant,
    announceArrival,
    holdBack,
  };
}

async function listExactSuggestedCustomers(item: InventoryIntelligenceItem, limit: number) {
  const result = await pool.query<SuggestedCustomerRow>(
    `
      WITH active_credit AS (
        SELECT
          customer_id,
          GREATEST(COALESCE(balance_amount, 0), 0)::numeric(14,2) AS credit_balance_amount,
          GREATEST(
            COALESCE(credit_limit, 0) - GREATEST(-COALESCE(balance_amount, 0), 0),
            0
          )::numeric(14,2) AS available_credit_amount
        FROM customer_credit_snapshot_rows
        WHERE snapshot_id = (
          SELECT id
          FROM customer_credit_snapshots
          WHERE is_active = TRUE
          ORDER BY imported_at DESC
          LIMIT 1
        )
      )
      SELECT
        cs.customer_id AS "customerId",
        cs.customer_code AS "customerCode",
        cs.display_name AS "customerDisplayName",
        cs.last_purchase_at::date::text AS "lastPurchaseAt",
        cs.days_since_last_purchase AS "daysSinceLastPurchase",
        cs.last_attendant AS "lastAttendant",
        COALESCE(ac.available_credit_amount, 0)::numeric(14,2) AS "availableCreditAmount",
        COALESCE(ac.credit_balance_amount, 0)::numeric(14,2) AS "creditBalanceAmount",
        COALESCE(tcc.seller_name, cs.last_attendant) AS "sellerName"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN customer_snapshot cs ON cs.customer_id = o.customer_id
      LEFT JOIN active_credit ac ON ac.customer_id = cs.customer_id
      LEFT JOIN tiny_contact_cache tcc ON tcc.customer_code = cs.customer_code
      WHERE oi.sku = $1
      GROUP BY
        cs.customer_id,
        cs.customer_code,
        cs.display_name,
        cs.last_purchase_at,
        cs.days_since_last_purchase,
        cs.last_attendant,
        ac.available_credit_amount,
        ac.credit_balance_amount,
        tcc.seller_name
      ORDER BY
        CASE
          WHEN COALESCE(ac.credit_balance_amount, 0) > 0 THEN 0
          WHEN COALESCE(ac.available_credit_amount, 0) > 0 THEN 1
          ELSE 2
        END,
        MAX(o.order_date) DESC,
        SUM(oi.quantity) DESC,
        cs.display_name ASC
      LIMIT $2
    `,
    [item.sku, limit],
  );

  return result.rows.map(
    (row) =>
      ({
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerDisplayName: row.customerDisplayName,
        matchType: "SKU",
        lastPurchaseAt: row.lastPurchaseAt,
        daysSinceLastPurchase: row.daysSinceLastPurchase,
        lastAttendant: row.lastAttendant,
        availableCreditAmount: toNumber(row.availableCreditAmount),
        creditBalanceAmount: toNumber(row.creditBalanceAmount),
        sellerName: row.sellerName,
        reason: "Ja comprou este SKU no historico recente.",
      }) satisfies InventoryCustomerSuggestion,
  );
}

async function listFamilySuggestedCustomers(item: InventoryIntelligenceItem, limit: number, excludedCustomerIds: string[]) {
  const familySearchTerm = item.family
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .join("%");

  if (!familySearchTerm) {
    return [] as InventoryCustomerSuggestion[];
  }

  const result = await pool.query<SuggestedCustomerRow>(
    `
      WITH active_credit AS (
        SELECT
          customer_id,
          GREATEST(COALESCE(balance_amount, 0), 0)::numeric(14,2) AS credit_balance_amount,
          GREATEST(
            COALESCE(credit_limit, 0) - GREATEST(-COALESCE(balance_amount, 0), 0),
            0
          )::numeric(14,2) AS available_credit_amount
        FROM customer_credit_snapshot_rows
        WHERE snapshot_id = (
          SELECT id
          FROM customer_credit_snapshots
          WHERE is_active = TRUE
          ORDER BY imported_at DESC
          LIMIT 1
        )
      )
      SELECT
        cs.customer_id AS "customerId",
        cs.customer_code AS "customerCode",
        cs.display_name AS "customerDisplayName",
        cs.last_purchase_at::date::text AS "lastPurchaseAt",
        cs.days_since_last_purchase AS "daysSinceLastPurchase",
        cs.last_attendant AS "lastAttendant",
        COALESCE(ac.available_credit_amount, 0)::numeric(14,2) AS "availableCreditAmount",
        COALESCE(ac.credit_balance_amount, 0)::numeric(14,2) AS "creditBalanceAmount",
        COALESCE(tcc.seller_name, cs.last_attendant) AS "sellerName"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN customer_snapshot cs ON cs.customer_id = o.customer_id
      LEFT JOIN active_credit ac ON ac.customer_id = cs.customer_id
      LEFT JOIN tiny_contact_cache tcc ON tcc.customer_code = cs.customer_code
      WHERE oi.item_description ILIKE $1
        AND (array_length($2::uuid[], 1) IS NULL OR cs.customer_id <> ALL($2::uuid[]))
      GROUP BY
        cs.customer_id,
        cs.customer_code,
        cs.display_name,
        cs.last_purchase_at,
        cs.days_since_last_purchase,
        cs.last_attendant,
        ac.available_credit_amount,
        ac.credit_balance_amount,
        tcc.seller_name
      ORDER BY
        CASE
          WHEN COALESCE(ac.credit_balance_amount, 0) > 0 THEN 0
          WHEN COALESCE(ac.available_credit_amount, 0) > 0 THEN 1
          ELSE 2
        END,
        MAX(o.order_date) DESC,
        SUM(oi.quantity) DESC,
        cs.display_name ASC
      LIMIT $3
    `,
    [`%${familySearchTerm}%`, excludedCustomerIds.length ? excludedCustomerIds : null, limit],
  );

  return result.rows.map(
    (row) =>
      ({
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerDisplayName: row.customerDisplayName,
        matchType: "FAMILY",
        lastPurchaseAt: row.lastPurchaseAt,
        daysSinceLastPurchase: row.daysSinceLastPurchase,
        lastAttendant: row.lastAttendant,
        availableCreditAmount: toNumber(row.availableCreditAmount),
        creditBalanceAmount: toNumber(row.creditBalanceAmount),
        sellerName: row.sellerName,
        reason: `Costuma comprar a familia ${item.family}.`,
      }) satisfies InventoryCustomerSuggestion,
  );
}

async function listSuggestedCustomersForItem(item: InventoryIntelligenceItem, limit = 4) {
  const exactMatches = await listExactSuggestedCustomers(item, limit);
  if (exactMatches.length >= limit) {
    return exactMatches;
  }

  const familyMatches = await listFamilySuggestedCustomers(
    item,
    limit - exactMatches.length,
    exactMatches.map((customer) => customer.customerId),
  );

  const customersToCache = [...exactMatches, ...familyMatches].map((customer) => ({
    customerCode: customer.customerCode,
    customerName: customer.customerDisplayName,
  }));
  await ensureTinyContactCacheForCustomerCodes(customersToCache);

  const cachedContacts = await loadTinyContactCaches(customersToCache.map((customer) => customer.customerCode));

  return [...exactMatches, ...familyMatches].map((customer) => ({
    ...customer,
    sellerName: cachedContacts.get(customer.customerCode)?.seller_name ?? customer.sellerName,
  }));
}

async function buildSellerAction(action: ProvisionalSellerAction): Promise<InventorySellerActionItem> {
  const suggestedCustomers = await listSuggestedCustomersForItem(action.item);
  const sellerNames = sortUnique(suggestedCustomers.map((customer) => customer.sellerName ?? ""));

  return {
    actionType: action.actionType,
    item: {
      ...action.item,
      sellerNames: sortUnique([...action.item.sellerNames, ...sellerNames]),
    },
    headline: action.headline,
    reason: action.reason,
    suggestedCustomers,
  };
}

async function buildSellerQueues(items: InventoryIntelligenceItem[]) {
  const provisional = buildProvisionalSellerActions(items);
  const [pushStagnant, announceArrival, holdBack] = await Promise.all([
    Promise.all(provisional.pushStagnant.map((action) => buildSellerAction(action))),
    Promise.all(provisional.announceArrival.map((action) => buildSellerAction(action))),
    Promise.all(provisional.holdBack.map((action) => buildSellerAction(action))),
  ]);

  return { pushStagnant, announceArrival, holdBack };
}

function collectPreviewItems(responseItems: InventoryIntelligenceItem[]) {
  return sortUnique(responseItems.map((item) => item.sku));
}

function buildResponseFromItems(input: {
  snapshot: InventorySnapshotMeta | null;
  previousSnapshot: InventorySnapshotMeta | null;
  items: InventoryIntelligenceItem[];
  appliedFilters: InventoryIntelligenceAppliedFilters;
  sellerQueues: InventoryIntelligenceResponse["sellerQueues"];
}) {
  const tables = buildInventoryTables(input.items);
  const allActionItems = [...input.sellerQueues.pushStagnant, ...input.sellerQueues.announceArrival, ...input.sellerQueues.holdBack];

  return {
    snapshot: input.snapshot,
    previousSnapshot: input.previousSnapshot,
    summary: buildSummary(input.items),
    filters: buildFilters(input.items, allActionItems),
    appliedFilters: input.appliedFilters,
    matrix: buildMatrix(input.items),
    tables,
    sellerQueues: input.sellerQueues,
  } satisfies InventoryIntelligenceResponse;
}

function filterQueuesBySeller(
  queues: InventoryIntelligenceResponse["sellerQueues"],
  seller: string | null,
) {
  if (!seller) {
    return queues;
  }

  const matchesSeller = (action: InventorySellerActionItem) =>
    action.suggestedCustomers.some((customer) => customer.sellerName === seller) || action.item.sellerNames.includes(seller);

  return {
    pushStagnant: queues.pushStagnant.filter(matchesSeller),
    announceArrival: queues.announceArrival.filter(matchesSeller),
    holdBack: queues.holdBack.filter(matchesSeller),
  };
}

export async function getInventoryIntelligence(filters: Partial<InventoryIntelligenceAppliedFilters> = {}) {
  const normalizedFilters: InventoryIntelligenceAppliedFilters = {
    brand: filters.brand ? String(filters.brand) : null,
    family: filters.family ? String(filters.family) : null,
    quality: filters.quality ? String(filters.quality) : null,
    stockStatus: filters.stockStatus ?? null,
    demandStatus: filters.demandStatus ?? null,
    newArrivalOnly: Boolean(filters.newArrivalOnly),
    depositName: filters.depositName ? String(filters.depositName) : null,
    seller: filters.seller ? String(filters.seller) : null,
  };

  const context = await buildInventoryContext();
  let filteredItems = applyBaseFilters(context.items, normalizedFilters);

  const provisionalTables = buildInventoryTables(filteredItems);
  const previewSkus = collectPreviewItems([
    ...provisionalTables.hotRuptures,
    ...provisionalTables.lowCoverage,
    ...provisionalTables.arrivals,
    ...provisionalTables.departures,
    ...provisionalTables.overstockCold,
  ]);

  if (previewSkus.length) {
    await ensureTinyProductCacheForItems(
      previewSkus
        .map((sku) => filteredItems.find((item) => item.sku === sku) ?? null)
        .filter((item): item is InventoryIntelligenceItem => Boolean(item)),
    );

    const refreshedCache = await loadTinyProductCaches(previewSkus);
    filteredItems = patchItemsWithEnrichment(filteredItems, refreshedCache);
  }

  let sellerQueues = await buildSellerQueues(filteredItems);
  sellerQueues = filterQueuesBySeller(sellerQueues, normalizedFilters.seller);

  if (normalizedFilters.seller) {
    const sellerSkuSet = new Set(
      [...sellerQueues.pushStagnant, ...sellerQueues.announceArrival, ...sellerQueues.holdBack].map(
        (action) => action.item.sku,
      ),
    );
    filteredItems = filteredItems.filter((item) => sellerSkuSet.has(item.sku));
  }

  return buildResponseFromItems({
    snapshot: context.snapshot,
    previousSnapshot: context.previousSnapshot,
    items: filteredItems,
    appliedFilters: normalizedFilters,
    sellerQueues,
  });
}

async function loadStockHistory(sku: string) {
  const result = await pool.query<{ snapshot_id: string; imported_at: string; stock_quantity: number }>(
    `
      SELECT
        isi.snapshot_id,
        s.imported_at::text AS imported_at,
        isi.stock_quantity
      FROM inventory_snapshot_items isi
      JOIN inventory_snapshots s ON s.id = isi.snapshot_id
      WHERE isi.sku = $1
      ORDER BY s.imported_at DESC
      LIMIT $2
    `,
    [sku, STOCK_HISTORY_LIMIT],
  );

  let previousStock: number | null = null;
  return [...result.rows]
    .reverse()
    .map((row) => {
      const deltaNet = previousStock === null ? 0 : row.stock_quantity - previousStock;
      previousStock = row.stock_quantity;

      return {
        snapshotId: row.snapshot_id,
        importedAt: new Date(row.imported_at).toISOString(),
        stockQuantity: Number(row.stock_quantity ?? 0),
        deltaNet,
      } satisfies InventoryStockHistoryPoint;
    })
    .reverse();
}

export async function getInventoryIntelligenceDetail(sku: string): Promise<InventoryIntelligenceDetailResponse> {
  const context = await buildInventoryContext();
  if (!context.snapshot) {
    return {
      snapshot: null,
      item: null,
      stockHistory: [],
      familyItems: [],
      suggestedCustomers: [],
    };
  }

  const target = context.items.find((item) => item.sku === normalizeCode(sku) || item.sku === sku) ?? null;
  if (!target) {
    return {
      snapshot: context.snapshot,
      item: null,
      stockHistory: [],
      familyItems: [],
      suggestedCustomers: [],
    };
  }

  const familyItems = context.items
    .filter((item) => item.family === target.family && item.sku !== target.sku)
    .sort((left, right) => right.stockCurrent - left.stockCurrent || right.sales90 - left.sales90)
    .slice(0, FAMILY_DETAIL_LIMIT);

  await ensureTinyProductCacheForItems([target, ...familyItems]);

  const refreshedCache = await loadTinyProductCaches([target.sku, ...familyItems.map((item) => item.sku)]);
  const detailedTarget = mergeItemWithEnrichment(target, refreshedCache.get(target.sku) ?? target.enrichment);
  const detailedFamilyItems = familyItems.map((item) => mergeItemWithEnrichment(item, refreshedCache.get(item.sku) ?? item.enrichment));

  const suggestedCustomers = await listSuggestedCustomersForItem(detailedTarget, 6);

  return {
    snapshot: context.snapshot,
    item: detailedTarget,
    stockHistory: await loadStockHistory(target.sku),
    familyItems: detailedFamilyItems,
    suggestedCustomers,
  };
}

const INVENTORY_ANALYTICS_CACHE_TTL_MS = 60_000;
const INVENTORY_HISTORY_SNAPSHOT_LIMIT = 180;
const INVENTORY_DAILY_SALES_LIMIT_DAYS = 180;
const INVENTORY_MODEL_TOP_CUSTOMERS_LIMIT = 8;

interface InventorySnapshotHistoryRow {
  snapshotId: string;
  date: string;
  importedAt: string;
  sku: string;
  model: string;
  stockQuantity: number;
}

interface InventorySalesDailyRow {
  date: string;
  sku: string;
  salesUnits: number;
  orderCount: number;
}

interface InventoryLastSaleRow {
  sku: string;
  lastSaleAt: string | null;
}

interface InventoryTopCustomerRow {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  totalQuantity: number;
  totalOrders: number;
  lastPurchaseAt: string | null;
  lastAttendant: string | null;
}

interface InventoryModelAggregate {
  modelKey: string;
  modelLabel: string;
  brand: string;
  family: string;
  productKind: "DOC_DE_CARGA" | "TELA";
  stockUnits: number;
  activeSkuCount: number;
  totalSkuCount: number;
  sales7: number;
  sales30: number;
  sales90: number;
  orders30: number;
  orders90: number;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
  lastRestockAt: string | null;
  coverageDays: number | null;
  deltaIn: number;
  deltaOut: number;
  trappedValue: number;
  trappedValueEstimated: boolean;
  buyPriority: number;
  buyRecommendation: InventoryBuyRecommendation;
  holdSales: boolean;
  qualityLabels: string[];
  sampleSkus: string[];
  depositNames: string[];
  supplierNames: string[];
  reservedStock: number;
  currentItems: InventoryIntelligenceItem[];
}

interface InventoryModelSeriesValue {
  date: string;
  stockUnits: number;
  activeSkuCount: number;
  salesUnits: number;
  restockUnits: number;
  hasSnapshot: boolean;
}

interface InventoryAnalyticsDataset {
  snapshot: InventorySnapshotMeta | null;
  previousSnapshot: InventorySnapshotMeta | null;
  models: InventoryModelAggregate[];
  modelMap: Map<string, InventoryModelAggregate>;
  overviewSeries: InventoryDailySeriesPoint[];
  seriesByModel: Map<string, InventoryDailySeriesPoint[]>;
  latestSeriesDate: string | null;
}

let inventoryAnalyticsCache:
  | {
      snapshotId: string | null;
      builtAt: number;
      data: InventoryAnalyticsDataset;
    }
  | null = null;

function toDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const matched = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) {
    return matched[1] ?? null;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function calculateDaysSinceDate(value: string | null) {
  const calendarDate = toDateOnly(value);
  if (!calendarDate) {
    return null;
  }

  const parsed = new Date(`${calendarDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const now = new Date();
  const currentUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.max(0, Math.floor((currentUtc - targetUtc) / (1000 * 60 * 60 * 24)));
}

function formatCalendarDateLabel(value: string | null | undefined) {
  const calendarDate = toDateOnly(value);
  if (!calendarDate) {
    return "-";
  }

  const [year, month, day] = calendarDate.split("-");
  if (!year || !month || !day) {
    return calendarDate;
  }

  return `${day}/${month}/${year}`;
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], ratio: number) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sorted[lower] ?? null;
  }

  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function buildInventoryModelKey(productKind: "DOC_DE_CARGA" | "TELA", brand: string, family: string) {
  return `${productKind}::${normalizeCode(brand)}::${normalizeCode(family)}`;
}

function buildInventoryModelLabel(brand: string, family: string) {
  return family === brand ? brand : `${brand} ${family}`.trim();
}

function sortLocale(left: string, right: string) {
  return left.localeCompare(right, "pt-BR");
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return sortUnique(values.map((value) => normalizeText(String(value ?? ""))).filter(Boolean));
}

export function resolveInventoryBuyRecommendation(input: {
  stockUnits: number;
  coverageDays: number | null;
  sales90: number;
}): InventoryBuyRecommendation {
  if (input.sales90 <= 0) {
    return "DO_NOT_BUY";
  }

  if (input.stockUnits <= 0) {
    return "BUY_NOW";
  }

  if (input.coverageDays !== null && input.coverageDays <= INVENTORY_COVERAGE_LOW_DAYS) {
    return "BUY_NOW";
  }

  if (input.coverageDays !== null && input.coverageDays <= 30) {
    return "WATCH";
  }

  return "DO_NOT_BUY";
}

export function resolveInventoryStaleAction(daysSinceLastSale: number | null): InventoryStaleAction {
  if (daysSinceLastSale === null || daysSinceLastSale >= 120) {
    return "LIQUIDATE_REVIEW";
  }

  if (daysSinceLastSale >= 90) {
    return "PROMOTION";
  }

  if (daysSinceLastSale >= 60) {
    return "COMMERCIAL_PUSH";
  }

  return "MONITOR";
}

function resolveInventoryRestockStatus(input: {
  lastRestockAt: string | null;
  latestSeriesDate: string | null;
  coverageDays: number | null;
  stockAfter: number;
  sales7Before: number;
  sales7After: number;
}): InventoryRestockStatus {
  if (input.lastRestockAt && input.latestSeriesDate && toDateOnly(input.lastRestockAt) === toDateOnly(input.latestSeriesDate)) {
    return "ARRIVED_TODAY";
  }

  if (input.stockAfter <= 0 || (input.coverageDays !== null && input.coverageDays <= INVENTORY_COVERAGE_LOW_DAYS)) {
    return "RESTOCK_AGAIN";
  }

  if (input.sales7After > input.sales7Before || (input.sales7After > 0 && input.sales7Before === 0)) {
    return "BACK_TO_SELLING";
  }

  return "NO_REACTION_YET";
}

function buildBuyingListItem(model: InventoryModelAggregate): InventoryBuyingListItem {
  return {
    modelKey: model.modelKey,
    modelLabel: model.modelLabel,
    brand: model.brand,
    family: model.family,
    productKind: model.productKind,
    stockUnits: model.stockUnits,
    activeSkuCount: model.activeSkuCount,
    totalSkuCount: model.totalSkuCount,
    sales7: model.sales7,
    sales30: model.sales30,
    sales90: model.sales90,
    orders30: model.orders30,
    orders90: model.orders90,
    lastSaleAt: model.lastSaleAt,
    daysSinceLastSale: model.daysSinceLastSale,
    lastRestockAt: model.lastRestockAt,
    coverageDays: model.coverageDays,
    deltaIn: model.deltaIn,
    deltaOut: model.deltaOut,
    trappedValue: model.trappedValue,
    trappedValueEstimated: model.trappedValueEstimated,
    buyPriority: model.buyPriority,
    buyRecommendation: model.buyRecommendation,
    holdSales: model.holdSales,
    qualityLabels: model.qualityLabels,
    sampleSkus: model.sampleSkus,
  };
}

async function loadInventoryHistoryRows(limit = INVENTORY_HISTORY_SNAPSHOT_LIMIT) {
  const result = await pool.query<InventorySnapshotHistoryRow>(
    `
      WITH latest_daily_snapshots AS (
        SELECT DISTINCT ON (snapshot_day)
          id,
          imported_at,
          snapshot_day
        FROM (
          SELECT
            id,
            imported_at,
            imported_at::date AS snapshot_day
          FROM inventory_snapshots
        ) snapshots
        ORDER BY snapshot_day DESC, imported_at DESC
      ),
      recent_snapshots AS (
        SELECT id, imported_at
        FROM latest_daily_snapshots
        ORDER BY imported_at DESC
        LIMIT $1
      )
      SELECT
        s.id AS "snapshotId",
        s.imported_at::date::text AS date,
        s.imported_at::text AS "importedAt",
        isi.sku,
        isi.model,
        isi.stock_quantity AS "stockQuantity"
      FROM recent_snapshots rs
      JOIN inventory_snapshots s ON s.id = rs.id
      JOIN inventory_snapshot_items isi ON isi.snapshot_id = s.id
      ORDER BY s.imported_at ASC, isi.sku ASC
    `,
    [limit],
  );

  return result.rows.map((row) => ({
    ...row,
    stockQuantity: Number(row.stockQuantity ?? 0),
  }));
}

async function loadSalesDailyRows(skus: string[], days = INVENTORY_DAILY_SALES_LIMIT_DAYS) {
  if (!skus.length) {
    return [] as InventorySalesDailyRow[];
  }

  const result = await pool.query<InventorySalesDailyRow>(
    `
      SELECT
        o.order_date::date::text AS date,
        oi.sku,
        COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS "salesUnits",
        COUNT(DISTINCT o.id)::int AS "orderCount"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku = ANY($1::text[])
        AND o.order_date >= CURRENT_DATE - ($2::int - 1)
      GROUP BY o.order_date, oi.sku
      ORDER BY o.order_date ASC, oi.sku ASC
    `,
    [skus, Math.max(days, 1)],
  );

  return result.rows.map((row) => ({
    ...row,
    salesUnits: toNumber(row.salesUnits),
    orderCount: Number(row.orderCount ?? 0),
  }));
}

async function loadLastSaleRows(skus: string[]) {
  if (!skus.length) {
    return [] as InventoryLastSaleRow[];
  }

  const result = await pool.query<InventoryLastSaleRow>(
    `
      SELECT
        oi.sku,
        MAX(o.order_date)::date::text AS "lastSaleAt"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku = ANY($1::text[])
      GROUP BY oi.sku
    `,
    [skus],
  );

  return result.rows;
}

async function loadTopCustomersForModelSkus(skus: string[], limit = INVENTORY_MODEL_TOP_CUSTOMERS_LIMIT) {
  if (!skus.length) {
    return [] as InventoryModelTopCustomer[];
  }

  const result = await pool.query<InventoryTopCustomerRow>(
    `
      SELECT
        cs.customer_id AS "customerId",
        cs.customer_code AS "customerCode",
        cs.display_name AS "customerDisplayName",
        COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS "totalQuantity",
        COUNT(DISTINCT o.id)::int AS "totalOrders",
        MAX(o.order_date)::date::text AS "lastPurchaseAt",
        cs.last_attendant AS "lastAttendant"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN customer_snapshot cs ON cs.customer_id = o.customer_id
      WHERE oi.sku = ANY($1::text[])
      GROUP BY
        cs.customer_id,
        cs.customer_code,
        cs.display_name,
        cs.last_attendant
      ORDER BY
        COALESCE(SUM(oi.quantity), 0) DESC,
        MAX(o.order_date) DESC,
        cs.display_name ASC
      LIMIT $2
    `,
    [skus, limit],
  );

  return result.rows.map(
    (row) =>
      ({
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerDisplayName: row.customerDisplayName,
        totalQuantity: toNumber(row.totalQuantity),
        totalOrders: Number(row.totalOrders ?? 0),
        lastPurchaseAt: row.lastPurchaseAt,
        lastAttendant: row.lastAttendant,
      }) satisfies InventoryModelTopCustomer,
  );
}

function computeBuyPriority(model: Pick<InventoryModelAggregate, "stockUnits" | "coverageDays" | "sales90" | "activeSkuCount" | "daysSinceLastSale">) {
  if (model.sales90 <= 0) {
    return 0;
  }

  const coverageScore =
    model.coverageDays === null
      ? 0
      : Math.max(0, Math.round((45 - Math.min(model.coverageDays, 45)) * 3));
  const stockScore = model.stockUnits <= 0 ? 80 : model.stockUnits <= 10 ? 42 : 0;
  const demandScore = Math.min(220, Math.round(model.sales90));
  const mixScore = model.activeSkuCount <= 2 ? 24 : model.activeSkuCount <= 4 ? 12 : 0;
  const recencyPenalty = model.daysSinceLastSale !== null && model.daysSinceLastSale > 60 ? 36 : 0;

  return Math.max(0, demandScore + coverageScore + stockScore + mixScore - recencyPenalty);
}

function buildOverviewHighlights(series: InventoryDailySeriesPoint[]) {
  const stockSeries = series.filter((point) => point.totalStockUnits > 0 || point.activeModelCount > 0);
  const restockDates = stockSeries
    .filter((point) => point.restockUnits > 0)
    .slice(-3)
    .map((point) => formatCalendarDateLabel(point.date));

  if (!stockSeries.length) {
    return [
      "Aguardando mais historico para comparar estoque, mix e vendas.",
      "Assim que houver mais dias gravados, esta leitura vai ficar mais clara.",
    ];
  }

  if (stockSeries.length < 2) {
    const firstSnapshotDate = stockSeries[0]?.date ?? null;
    const insights = [
      firstSnapshotDate
        ? `O historico do estoque comecou em ${formatCalendarDateLabel(firstSnapshotDate)}. Conforme novas leituras entrarem, a curva vai aparecer aqui.`
        : "O historico do estoque ainda esta comecando.",
      "As vendas por dia ja podem ser acompanhadas separadamente, mesmo antes de acumular varios dias de estoque.",
    ];

    if (restockDates.length) {
      insights.push(`Ja houve reposicao nestas datas: ${restockDates.join(", ")}.`);
    }

    return insights;
  }

  const recentSeries = stockSeries.slice(-Math.min(stockSeries.length, 60));
  const stockCut = Math.max(1, Math.floor(recentSeries.length / 3));
  const sortedByStock = [...recentSeries].sort((left, right) => left.totalStockUnits - right.totalStockUnits);
  const sortedByMix = [...recentSeries].sort((left, right) => left.activeModelCount - right.activeModelCount);
  const lowStockAvg = average(sortedByStock.slice(0, stockCut).map((point) => point.salesUnits)) ?? 0;
  const highStockAvg = average(sortedByStock.slice(-stockCut).map((point) => point.salesUnits)) ?? 0;
  const lowMixAvg = average(sortedByMix.slice(0, stockCut).map((point) => point.salesUnits)) ?? 0;
  const highMixAvg = average(sortedByMix.slice(-stockCut).map((point) => point.salesUnits)) ?? 0;

  const insights = [
    highStockAvg > lowStockAvg
      ? "Quando o estoque total subiu, a venda tambem subiu."
      : "A venda nao mostrou ganho claro mesmo quando o estoque total aumentou.",
    highMixAvg > lowMixAvg
      ? "Quando o mix aumentou, a venda subiu."
      : "O mix ainda nao mostrou impacto forte na venda.",
  ];

  if (restockDates.length) {
    insights.push(`Teve reposicao nestas datas: ${restockDates.join(", ")}.`);
  }

  return insights;
}

function buildModelBenchmarks(series: InventoryDailySeriesPoint[]): InventoryModelBenchmarks {
  const stockPoints = series.filter((point) => point.stockUnits !== null && point.activeSkuCount !== null);
  const stockValues = stockPoints.map((point) => point.stockUnits ?? 0);
  const mixValues = stockPoints.map((point) => point.activeSkuCount ?? 0);
  const stockLowCut = quantile(stockValues, 0.25);
  const stockHighCut = quantile(stockValues, 0.75);
  const mixLowCut = quantile(mixValues, 0.25);
  const mixHighCut = quantile(mixValues, 0.75);

  const lowStockAvgSales =
    stockLowCut === null
      ? null
      : average(stockPoints.filter((point) => (point.stockUnits ?? 0) <= stockLowCut).map((point) => point.salesUnits));
  const highStockAvgSales =
    stockHighCut === null
      ? null
      : average(stockPoints.filter((point) => (point.stockUnits ?? 0) >= stockHighCut).map((point) => point.salesUnits));
  const shortMixAvgSales =
    mixLowCut === null
      ? null
      : average(stockPoints.filter((point) => (point.activeSkuCount ?? 0) <= mixLowCut).map((point) => point.salesUnits));
  const wideMixAvgSales =
    mixHighCut === null
      ? null
      : average(stockPoints.filter((point) => (point.activeSkuCount ?? 0) >= mixHighCut).map((point) => point.salesUnits));

  return {
    lowStockAvgSales: lowStockAvgSales === null ? null : Number(lowStockAvgSales.toFixed(1)),
    highStockAvgSales: highStockAvgSales === null ? null : Number(highStockAvgSales.toFixed(1)),
    shortMixAvgSales: shortMixAvgSales === null ? null : Number(shortMixAvgSales.toFixed(1)),
    wideMixAvgSales: wideMixAvgSales === null ? null : Number(wideMixAvgSales.toFixed(1)),
  };
}

function buildModelHighlights(model: InventoryModelAggregate, benchmarks: InventoryModelBenchmarks, series: InventoryDailySeriesPoint[]) {
  const highlights: string[] = [];

  if (benchmarks.lowStockAvgSales !== null) {
    highlights.push(`Com estoque baixo, esse modelo vendeu em media ${benchmarks.lowStockAvgSales} pecas por dia.`);
  }

  if (benchmarks.highStockAvgSales !== null) {
    highlights.push(`Com estoque alto, esse modelo vendeu em media ${benchmarks.highStockAvgSales} pecas por dia.`);
  }

  if (benchmarks.shortMixAvgSales !== null) {
    highlights.push(`Com mix curto, esse modelo vendeu em media ${benchmarks.shortMixAvgSales} pecas por dia.`);
  }

  if (benchmarks.wideMixAvgSales !== null) {
    highlights.push(`Com mix amplo, esse modelo vendeu em media ${benchmarks.wideMixAvgSales} pecas por dia.`);
  }

  const lastRestockPoint = [...series].reverse().find((point) => point.restockUnits > 0);
  if (lastRestockPoint) {
    highlights.push(`A ultima reposicao apareceu em ${lastRestockPoint.date} com ${lastRestockPoint.restockUnits} pecas.`);
  } else if (model.lastSaleAt) {
    highlights.push(`A ultima venda registrada foi em ${toDateOnly(model.lastSaleAt)}.`);
  }

  return highlights;
}

async function buildInventoryAnalyticsDataset(forceRefresh = false): Promise<InventoryAnalyticsDataset> {
  const context = await buildInventoryContext();
  const snapshotId = context.snapshot?.id ?? null;

  if (
    !forceRefresh &&
    inventoryAnalyticsCache &&
    inventoryAnalyticsCache.snapshotId === snapshotId &&
    Date.now() - inventoryAnalyticsCache.builtAt <= INVENTORY_ANALYTICS_CACHE_TTL_MS
  ) {
    return inventoryAnalyticsCache.data;
  }

  if (!context.snapshot) {
    const emptyDataset: InventoryAnalyticsDataset = {
      snapshot: null,
      previousSnapshot: null,
      models: [],
      modelMap: new Map(),
      overviewSeries: [],
      seriesByModel: new Map(),
      latestSeriesDate: null,
    };
    inventoryAnalyticsCache = {
      snapshotId,
      builtAt: Date.now(),
      data: emptyDataset,
    };
    return emptyDataset;
  }

  const skus = context.items.map((item) => item.sku);
  const [historyRows, salesDailyRows, lastSaleRows] = await Promise.all([
    loadInventoryHistoryRows(),
    loadSalesDailyRows(skus),
    loadLastSaleRows(skus),
  ]);

  const sales7Cutoff = new Date();
  sales7Cutoff.setUTCDate(sales7Cutoff.getUTCDate() - 6);
  const sales7CutoffDate = sales7Cutoff.toISOString().slice(0, 10);

  const modelByKey = new Map<string, InventoryModelAggregate>();
  const modelKeyBySku = new Map<string, string>();
  const lastSaleBySku = new Map(lastSaleRows.map((row) => [row.sku, row.lastSaleAt]));

  for (const item of context.items) {
    const modelKey = buildInventoryModelKey(item.productKind, item.brand, item.family);
    const modelLabel = buildInventoryModelLabel(item.brand, item.family);
    modelKeyBySku.set(item.sku, modelKey);

    const unitValue =
      item.enrichment?.averageCostPrice ?? item.enrichment?.costPrice ?? item.enrichment?.price ?? item.price;
    const usesEstimatedValue = item.enrichment?.averageCostPrice == null && item.enrichment?.costPrice == null;
    const current = modelByKey.get(modelKey) ?? {
      modelKey,
      modelLabel,
      brand: item.brand,
      family: item.family,
      productKind: item.productKind,
      stockUnits: 0,
      activeSkuCount: 0,
      totalSkuCount: 0,
      sales7: 0,
      sales30: 0,
      sales90: 0,
      orders30: 0,
      orders90: 0,
      lastSaleAt: null,
      daysSinceLastSale: null,
      lastRestockAt: null,
      coverageDays: null,
      deltaIn: 0,
      deltaOut: 0,
      trappedValue: 0,
      trappedValueEstimated: false,
      buyPriority: 0,
      buyRecommendation: "DO_NOT_BUY",
      holdSales: false,
      qualityLabels: [],
      sampleSkus: [],
      depositNames: [],
      supplierNames: [],
      reservedStock: 0,
      currentItems: [],
    } satisfies InventoryModelAggregate;

    current.stockUnits += item.stockCurrent;
    current.activeSkuCount += item.stockCurrent > 0 ? 1 : 0;
    current.totalSkuCount += 1;
    current.sales30 += item.sales30;
    current.sales90 += item.sales90;
    current.orders30 += item.orders30;
    current.orders90 += item.orders90;
    current.deltaIn += item.deltaEntry;
    current.deltaOut += item.deltaExit;
    current.trappedValue += item.stockCurrent * unitValue;
    current.trappedValueEstimated ||= usesEstimatedValue;
    current.qualityLabels = dedupeStrings([...current.qualityLabels, item.quality]);
    current.sampleSkus = dedupeStrings([...current.sampleSkus, item.sku]).slice(0, 8);
    current.depositNames = dedupeStrings([...current.depositNames, ...item.depositNames]);
    current.supplierNames = dedupeStrings([...current.supplierNames, item.enrichment?.supplierName]);
    current.reservedStock += toNumber(item.enrichment?.reservedStock);
    current.currentItems = [...current.currentItems, item];

    const itemLastSaleAt = lastSaleBySku.get(item.sku) ?? null;
    if (itemLastSaleAt && (!current.lastSaleAt || itemLastSaleAt > current.lastSaleAt)) {
      current.lastSaleAt = itemLastSaleAt;
    }

    modelByKey.set(modelKey, current);
  }

  for (const saleRow of salesDailyRows) {
    if (saleRow.date >= sales7CutoffDate) {
      const modelKey = modelKeyBySku.get(saleRow.sku);
      if (modelKey) {
        const current = modelByKey.get(modelKey);
        if (current) {
          current.sales7 += saleRow.salesUnits;
        }
      }
    }
  }

  const rawSeriesByModel = new Map<string, Map<string, InventoryModelSeriesValue>>();
  const globalSeriesMap = new Map<
    string,
    {
      date: string;
      totalStockUnits: number;
      totalStockUnitsTela: number;
      totalStockUnitsDoc: number;
      activeModelCount: number;
      activeSkuCount: number;
      activeSkuCountTela: number;
      activeSkuCountDoc: number;
      salesUnits: number;
      restockUnits: number;
    }
  >();

  for (const row of historyRows) {
    const grouping = deriveInventoryGrouping(row.model);
    const modelKey = buildInventoryModelKey(grouping.productKind, grouping.brand, grouping.family);
    const date = toDateOnly(row.date) ?? row.date;
    const modelSeries = rawSeriesByModel.get(modelKey) ?? new Map<string, InventoryModelSeriesValue>();
    const currentModelPoint = modelSeries.get(date) ?? {
      date,
      stockUnits: 0,
      activeSkuCount: 0,
      salesUnits: 0,
      restockUnits: 0,
      hasSnapshot: false,
    };
    currentModelPoint.stockUnits += Number(row.stockQuantity ?? 0);
    currentModelPoint.activeSkuCount += Number(row.stockQuantity ?? 0) > 0 ? 1 : 0;
    currentModelPoint.hasSnapshot = true;
    modelSeries.set(date, currentModelPoint);
    rawSeriesByModel.set(modelKey, modelSeries);
  }

  for (const saleRow of salesDailyRows) {
    const modelKey = modelKeyBySku.get(saleRow.sku);
    if (!modelKey) {
      continue;
    }

    const date = toDateOnly(saleRow.date) ?? saleRow.date;
    const modelSeries = rawSeriesByModel.get(modelKey) ?? new Map<string, InventoryModelSeriesValue>();
    const currentModelPoint = modelSeries.get(date) ?? {
      date,
      stockUnits: 0,
      activeSkuCount: 0,
      salesUnits: 0,
      restockUnits: 0,
      hasSnapshot: false,
    };
    currentModelPoint.salesUnits += saleRow.salesUnits;
    modelSeries.set(date, currentModelPoint);
    rawSeriesByModel.set(modelKey, modelSeries);
  }

  const seriesByModel = new Map<string, InventoryDailySeriesPoint[]>();

  for (const [modelKey, pointMap] of rawSeriesByModel.entries()) {
    let previousStockUnits: number | null = null;
    const sortedPoints = [...pointMap.values()].sort((left, right) => left.date.localeCompare(right.date));

    const normalizedPoints = sortedPoints.map((point) => {
      const expectedStock = previousStockUnits !== null ? Math.max(0, previousStockUnits - point.salesUnits) : 0;
      const restockUnits = point.hasSnapshot
        ? previousStockUnits === null
          ? 0
          : Math.max(0, Number((point.stockUnits - expectedStock).toFixed(0)))
        : 0;

      if (point.hasSnapshot) {
        previousStockUnits = point.stockUnits;
      }

      const globalPoint = globalSeriesMap.get(point.date) ?? {
        date: point.date,
        totalStockUnits: 0,
        totalStockUnitsTela: 0,
        totalStockUnitsDoc: 0,
        activeModelCount: 0,
        activeSkuCount: 0,
        activeSkuCountTela: 0,
        activeSkuCountDoc: 0,
        salesUnits: 0,
        restockUnits: 0,
      };

      globalPoint.salesUnits += point.salesUnits;

      if (point.hasSnapshot) {
        globalPoint.totalStockUnits += point.stockUnits;
        globalPoint.activeModelCount += point.stockUnits > 0 ? 1 : 0;
        globalPoint.activeSkuCount += point.activeSkuCount;
        if (modelKey.startsWith("DOC_DE_CARGA")) {
          globalPoint.activeSkuCountDoc += point.activeSkuCount;
          globalPoint.totalStockUnitsDoc += point.stockUnits;
        } else {
          globalPoint.activeSkuCountTela += point.activeSkuCount;
          globalPoint.totalStockUnitsTela += point.stockUnits;
        }
        globalPoint.restockUnits += restockUnits;
      }

      globalSeriesMap.set(point.date, globalPoint);

      return {
        date: point.date,
        totalStockUnits: 0,
        activeModelCount: 0,
        salesUnits: point.salesUnits,
        restockUnits,
        stockUnits: point.hasSnapshot ? point.stockUnits : null,
        activeSkuCount: point.hasSnapshot ? point.activeSkuCount : null,
      } satisfies InventoryDailySeriesPoint;
    });

    seriesByModel.set(modelKey, normalizedPoints);
  }

  const overviewSeries = [...globalSeriesMap.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-90)
    .map(
      (point) =>
        ({
          date: point.date,
          totalStockUnits: point.totalStockUnits,
          totalStockUnitsTela: point.totalStockUnitsTela,
          totalStockUnitsDoc: point.totalStockUnitsDoc,
          activeModelCount: point.activeModelCount,
          activeSkuCount: point.activeSkuCount,
          activeSkuCountTela: point.activeSkuCountTela,
          activeSkuCountDoc: point.activeSkuCountDoc,
          salesUnits: point.salesUnits,
          restockUnits: point.restockUnits,
          stockUnits: null,
        }) satisfies InventoryDailySeriesPoint,
    );

  for (const model of modelByKey.values()) {
    model.daysSinceLastSale = calculateDaysSinceDate(model.lastSaleAt);
    model.coverageDays =
      model.stockUnits > 0 && model.sales90 > 0 ? Number(((model.stockUnits / model.sales90) * 90).toFixed(1)) : null;
    model.buyRecommendation = resolveInventoryBuyRecommendation({
      stockUnits: model.stockUnits,
      coverageDays: model.coverageDays,
      sales90: model.sales90,
    });
    model.buyPriority = computeBuyPriority(model);
    model.holdSales =
      (model.stockUnits <= 0 && model.sales90 > 0) ||
      (model.stockUnits > 0 && model.coverageDays !== null && model.coverageDays <= INVENTORY_COVERAGE_LOW_DAYS);

    const modelSeries = seriesByModel.get(model.modelKey) ?? [];
    const lastRestockPoint = [...modelSeries].reverse().find((point) => point.restockUnits > 0);
    model.lastRestockAt = lastRestockPoint?.date ?? (model.deltaIn > 0 ? toDateOnly(context.snapshot.importedAt) : null);
    model.currentItems = [...model.currentItems].sort(
      (left, right) => right.stockCurrent - left.stockCurrent || right.sales90 - left.sales90 || sortLocale(left.model, right.model),
    );
  }

  const models = [...modelByKey.values()].sort((left, right) => sortLocale(left.modelLabel, right.modelLabel));
  const dataset: InventoryAnalyticsDataset = {
    snapshot: context.snapshot,
    previousSnapshot: context.previousSnapshot,
    models,
    modelMap: modelByKey,
    overviewSeries,
    seriesByModel,
    latestSeriesDate: overviewSeries.at(-1)?.date ?? toDateOnly(context.snapshot.importedAt),
  };

  inventoryAnalyticsCache = {
    snapshotId,
    builtAt: Date.now(),
    data: dataset,
  };

  return dataset;
}

function buildOverviewCards(models: InventoryModelAggregate[]): InventoryOverviewCard[] {
  const buyUrgent = models.filter((model) => model.buyRecommendation === "BUY_NOW").length;
  const endingSoon = models.filter(
    (model) => model.stockUnits > 0 && model.coverageDays !== null && model.coverageDays <= INVENTORY_COVERAGE_LOW_DAYS,
  ).length;
  const restockedToday = models.filter((model) => model.deltaIn > 0).length;
  const stale90 = models
    .filter((model) => model.stockUnits > 0 && (model.daysSinceLastSale === null || model.daysSinceLastSale >= 90))
    .reduce((sum, model) => sum + model.currentItems.filter((sku) => sku.stockCurrent > 0).length, 0);
  const holdSales = models.filter((model) => model.holdSales).length;

  return [
    {
      key: "BUY_URGENT",
      title: "Comprar urgente",
      helper: "Modelos que vendem e estao sem folga de estoque.",
      count: buyUrgent,
      tone: "danger",
      targetTab: "buying",
      targetFilter: "buy_now",
    },
    {
      key: "ENDING_SOON",
      title: "Vai acabar",
      helper: "Ainda tem saldo, mas a cobertura ja esta curta.",
      count: endingSoon,
      tone: "warning",
      targetTab: "buying",
      targetFilter: "ending_soon",
    },
    {
      key: "RESTOCKED_TODAY",
      title: "Chegou reposicao",
      helper: "Entrou produto e ja vale acompanhar o efeito da reposicao.",
      count: restockedToday,
      tone: "success",
      targetTab: "restock",
      targetFilter: "arrived_today",
    },
    {
      key: "STALE_90",
      title: "Parado 90+ dias",
      helper: "SKUs ocupando espaco e pedindo promocao ou giro.",
      count: stale90,
      tone: "warning",
      targetTab: "stale",
      targetFilter: "90_plus",
    },
    {
      key: "HOLD_SALES",
      title: "Segurar venda",
      helper: "Venda precisa ser controlada para nao faltar.",
      count: holdSales,
      tone: "danger",
      targetTab: "buying",
      targetFilter: "hold_sales",
    },
  ];
}

function mapRestockItem(
  model: InventoryModelAggregate,
  series: InventoryDailySeriesPoint[],
  latestSeriesDate: string | null,
): InventoryRestockListItem | null {
  const lastRestockPoint = [...series].reverse().find((point) => point.restockUnits > 0) ?? null;

  if (!lastRestockPoint && model.buyRecommendation !== "BUY_NOW") {
    return null;
  }

  const effectiveRestockPoint = lastRestockPoint ?? series.at(-1) ?? null;
  const restockIndex =
    effectiveRestockPoint
      ? series.findIndex(
          (point) =>
            point.date === effectiveRestockPoint.date && point.restockUnits === effectiveRestockPoint.restockUnits,
        )
      : -1;
  const previousPoint = restockIndex > 0 ? series[restockIndex - 1] : null;
  const sales7Before = series
    .slice(Math.max(0, restockIndex - 7), Math.max(0, restockIndex))
    .reduce((sum, point) => sum + point.salesUnits, 0);
  const sales7After = series
    .slice(restockIndex >= 0 ? restockIndex + 1 : 0, restockIndex >= 0 ? restockIndex + 8 : 7)
    .reduce((sum, point) => sum + point.salesUnits, 0);

  const stockBefore = previousPoint?.stockUnits ?? Math.max(0, model.stockUnits - model.deltaIn);
  const stockAfter = effectiveRestockPoint?.stockUnits ?? model.stockUnits;
  const restockUnits = effectiveRestockPoint?.restockUnits ?? 0;

  return {
    modelKey: model.modelKey,
    modelLabel: model.modelLabel,
    brand: model.brand,
    family: model.family,
    productKind: model.productKind,
    lastRestockAt: effectiveRestockPoint?.date ?? model.lastRestockAt,
    restockUnits,
    stockBefore: stockBefore ?? 0,
    stockAfter: stockAfter ?? model.stockUnits,
    stockUnits: model.stockUnits,
    activeSkuCount: model.activeSkuCount,
    sales7Before,
    sales7After,
    sales30: model.sales30,
    coverageDays: model.coverageDays,
    buyRecommendation: model.buyRecommendation,
    status: resolveInventoryRestockStatus({
      lastRestockAt: effectiveRestockPoint?.date ?? model.lastRestockAt,
      latestSeriesDate,
      coverageDays: model.coverageDays,
      stockAfter: stockAfter ?? model.stockUnits,
      sales7Before,
      sales7After,
    }),
  };
}

function mapStaleBucket(daysSinceLastSale: number | null) {
  if (daysSinceLastSale === null || daysSinceLastSale >= 120) {
    return "120_PLUS" as const;
  }

  if (daysSinceLastSale >= 90) {
    return "90_PLUS" as const;
  }

  if (daysSinceLastSale >= 60) {
    return "60_PLUS" as const;
  }

  return "30_PLUS" as const;
}

function aggregateDeposits(items: InventoryIntelligenceItem[]): InventoryModelDepositBalance[] {
  const depositMap = new Map<string, InventoryModelDepositBalance>();

  for (const item of items) {
    for (const deposit of item.enrichment?.deposits ?? []) {
      const key = deposit.id ?? deposit.name;
      const current = depositMap.get(key) ?? {
        name: deposit.name,
        companyName: deposit.companyName,
        balance: 0,
        reservedBalance: 0,
      };
      current.balance += deposit.balance;
      current.reservedBalance += toNumber(deposit.reservedBalance);
      depositMap.set(key, current);
    }
  }

  return [...depositMap.values()].sort((left, right) => right.balance - left.balance || sortLocale(left.name, right.name));
}

export async function getInventoryOverview(): Promise<InventoryOverviewResponse> {
  const dataset = await buildInventoryAnalyticsDataset();

  return {
    snapshot: dataset.snapshot,
    previousSnapshot: dataset.previousSnapshot,
    cards: buildOverviewCards(dataset.models),
    dailySeries: dataset.overviewSeries,
    highlights: buildOverviewHighlights(dataset.overviewSeries),
    totals: {
      totalStockUnits: dataset.models.reduce((sum, model) => sum + model.stockUnits, 0),
      totalStockUnitsTela: dataset.models.filter(m => m.productKind === "TELA").reduce((sum, model) => sum + model.stockUnits, 0),
      totalStockUnitsDoc: dataset.models.filter(m => m.productKind === "DOC_DE_CARGA").reduce((sum, model) => sum + model.stockUnits, 0),
      activeModelCount: dataset.models.filter((model) => model.stockUnits > 0).length,
      activeSkuCount: dataset.models.reduce((sum, model) => sum + model.activeSkuCount, 0),
      activeSkuCountTela: dataset.models.filter(m => m.productKind === "TELA").reduce((sum, model) => sum + model.activeSkuCount, 0),
      activeSkuCountDoc: dataset.models.filter(m => m.productKind === "DOC_DE_CARGA").reduce((sum, model) => sum + model.activeSkuCount, 0),
      sales30: dataset.models.reduce((sum, model) => sum + model.sales30, 0),
      sales90: dataset.models.reduce((sum, model) => sum + model.sales90, 0),
      trappedValue: Number(dataset.models.reduce((sum, model) => sum + model.trappedValue, 0).toFixed(2)),
    },
  };
}

export async function getInventoryBuying(): Promise<InventoryBuyingResponse> {
  const dataset = await buildInventoryAnalyticsDataset();

  const items = [...dataset.models]
    .sort(
      (left, right) =>
        right.buyPriority - left.buyPriority ||
        (left.coverageDays ?? Number.POSITIVE_INFINITY) - (right.coverageDays ?? Number.POSITIVE_INFINITY) ||
        right.sales90 - left.sales90 ||
        left.activeSkuCount - right.activeSkuCount ||
        sortLocale(left.modelLabel, right.modelLabel),
    )
    .map((model) => buildBuyingListItem(model));

  return {
    snapshot: dataset.snapshot,
    items,
  };
}

export async function getInventoryRestock(): Promise<InventoryRestockResponse> {
  const dataset = await buildInventoryAnalyticsDataset();
  const items = dataset.models
    .map((model) => mapRestockItem(model, dataset.seriesByModel.get(model.modelKey) ?? [], dataset.latestSeriesDate))
    .filter((item): item is InventoryRestockListItem => Boolean(item))
    .sort(
      (left, right) =>
        String(right.lastRestockAt ?? "").localeCompare(String(left.lastRestockAt ?? "")) ||
        right.restockUnits - left.restockUnits ||
        sortLocale(left.modelLabel, right.modelLabel),
    );

  return {
    snapshot: dataset.snapshot,
    counts: {
      arrivedToday: items.filter((item) => item.status === "ARRIVED_TODAY").length,
      backToSelling: items.filter((item) => item.status === "BACK_TO_SELLING").length,
      noReactionYet: items.filter((item) => item.status === "NO_REACTION_YET").length,
      restockAgain: items.filter((item) => item.status === "RESTOCK_AGAIN").length,
    },
    items,
  };
}

export async function getInventoryStale(): Promise<InventoryStaleResponse> {
  const dataset = await buildInventoryAnalyticsDataset();

  // Load per-SKU last sale dates for accurate individual staleness
  const allSkus = dataset.models.flatMap((m) => m.currentItems.filter((s) => s.stockCurrent > 0).map((s) => s.sku));
  const lastSaleRows = await loadLastSaleRows(allSkus);
  const lastSaleBySku = new Map(lastSaleRows.map((row) => [row.sku, row.lastSaleAt]));

  const now = new Date();

  const items = dataset.models
    .filter((model) => model.stockUnits > 0)
    .flatMap((model) =>
      model.currentItems
        .filter((skuItem) => skuItem.stockCurrent > 0)
        .map((skuItem) => {
          const skuLastSaleAt = lastSaleBySku.get(skuItem.sku) ?? null;
          let skuDaysSinceLastSale: number | null = null;
          if (skuLastSaleAt) {
            const diff = now.getTime() - new Date(skuLastSaleAt).getTime();
            skuDaysSinceLastSale = Math.floor(diff / (1000 * 60 * 60 * 24));
          }

          return {
            sku: skuItem.sku,
            modelKey: model.modelKey,
            modelLabel: cleanInventoryModelLabel(String(skuItem.model ?? model.modelLabel)),
            color: skuItem.color,
            quality: skuItem.quality,
            brand: model.brand,
            family: model.family,
            productKind: model.productKind,
            stockUnits: skuItem.stockCurrent,
            activeSkuCount: 1,
            totalSkuCount: 1,
            lastSaleAt: skuLastSaleAt,
            daysSinceLastSale: skuDaysSinceLastSale,
            trappedValue: skuItem.stockCurrent * skuItem.price,
            trappedValueEstimated: !skuItem.enrichment?.costPrice,
            sales90: skuItem.sales90,
            unitPrice: skuItem.price,
            lastRestockAt: model.lastRestockAt,
            suggestedAction: resolveInventoryStaleAction(skuDaysSinceLastSale),
            staleBucket: mapStaleBucket(skuDaysSinceLastSale),
          } satisfies InventoryStaleListItem;
        }),
    )
    // Filter: only keep SKUs that are individually stale (15+ days or never sold)
    .filter((item) => item.daysSinceLastSale === null || item.daysSinceLastSale >= 15)
    .sort(
      (left, right) =>
        (right.daysSinceLastSale ?? Number.POSITIVE_INFINITY) - (left.daysSinceLastSale ?? Number.POSITIVE_INFINITY) ||
        right.trappedValue - left.trappedValue ||
        sortLocale(left.modelLabel, right.modelLabel) ||
        sortLocale(left.sku, right.sku),
    );

  return {
    snapshot: dataset.snapshot,
    counts: {
      stale15_30: items.filter((item) => item.daysSinceLastSale !== null && item.daysSinceLastSale >= 15 && item.daysSinceLastSale < 30).length,
      stale30_60: items.filter((item) => item.daysSinceLastSale !== null && item.daysSinceLastSale >= 30 && item.daysSinceLastSale < 60).length,
      stale60_90: items.filter((item) => item.daysSinceLastSale !== null && item.daysSinceLastSale >= 60 && item.daysSinceLastSale < 90).length,
      stale90_120: items.filter((item) => item.daysSinceLastSale !== null && item.daysSinceLastSale >= 90 && item.daysSinceLastSale < 120).length,
      stale120plus: items.filter((item) => item.daysSinceLastSale === null || item.daysSinceLastSale >= 120).length,
    },
    items,
  };
}

export async function getInventoryModels(): Promise<InventoryModelsResponse> {
  const dataset = await buildInventoryAnalyticsDataset();
  const items = [...dataset.models]
    .sort((left, right) => sortLocale(left.modelLabel, right.modelLabel))
    .map(
      (model) =>
        ({
          modelKey: model.modelKey,
          modelLabel: model.modelLabel,
          brand: model.brand,
          family: model.family,
          productKind: model.productKind,
          stockUnits: model.stockUnits,
          activeSkuCount: model.activeSkuCount,
          totalSkuCount: model.totalSkuCount,
          sales30: model.sales30,
          sales90: model.sales90,
          lastSaleAt: model.lastSaleAt,
          daysSinceLastSale: model.daysSinceLastSale,
          qualityLabels: model.qualityLabels,
          sampleSkus: model.sampleSkus,
          buyRecommendation: model.buyRecommendation,
        }) satisfies InventoryModelListItem,
    );

  return {
    snapshot: dataset.snapshot,
    filters: {
      brands: sortUnique(dataset.models.map((model) => model.brand)),
      families: sortUnique(dataset.models.map((model) => model.family)),
      qualities: sortUnique(dataset.models.flatMap((model) => model.qualityLabels)),
    },
    items,
  };
}

export async function getInventoryModelDetail(modelKey: string): Promise<InventoryModelDetailResponse> {
  const dataset = await buildInventoryAnalyticsDataset();
  const normalizedModelKey = normalizeCode(modelKey);
  const target =
    dataset.modelMap.get(modelKey) ??
    dataset.models.find((model) => normalizeCode(model.modelKey) === normalizedModelKey) ??
    null;

  if (!target) {
    return {
      snapshot: dataset.snapshot,
      model: null,
      dailySeries: [],
      benchmarks: {
        lowStockAvgSales: null,
        highStockAvgSales: null,
        shortMixAvgSales: null,
        wideMixAvgSales: null,
      },
      highlights: [],
      skus: [],
      topCustomers: [],
      deposits: [],
    };
  }

  await ensureTinyProductCacheForItems(target.currentItems.slice(0, INTELLIGENCE_PREVIEW_ENRICHMENT_LIMIT));

  const series = dataset.seriesByModel.get(target.modelKey) ?? [];
  const benchmarks = buildModelBenchmarks(series);

  return {
    snapshot: dataset.snapshot,
    model: buildBuyingListItem(target),
    dailySeries: series,
    benchmarks,
    highlights: buildModelHighlights(target, benchmarks, series),
    skus: [...target.currentItems],
    topCustomers: await loadTopCustomersForModelSkus(target.currentItems.map((item) => item.sku)),
    deposits: aggregateDeposits(target.currentItems),
  };
}

import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { extractDisplayName, normalizeCode, normalizeText, safeNumber, toIsoDate } from "../../lib/normalize.js";
import { rebuildReadModels } from "../analytics/analyticsService.js";
import { buildSaleLineFingerprint } from "./fingerprint.js";
import { OlistClient, withRetry } from "./olistClient.js";
import type { NormalizedSaleRow } from "./types.js";

const client = new OlistClient();
const CONTACT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type OlistOrder = Awaited<ReturnType<OlistClient["getOrder"]>>;

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

interface ContactLike {
  id: string;
  name: string;
  fantasyName: string | null;
  city: string | null;
  state: string | null;
  sellerId: string | null;
  sellerName: string | null;
  raw: Record<string, unknown>;
}

interface ResolveOrderAttendantDeps {
  findContactAttendantByCustomer: (customerCode: string, customerName: string) => Promise<string | null>;
  getHistoricalAttendantByCustomerCode: (customerCode: string) => Promise<string | null>;
}

function normalizeAttendantName(value: unknown) {
  const normalized = normalizeText(String(value ?? ""));
  return normalized ? normalized : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function isContactCacheFresh(fetchedAt: string | null | undefined) {
  if (!fetchedAt) {
    return false;
  }

  const parsed = new Date(fetchedAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return Date.now() - parsed.getTime() <= CONTACT_CACHE_TTL_MS;
}

function buildOrderCustomerContext(order: OlistOrder) {
  const customerCode = normalizeCode(order.cliente.codigo || String(order.id));
  const customerName = extractDisplayName(normalizeText(order.cliente.nome), customerCode);
  const customerLabel = `${customerCode} - ${customerName}`;

  return {
    customerCode,
    customerName,
    customerLabel,
  };
}

export function extractOrderAttendantName(order: OlistOrder) {
  const orderRecord = asRecord(order);
  const vendorRecord = asRecord(orderRecord?.vendedor);
  const sellerRecord = asRecord(orderRecord?.seller);
  const attendantRecord = asRecord(orderRecord?.atendente);

  const candidates = [
    orderRecord?.nome_vendedor,
    orderRecord?.nomeVendedor,
    orderRecord?.vendedor_nome,
    orderRecord?.seller_name,
    orderRecord?.sellerName,
    orderRecord?.nome_atendente,
    orderRecord?.atendente_nome,
    orderRecord?.atendente,
    vendorRecord?.nome,
    vendorRecord?.nome_vendedor,
    vendorRecord?.nomeVendedor,
    sellerRecord?.nome,
    sellerRecord?.name,
    sellerRecord?.seller_name,
    attendantRecord?.nome,
    attendantRecord?.name,
  ];

  for (const candidate of candidates) {
    const attendantName = normalizeAttendantName(candidate);
    if (attendantName) {
      return attendantName;
    }
  }

  return null;
}

export async function resolveOrderAttendantName(
  order: OlistOrder,
  deps: ResolveOrderAttendantDeps,
) {
  const directAttendant = extractOrderAttendantName(order);
  if (directAttendant) {
    return directAttendant;
  }

  const { customerCode, customerName } = buildOrderCustomerContext(order);
  const contactAttendant = await deps.findContactAttendantByCustomer(customerCode, customerName);
  if (contactAttendant) {
    return contactAttendant;
  }

  return deps.getHistoricalAttendantByCustomerCode(customerCode);
}

async function loadTinyContactCache(customerCode: string) {
  if (!customerCode) {
    return null;
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
        fetched_at::text AS fetched_at
      FROM tiny_contact_cache
      WHERE customer_code = $1
      LIMIT 1
    `,
    [customerCode],
  );

  return result.rows[0] ?? null;
}

async function upsertTinyContactCache(customerCode: string, contact: ContactLike | null) {
  if (!customerCode) {
    return;
  }

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
      customerCode,
      contact?.id ?? null,
      contact?.name ?? null,
      contact?.fantasyName ?? null,
      contact?.city ?? null,
      contact?.state ?? null,
      contact?.sellerId ?? null,
      contact?.sellerName ?? null,
      JSON.stringify(contact?.raw ?? {}),
    ],
  );
}

function pickBestContactMatch(
  contacts: Awaited<ReturnType<OlistClient["searchContacts"]>>["contacts"],
  customerCode: string,
  customerName: string,
) {
  const normalizedCode = normalizeCode(customerCode);
  const normalizedName = normalizeText(customerName).toLowerCase();

  return (
    contacts.find((contact) => normalizeCode(contact.code) === normalizedCode) ??
    contacts.find((contact) => normalizeText(contact.name).toLowerCase() === normalizedName) ??
    contacts.find((contact) => normalizeText(contact.fantasyName ?? "").toLowerCase() === normalizedName) ??
    contacts[0] ??
    null
  );
}

async function fetchContactAttendantFromOlist(customerCode: string, customerName: string) {
  const searchTerms = [...new Set([customerCode, customerName].map((value) => normalizeText(value)).filter(Boolean))];
  let latestContact: ContactLike | null = null;

  for (const searchTerm of searchTerms) {
    const search = await withRetry(() => client.searchContacts({ search: searchTerm, page: 1 }));
    const match = pickBestContactMatch(search.contacts, customerCode, customerName);
    if (!match) {
      continue;
    }

    latestContact = match;
    if (normalizeAttendantName(match.sellerName)) {
      return match;
    }

    const detail = await withRetry(() => client.getContact(match.id));
    latestContact = detail;
    if (normalizeAttendantName(detail.sellerName)) {
      return detail;
    }
  }

  return latestContact;
}

async function findContactAttendantByCustomer(customerCode: string, customerName: string) {
  const cacheRow = await loadTinyContactCache(customerCode);
  const cachedSellerName = normalizeAttendantName(cacheRow?.seller_name);
  if (cachedSellerName) {
    return cachedSellerName;
  }

  if (cacheRow && isContactCacheFresh(cacheRow.fetched_at)) {
    return null;
  }

  try {
    const contact = await fetchContactAttendantFromOlist(customerCode, customerName);
    await upsertTinyContactCache(customerCode, contact);
    return normalizeAttendantName(contact?.sellerName);
  } catch (error) {
    logger.warn("olist contact fallback failed", {
      customerCode,
      customerName,
      error: String(error),
    });
    return null;
  }
}

async function getHistoricalAttendantByCustomerCode(customerCode: string) {
  if (!customerCode) {
    return null;
  }

  const result = await pool.query<{ attendant: string | null }>(
    `
      SELECT COALESCE(
        (SELECT NULLIF(cs.last_attendant, '') FROM customer_snapshot cs JOIN customers c ON c.id = cs.customer_id WHERE c.customer_code = $1 LIMIT 1),
        (SELECT NULLIF(c.last_attendant, '') FROM customers c WHERE c.customer_code = $1 LIMIT 1),
        (
          SELECT NULLIF(sr.attendant_name, '')
          FROM sales_raw sr
          WHERE sr.customer_code = $1
            AND NULLIF(sr.attendant_name, '') IS NOT NULL
          ORDER BY sr.sale_date DESC, sr.created_at DESC
          LIMIT 1
        ),
        (
          SELECT NULLIF(o.last_attendant, '')
          FROM orders o
          WHERE o.customer_code = $1
            AND NULLIF(o.last_attendant, '') IS NOT NULL
          ORDER BY o.order_date DESC, o.created_at DESC
          LIMIT 1
        )
      ) AS attendant
    `,
    [customerCode],
  );

  return normalizeAttendantName(result.rows[0]?.attendant);
}

async function insertOlistRows(rows: NormalizedSaleRow[]) {
  if (!rows.length) {
    return 0;
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

  const result = await pool.query(
    `
      INSERT INTO sales_raw (
        source_system, source_file_id, import_run_id, external_order_id, external_customer_id,
        sale_date, item_description, quantity, customer_code, unit_price, line_total,
        order_number, sku, customer_label, attendant_name, order_status, order_updated_at,
        fingerprint, raw_payload
      )
      SELECT *
      FROM UNNEST(
        $1::text[], $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::date[], $7::text[],
        $8::numeric[], $9::text[], $10::numeric[], $11::numeric[], $12::text[], $13::text[],
        $14::text[], $15::text[], $16::text[], $17::timestamptz[], $18::text[], $19::jsonb[]
      )
      ON CONFLICT (fingerprint) DO NOTHING
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

  return result.rowCount ?? 0;
}

function toNormalizedSaleRows(order: OlistOrder, attendantName: string | null): NormalizedSaleRow[] {
  const saleDate = toIsoDate(order.data_pedido ?? new Date().toISOString());
  const { customerCode, customerLabel } = buildOrderCustomerContext(order);

  return order.itens.map((entry) => {
    const item = entry.item;
    const quantity = safeNumber(item.quantidade);
    const unitPrice = safeNumber(item.valor_unitario);
    const lineTotal = quantity * unitPrice;
    const sku = normalizeText(item.codigo) || null;

    return {
      sourceSystem: "olist_v2",
      sourceFileId: null,
      importRunId: null,
      externalOrderId: String(order.id),
      externalCustomerId: order.cliente.codigo ?? null,
      saleDate,
      itemDescription: normalizeText(item.descricao),
      quantity,
      customerCode,
      unitPrice,
      lineTotal,
      orderNumber: normalizeText(String(order.numero)),
      sku,
      customerLabel,
      attendantName,
      orderStatus: normalizeText(order.situacao) || "VALID",
      orderUpdatedAt: new Date().toISOString(),
      fingerprint: buildSaleLineFingerprint({
        sourceSystem: "olist_v2",
        saleDate,
        customerCode,
        orderNumber: normalizeText(String(order.numero)),
        sku,
        quantity,
        lineTotal,
      }),
      rawPayload: order as unknown as Record<string, unknown>,
    };
  });
}

async function getCursor(key: string) {
  const result = await pool.query("SELECT cursor_value FROM sync_cursors WHERE key = $1", [key]);
  return (result.rows[0]?.cursor_value as string | undefined) ?? null;
}

async function setCursor(key: string, value: string) {
  await pool.query(
    `
      INSERT INTO sync_cursors (key, cursor_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
    `,
    [key, value],
  );
}

export async function syncOlistIncremental() {
  if (!env.OLIST_API_TOKEN) {
    logger.warn("olist sync skipped: OLIST_API_TOKEN not configured");
    return { skipped: true, reason: "MISSING_TOKEN" };
  }

  const run = await pool.query(
    "INSERT INTO sync_runs (source_system, status) VALUES ('olist_v2', 'RUNNING') RETURNING id",
  );
  const runId = String(run.rows[0]?.id);
  let recordsSeen = 0;
  let recordsInserted = 0;
  const impactedCustomerCodes = new Set<string>();
  const resolvedContactAttendants = new Map<string, string | null>();
  const resolvedHistoricalAttendants = new Map<string, string | null>();

  try {
    let page = 1;
    const updatedSince = (await getCursor("olist_v2_orders")) ?? `${env.OLIST_SYNC_START_DATE} 00:00:00`;
    let totalPages = 1;

    do {
      const response = await withRetry(() => client.searchOrders({ page, updatedSince }));
      totalPages = response.totalPages;
      for (const summary of response.orders) {
        const order = await withRetry(() => client.getOrder(summary.id));
        const { customerCode, customerName } = buildOrderCustomerContext(order);
        const cacheKey = customerCode || normalizeText(customerName).toLowerCase();
        const attendantName = await resolveOrderAttendantName(order, {
          findContactAttendantByCustomer: async (candidateCustomerCode, candidateCustomerName) => {
            const candidateKey = candidateCustomerCode || normalizeText(candidateCustomerName).toLowerCase();
            if (resolvedContactAttendants.has(candidateKey)) {
              return resolvedContactAttendants.get(candidateKey) ?? null;
            }

            const resolved = await findContactAttendantByCustomer(candidateCustomerCode, candidateCustomerName);
            resolvedContactAttendants.set(candidateKey, resolved);
            return resolved;
          },
          getHistoricalAttendantByCustomerCode: async (candidateCustomerCode) => {
            if (resolvedHistoricalAttendants.has(candidateCustomerCode)) {
              return resolvedHistoricalAttendants.get(candidateCustomerCode) ?? null;
            }

            const resolved = await getHistoricalAttendantByCustomerCode(candidateCustomerCode);
            resolvedHistoricalAttendants.set(candidateCustomerCode, resolved);
            return resolved;
          },
        });

        if (!attendantName) {
          logger.warn("olist order without resolved attendant", {
            orderId: String(order.id),
            orderNumber: normalizeText(String(order.numero)),
            customerCode,
            customerName,
            cacheKey,
          });
        }

        const rows = toNormalizedSaleRows(order, attendantName);
        recordsSeen += rows.length;
        recordsInserted += await insertOlistRows(rows);
        for (const row of rows) {
          impactedCustomerCodes.add(row.customerCode);
        }
      }
      page += 1;
    } while (page <= totalPages);

    if (impactedCustomerCodes.size) {
      await rebuildReadModels(Array.from(impactedCustomerCodes));
    }

    const cursor = new Date().toISOString();
    await setCursor("olist_v2_orders", cursor);
    await pool.query(
      `
        UPDATE sync_runs
        SET status = 'COMPLETED', finished_at = NOW(), records_seen = $2, records_inserted = $3
        WHERE id = $1
      `,
      [runId, recordsSeen, recordsInserted],
    );

    return { runId, recordsSeen, recordsInserted, cursor };
  } catch (error) {
    await pool.query(
      `
        UPDATE sync_runs
        SET
          status = 'FAILED',
          finished_at = NOW(),
          records_seen = $2,
          records_inserted = $3,
          errors = jsonb_build_array($4::text)
        WHERE id = $1
      `,
      [runId, recordsSeen, recordsInserted, String(error)],
    );
    throw error;
  }
}

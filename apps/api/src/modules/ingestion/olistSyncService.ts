import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { extractDisplayName, normalizeCode, normalizeText, safeNumber, toIsoDate } from "../../lib/normalize.js";
import { rebuildReadModels } from "../analytics/analyticsService.js";
import { buildSaleLineFingerprint } from "./fingerprint.js";
import { OlistClient, withRetry } from "./olistClient.js";
import type { NormalizedSaleRow } from "./types.js";

const client = new OlistClient();

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

function toNormalizedSaleRows(order: Awaited<ReturnType<OlistClient["getOrder"]>>): NormalizedSaleRow[] {
  const saleDate = toIsoDate(order.data_pedido ?? new Date().toISOString());
  const customerCode = normalizeCode(order.cliente.codigo || String(order.id));
  const customerName = extractDisplayName(normalizeText(order.cliente.nome), customerCode);
  const customerLabel = `${customerCode} - ${customerName}`;

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
      attendantName: null,
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
  const run = await pool.query(
    "INSERT INTO sync_runs (source_system, status) VALUES ('olist_v2', 'RUNNING') RETURNING id",
  );
  const runId = String(run.rows[0]?.id);
  let recordsSeen = 0;
  let recordsInserted = 0;
  const impactedCustomerCodes = new Set<string>();

  try {
    let page = 1;
    const updatedSince = (await getCursor("olist_v2_orders")) ?? `${env.OLIST_SYNC_START_DATE} 00:00:00`;
    let totalPages = 1;

    do {
      const response = await withRetry(() => client.searchOrders({ page, updatedSince }));
      totalPages = response.totalPages;
      for (const summary of response.orders) {
        const order = await withRetry(() => client.getOrder(summary.id));
        const rows = toNormalizedSaleRows(order);
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

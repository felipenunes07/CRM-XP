import { Pool } from "pg";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { normalizeCode, normalizeText, safeNumber, toIsoDate } from "../../lib/normalize.js";
import { rebuildReadModels } from "../analytics/analyticsService.js";
import { buildSaleLineFingerprint } from "./fingerprint.js";
import type { NormalizedSaleRow } from "./types.js";

const COLUMN_ALIASES = {
  data: ["data", "sale_date", "order_date", "dtvenda", "dt_venda", "data_venda"],
  modelo: ["modelo", "descricao", "descricao_produto", "item_description", "produto", "product_name", "model"],
  quantidade: ["quantidade", "quantity", "qtd", "qty"],
  cod_cliente: ["cod_cliente", "codigo_cliente", "customer_code", "codcliente", "cliente_codigo", "codclienteerp"],
  valor_unitario: ["valor_unitario", "unit_price", "preco_unitario", "valorunitario", "valor_unit"],
  valor_total: ["valor_total", "line_total", "total", "valor", "valoritem", "vl_total"],
  numero_nota: ["numero_nota", "nota", "order_number", "numero", "num_nota", "numero_pedido", "pedido"],
  sku: ["sku", "codigo_produto", "product_code", "codigo", "item_code"],
  cliente: ["cliente", "customer_name", "customer_label", "nome_cliente", "razao_social", "nome"],
  atendente: ["atendente", "seller", "vendedor", "responsavel", "usuario", "atendente_nome"],
} as const;

function normalizeColumnKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveColumnNames(columns: string[]) {
  const normalizedMap = new Map(columns.map((column) => [normalizeColumnKey(column), column]));

  const resolved: Partial<Record<keyof typeof COLUMN_ALIASES, string>> = {};
  for (const [target, aliases] of Object.entries(COLUMN_ALIASES) as Array<
    [keyof typeof COLUMN_ALIASES, readonly string[]]
  >) {
    for (const alias of aliases) {
      const found = normalizedMap.get(normalizeColumnKey(alias));
      if (found) {
        resolved[target] = found;
        break;
      }
    }
  }

  const required = ["data", "modelo", "quantidade", "cod_cliente", "numero_nota", "cliente"] as const;
  const missing = required.filter((key) => !resolved[key]);
  if (missing.length) {
    throw new Error(`Supabase table is missing required columns: ${missing.join(", ")}`);
  }

  return resolved as Record<keyof typeof COLUMN_ALIASES, string | undefined>;
}

async function registerSupabaseSource(tableName: string, metadata: Record<string, unknown>) {
  const originalPath = `supabase://public/${tableName}`;
  const fileHash = JSON.stringify(metadata);
  const result = await pool.query(
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
      VALUES ('supabase_table', $1, $2, $3, 0, $4, NOW())
      ON CONFLICT (original_path) DO UPDATE
      SET
        file_hash = EXCLUDED.file_hash,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
    `,
    [originalPath, tableName, fileHash, metadata],
  );

  return String(result.rows[0]?.id);
}

async function createImportRun(sourceFileId: string) {
  const result = await pool.query(
    `
      INSERT INTO import_runs (source_file_id, status)
      VALUES ($1, 'RUNNING')
      RETURNING id
    `,
    [sourceFileId],
  );
  return String(result.rows[0]?.id);
}

function normalizeSupabaseRows(
  rows: Array<Record<string, unknown>>,
  resolved: Record<keyof typeof COLUMN_ALIASES, string | undefined>,
  sourceFileId: string,
  importRunId: string,
): NormalizedSaleRow[] {
  return rows.flatMap((row, index) => {
    const saleDateColumn = resolved.data!;
    const customerCodeColumn = resolved.cod_cliente!;
    const orderNumberColumn = resolved.numero_nota!;
    const itemDescriptionColumn = resolved.modelo!;
    const quantityColumn = resolved.quantidade!;
    const customerLabelColumn = resolved.cliente!;
    const unitPriceColumn = resolved.valor_unitario;
    const lineTotalColumn = resolved.valor_total;
    const skuColumn = resolved.sku;
    const attendantColumn = resolved.atendente;

    const fallbackDateValue = row.data_importacao ?? row.dataImportacao ?? row.imported_at ?? row.importedAt;
    const rawSaleDate = row[saleDateColumn] ?? fallbackDateValue ?? "";
    let saleDate: string;
    try {
      saleDate = toIsoDate(rawSaleDate);
    } catch {
      return [];
    }
    const customerCode = normalizeCode(String(row[customerCodeColumn] ?? ""));
    const orderNumber = normalizeText(String(row[orderNumberColumn] ?? `supabase-2026-${index + 1}`));
    const itemDescription = normalizeText(String(row[itemDescriptionColumn] ?? ""));
    const quantity = safeNumber(row[quantityColumn] ?? 0);
    const lineTotal =
      lineTotalColumn && row[lineTotalColumn] !== null && row[lineTotalColumn] !== undefined
        ? safeNumber(row[lineTotalColumn])
        : unitPriceColumn
          ? safeNumber(row[unitPriceColumn] ?? 0) * Math.max(1, quantity)
          : 0;
    const unitPrice =
      unitPriceColumn && row[unitPriceColumn] !== null && row[unitPriceColumn] !== undefined
        ? safeNumber(row[unitPriceColumn])
        : quantity > 0
          ? lineTotal / quantity
          : 0;
    const sku = skuColumn ? normalizeText(String(row[skuColumn] ?? "")) || null : null;
    const customerLabel = normalizeText(String(row[customerLabelColumn] ?? customerCode));
    const attendantName = attendantColumn ? normalizeText(String(row[attendantColumn] ?? "")) || null : null;
    const fingerprint = buildSaleLineFingerprint({
      sourceSystem: "supabase_2026",
      saleDate,
      customerCode,
      orderNumber,
      sku,
      quantity,
      lineTotal,
    });

    return [
      {
        sourceSystem: "supabase_2026",
        sourceFileId,
        importRunId,
        externalOrderId: null,
        externalCustomerId: null,
        saleDate,
        itemDescription,
        quantity,
        customerCode,
        unitPrice,
        lineTotal,
        orderNumber,
        sku,
        customerLabel,
        attendantName,
        orderStatus: "VALID",
        orderUpdatedAt: null,
        fingerprint,
        rawPayload: row,
      },
    ];
  });
}

async function insertRawRows(rows: NormalizedSaleRow[]) {
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

export async function importSupabase2026() {
  if (!env.SUPABASE_DATABASE_URL || env.SUPABASE_DATABASE_URL.includes("[YOUR-PASSWORD]")) {
    throw new Error("SUPABASE_DATABASE_URL não configurada com a senha real.");
  }

  const remotePool = new Pool({
    connectionString: env.SUPABASE_DATABASE_URL,
  });

  let importRunId = "";
  try {
    const columnResult = await remotePool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `,
      [env.SUPABASE_TABLE_2026],
    );

    const columns = columnResult.rows.map((row) => String(row.column_name));
    if (!columns.length) {
      throw new Error(`Tabela public.${env.SUPABASE_TABLE_2026} não encontrada ou sem colunas acessíveis.`);
    }

    const resolved = resolveColumnNames(columns);
    const metadata = {
      tableName: env.SUPABASE_TABLE_2026,
      columns,
      importedAt: new Date().toISOString(),
    };
    const sourceFileId = await registerSupabaseSource(env.SUPABASE_TABLE_2026, metadata);
    importRunId = await createImportRun(sourceFileId);

    const lastSyncResult = await pool.query(
      "SELECT MAX(sale_date) as last_date FROM sales_raw WHERE source_system = 'supabase_2026'",
    );
    const lastDate = lastSyncResult.rows[0]?.last_date;
    const saleDateColumn = resolved.data!;

    let query = `SELECT * FROM public.${env.SUPABASE_TABLE_2026}`;
    const params: unknown[] = [];
    if (lastDate) {
      query += ` WHERE ${saleDateColumn} >= $1`;
      params.push(lastDate);
    }

    const result = await remotePool.query(query, params);
    const normalized = normalizeSupabaseRows(result.rows, resolved, sourceFileId, importRunId);
    const rowsInserted = await insertRawRows(normalized);
    const impactedCustomerCodes = Array.from(new Set(normalized.map((row) => row.customerCode)));

    await rebuildReadModels(impactedCustomerCodes);
    await pool.query(
      `
        UPDATE import_runs
        SET
          status = 'COMPLETED',
          rows_seen = $2,
          rows_inserted = $3,
          rows_duplicated = $4,
          finished_at = NOW()
        WHERE id = $1
      `,
      [importRunId, normalized.length, rowsInserted, normalized.length - rowsInserted],
    );

    logger.info("supabase 2026 imported", {
      tableName: env.SUPABASE_TABLE_2026,
      rowsSeen: normalized.length,
      rowsInserted,
    });

    return {
      importRunId,
      rowsSeen: normalized.length,
      rowsInserted,
      rowsDuplicated: normalized.length - rowsInserted,
      tableName: env.SUPABASE_TABLE_2026,
      columns,
    };
  } catch (error) {
    if (importRunId) {
      await pool.query(
        `
          UPDATE import_runs
          SET
            status = 'FAILED',
            errors = jsonb_build_array($2::text),
            finished_at = NOW()
          WHERE id = $1
        `,
        [importRunId, String(error)],
      );
    }
    throw error;
  } finally {
    await remotePool.end();
  }
}

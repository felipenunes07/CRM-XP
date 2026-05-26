import { pool } from "../../db/client.js";
import { ensureInventorySnapshot } from "./inventoryService.js";

/* ── Types ── */

export interface CrossSellProductItem {
  sku: string | null;
  itemDescription: string;
  totalQuantityBought: number;
  orderCount: number;
  lastBoughtAt: string | null;
  stockQuantity: number | null;
  stockModel: string | null;
}

export interface CrossSellCustomerEntry {
  customerId: string;
  customerCode: string;
  displayName: string;
  status: "ACTIVE" | "ATTENTION" | "INACTIVE";
  totalOrders: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  productsWithStock: CrossSellProductItem[];
  productsAll: CrossSellProductItem[];
}

export interface CrossSellSummary {
  totalCustomers: number;
  activeCount: number;
  attentionCount: number;
  inactiveCount: number;
  totalProductMatches: number;
}

export interface CrossSellStrategyResponse {
  summary: CrossSellSummary;
  customers: CrossSellCustomerEntry[];
  minStock: number;
  topN: number;
  generatedAt: string;
}

/* ── Helpers ── */

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

/* ── Main query ── */

export async function getCrossSellStrategy(
  minStock = 50,
  topN = 50,
): Promise<CrossSellStrategyResponse> {
  // Ensure inventory snapshot is loaded
  await ensureInventorySnapshot(false);

  // Query: For each customer, find their top purchased products (by SKU)
  // and cross-reference with the active inventory snapshot
  const result = await pool.query(
    `
      WITH active_snapshot AS (
        SELECT id FROM inventory_snapshots WHERE is_active = TRUE LIMIT 1
      ),
      customer_product_ranks AS (
        SELECT
          cs.customer_id,
          cs.customer_code,
          cs.display_name,
          cs.status,
          cs.total_orders,
          cs.total_spent,
          cs.last_purchase_at::date::text AS last_purchase_at,
          COALESCE(NULLIF(oi.sku, ''), '__desc__' || COALESCE(NULLIF(oi.item_description, ''), 'sem-descricao')) AS group_key,
          MAX(NULLIF(oi.sku, '')) AS sku,
          MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descricao')) AS item_description,
          COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS total_quantity_bought,
          COUNT(DISTINCT o.id)::int AS order_count,
          MAX(o.order_date)::date::text AS last_bought_at,
          ROW_NUMBER() OVER (
            PARTITION BY cs.customer_id
            ORDER BY COALESCE(SUM(oi.quantity), 0) DESC, COUNT(DISTINCT o.id) DESC
          ) AS rn_all
        FROM customer_snapshot cs
        JOIN orders o ON o.customer_id = cs.customer_id
        JOIN order_items oi ON oi.order_id = o.id
        WHERE cs.status IN ('ACTIVE', 'ATTENTION', 'INACTIVE')
        GROUP BY
          cs.customer_id,
          cs.customer_code,
          cs.display_name,
          cs.status,
          cs.total_orders,
          cs.total_spent,
          cs.last_purchase_at,
          COALESCE(NULLIF(oi.sku, ''), '__desc__' || COALESCE(NULLIF(oi.item_description, ''), 'sem-descricao'))
      ),
      top_products AS (
        SELECT
          cpr.*,
          isi.stock_quantity,
          isi.model AS stock_model
        FROM customer_product_ranks cpr
        LEFT JOIN active_snapshot snap ON TRUE
        LEFT JOIN inventory_snapshot_items isi
          ON isi.snapshot_id = snap.id
          AND isi.sku = cpr.sku
          AND cpr.sku IS NOT NULL
        WHERE cpr.rn_all <= $2
      )
      SELECT
        customer_id,
        customer_code,
        display_name,
        status,
        total_orders,
        total_spent,
        last_purchase_at,
        sku,
        item_description,
        total_quantity_bought,
        order_count,
        last_bought_at,
        stock_quantity,
        stock_model,
        rn_all,
        CASE WHEN stock_quantity IS NOT NULL AND stock_quantity >= $1 THEN TRUE ELSE FALSE END AS meets_stock_threshold
      FROM top_products
      ORDER BY
        CASE status
          WHEN 'ACTIVE' THEN 1
          WHEN 'ATTENTION' THEN 2
          ELSE 3
        END,
        total_spent DESC,
        customer_code,
        total_quantity_bought DESC
    `,
    [minStock, topN],
  );

  // Group results by customer
  const customerMap = new Map<string, CrossSellCustomerEntry>();

  for (const row of result.rows) {
    const customerId = String(row.customer_id);

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        customerCode: String(row.customer_code ?? ""),
        displayName: String(row.display_name ?? ""),
        status: String(row.status) as CrossSellCustomerEntry["status"],
        totalOrders: toNumber(row.total_orders),
        totalSpent: toNumber(row.total_spent),
        lastPurchaseAt: row.last_purchase_at ? String(row.last_purchase_at) : null,
        productsWithStock: [],
        productsAll: [],
      });
    }

    const customer = customerMap.get(customerId)!;

    const product: CrossSellProductItem = {
      sku: row.sku ? String(row.sku) : null,
      itemDescription: String(row.item_description ?? ""),
      totalQuantityBought: toNumber(row.total_quantity_bought),
      orderCount: toNumber(row.order_count),
      lastBoughtAt: row.last_bought_at ? String(row.last_bought_at) : null,
      stockQuantity: row.stock_quantity !== null && row.stock_quantity !== undefined
        ? toNumber(row.stock_quantity)
        : null,
      stockModel: row.stock_model ? String(row.stock_model) : null,
    };

    // Always add to "all products" list
    customer.productsAll.push(product);

    // Only add to "with stock" list if meets threshold
    if (row.meets_stock_threshold) {
      customer.productsWithStock.push(product);
    }
  }

  const customers = Array.from(customerMap.values());

  // Build summary
  const summary: CrossSellSummary = {
    totalCustomers: customers.length,
    activeCount: customers.filter((c) => c.status === "ACTIVE").length,
    attentionCount: customers.filter((c) => c.status === "ATTENTION").length,
    inactiveCount: customers.filter((c) => c.status === "INACTIVE").length,
    totalProductMatches: customers.reduce((sum, c) => sum + c.productsWithStock.length, 0),
  };

  return {
    summary,
    customers,
    minStock,
    topN,
    generatedAt: new Date().toISOString(),
  };
}

import { pool } from "../../db/client.js";
import { ensureInventorySnapshot } from "./inventoryService.js";

/* ── Types ── */

export interface SlowMovingProductItem {
  sku: string | null;
  itemDescription: string;
  totalQuantityBought: number;
  orderCount: number;
  lastBoughtAt: string | null;
  stockQuantity: number | null;
  stockModel: string | null;
  daysWithoutSales: number;
  lastSoldOverall: string | null;
}

export interface SlowMovingCustomerEntry {
  customerId: string;
  customerCode: string;
  displayName: string;
  status: "ACTIVE" | "ATTENTION" | "INACTIVE";
  totalOrders: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  productsWithStock: SlowMovingProductItem[];
  productsAll: SlowMovingProductItem[];
}

export interface SlowMovingSummary {
  totalCustomers: number;
  activeCount: number;
  attentionCount: number;
  inactiveCount: number;
  totalProductMatches: number;
}

export interface SlowMovingStrategyResponse {
  summary: SlowMovingSummary;
  customers: SlowMovingCustomerEntry[];
  minStock: number;
  daysWithoutSales: number;
  generatedAt: string;
}

/* ── Helpers ── */

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

/* ── Main Query ── */

export async function getSlowMovingStrategy(
  minStock = 1,
  daysWithoutSales = 30,
): Promise<SlowMovingStrategyResponse> {
  // Ensure active inventory snapshot is prepared
  await ensureInventorySnapshot(false);

  // SQL Query:
  // 1. Find active inventory snapshot items that satisfy stock_quantity >= minStock
  // 2. Identify the last sale date of each SKU. If never sold, treat as long overdue (9999 days).
  // 3. Filter only those items where (NOW() - last_sold_date) >= daysWithoutSales OR never sold.
  // 4. Join with orders/order_items and customer_snapshot to find which customers bought them historically.
  const result = await pool.query(
    `
      WITH active_snapshot AS (
        SELECT id FROM inventory_snapshots WHERE is_active = TRUE LIMIT 1
      ),
      slow_moving_skus AS (
        SELECT
          isi.sku,
          isi.model AS stock_model,
          isi.stock_quantity,
          MAX(o.order_date) AS last_sold_overall,
          COALESCE(EXTRACT(DAY FROM (NOW() - MAX(o.order_date)))::int, 9999) AS days_without_sales
        FROM inventory_snapshot_items isi
        JOIN active_snapshot snap ON isi.snapshot_id = snap.id
        LEFT JOIN order_items oi ON oi.sku = isi.sku
        LEFT JOIN orders o ON o.id = oi.order_id
        WHERE isi.stock_quantity >= $1
        GROUP BY isi.sku, isi.model, isi.stock_quantity
        HAVING
          MAX(o.order_date) IS NULL OR EXTRACT(DAY FROM (NOW() - MAX(o.order_date))) >= $2
      ),
      customer_slow_matches AS (
        SELECT
          cs.customer_id,
          cs.customer_code,
          cs.display_name,
          cs.status,
          cs.total_orders,
          cs.total_spent,
          cs.last_purchase_at::date::text AS last_purchase_at,
          sms.sku,
          MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descrição')) AS item_description,
          SUM(oi.quantity)::int AS total_quantity_bought,
          COUNT(DISTINCT o.id)::int AS order_count,
          MAX(o.order_date)::date::text AS last_bought_at,
          sms.stock_quantity,
          sms.stock_model,
          sms.days_without_sales,
          sms.last_sold_overall::date::text AS last_sold_overall
        FROM customer_snapshot cs
        JOIN orders o ON o.customer_id = cs.customer_id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN slow_moving_skus sms ON sms.sku = oi.sku
        WHERE cs.status IN ('ACTIVE', 'ATTENTION', 'INACTIVE')
        GROUP BY
          cs.customer_id,
          cs.customer_code,
          cs.display_name,
          cs.status,
          cs.total_orders,
          cs.total_spent,
          cs.last_purchase_at,
          sms.sku,
          sms.stock_quantity,
          sms.stock_model,
          sms.days_without_sales,
          sms.last_sold_overall
      )
      SELECT * FROM customer_slow_matches
      ORDER BY
        CASE status
          WHEN 'ACTIVE' THEN 1
          WHEN 'ATTENTION' THEN 2
          ELSE 3
        END,
        total_spent DESC,
        customer_code,
        days_without_sales DESC
    `,
    [minStock, daysWithoutSales],
  );

  // Group results by customer
  const customerMap = new Map<string, SlowMovingCustomerEntry>();

  for (const row of result.rows) {
    const customerId = String(row.customer_id);

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        customerCode: String(row.customer_code),
        displayName: String(row.display_name),
        status: row.status as "ACTIVE" | "ATTENTION" | "INACTIVE",
        totalOrders: toNumber(row.total_orders),
        totalSpent: toNumber(row.total_spent),
        lastPurchaseAt: row.last_purchase_at,
        productsWithStock: [],
        productsAll: [],
      });
    }

    const customer = customerMap.get(customerId)!;
    const productItem: SlowMovingProductItem = {
      sku: row.sku ? String(row.sku) : null,
      itemDescription: String(row.item_description),
      totalQuantityBought: toNumber(row.total_quantity_bought),
      orderCount: toNumber(row.order_count),
      lastBoughtAt: row.last_bought_at,
      stockQuantity: row.stock_quantity !== null ? toNumber(row.stock_quantity) : null,
      stockModel: row.stock_model ? String(row.stock_model) : null,
      daysWithoutSales: toNumber(row.days_without_sales),
      lastSoldOverall: row.last_sold_overall,
    };

    // For Strategy 2, productsWithStock contains the match (since they all satisfy stock threshold from CTE)
    customer.productsWithStock.push(productItem);
    customer.productsAll.push(productItem);
  }

  const customers = Array.from(customerMap.values());

  // Calculate summary statistics
  let activeCount = 0;
  let attentionCount = 0;
  let inactiveCount = 0;

  for (const c of customers) {
    if (c.status === "ACTIVE") activeCount++;
    else if (c.status === "ATTENTION") attentionCount++;
    else if (c.status === "INACTIVE") inactiveCount++;
  }

  const totalProductMatches = customers.reduce((sum, c) => sum + c.productsWithStock.length, 0);

  return {
    summary: {
      totalCustomers: customers.length,
      activeCount,
      attentionCount,
      inactiveCount,
      totalProductMatches,
    },
    customers,
    minStock,
    daysWithoutSales,
    generatedAt: new Date().toISOString(),
  };
}

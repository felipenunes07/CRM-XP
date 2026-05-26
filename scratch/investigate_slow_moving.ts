import { pool } from "../apps/api/src/db/client.js";

async function main() {
  try {
    console.log("--- Investigando SKU 1281-1 ---");
    const res = await pool.query(
      `
      SELECT 
        oi.sku, 
        oi.item_description, 
        o.id AS order_id, 
        o.order_date,
        o.total_amount
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku = '1281-1' OR oi.sku LIKE '%1281%'
      ORDER BY o.order_date DESC
      LIMIT 10;
      `
    );
    console.log("Resultados:", JSON.stringify(res.rows, null, 2));

    console.log("\n--- Investigando a query de slow moving de forma isolada para 1281-1 ---");
    const res2 = await pool.query(
      `
      SELECT
        isi.sku,
        isi.stock_quantity,
        MAX(o.order_date) AS last_sold_overall,
        COALESCE(EXTRACT(DAY FROM (NOW() - MAX(o.order_date)))::int, 9999) AS days_without_sales
      FROM inventory_snapshot_items isi
      LEFT JOIN order_items oi ON oi.sku = isi.sku
      LEFT JOIN orders o ON o.id = oi.order_id
      WHERE isi.sku = '1281-1'
      GROUP BY isi.sku, isi.stock_quantity;
      `
    );
    console.log("Query lenta isolada:", JSON.stringify(res2.rows, null, 2));
  } catch (err) {
    console.error("Erro:", err);
  } finally {
    process.exit(0);
  }
}

main();

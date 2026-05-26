import { pool } from "../apps/api/src/db/client.js";

async function main() {
  try {
    console.log("--- Estatísticas Gerais do Banco de Dados ---");
    
    const countRes = await pool.query("SELECT COUNT(*) FROM orders;");
    console.log("Total de pedidos:", countRes.rows[0].count);

    const maxDateRes = await pool.query("SELECT MAX(order_date) FROM orders;");
    console.log("Maior data de pedido (Local):", maxDateRes.rows[0].max);

    const minDateRes = await pool.query("SELECT MIN(order_date) FROM orders;");
    console.log("Menor data de pedido (Local):", minDateRes.rows[0].min);

    console.log("\n--- Top 10 SKUs com mais vendas na tabela order_items ---");
    const topSkus = await pool.query(
      `
      SELECT sku, COUNT(*) AS vendas_count
      FROM order_items
      WHERE sku IS NOT NULL AND sku != ''
      GROUP BY sku
      ORDER BY vendas_count DESC
      LIMIT 10;
      `
    );
    console.log("Top SKUs:", topSkus.rows);

    console.log("\n--- Amostra de itens com SKU LIKE 'CX%' ---");
    const cxSkus = await pool.query(
      `
      SELECT sku, item_description, COUNT(*)
      FROM order_items
      WHERE sku LIKE 'CX%'
      GROUP BY sku, item_description
      LIMIT 5;
      `
    );
    console.log("Amostra CX:", cxSkus.rows);
  } catch (err) {
    console.error("Erro:", err);
  } finally {
    process.exit(0);
  }
}

main();

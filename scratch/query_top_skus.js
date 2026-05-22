const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    
    const top30Query = `
      SELECT 
        oi.sku,
        MAX(oi.item_description) as description,
        SUM(oi.quantity) as total_quantity_bought,
        COUNT(DISTINCT o.customer_id) as unique_customers_buying,
        COUNT(DISTINCT o.id) as number_of_orders,
        MAX(isi.stock_quantity) as current_stock,
        MAX(isi.price) as unit_price
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN customer_snapshot cs ON cs.customer_id = o.customer_id
      JOIN inventory_snapshots snap ON snap.is_active = TRUE
      JOIN inventory_snapshot_items isi ON (isi.sku = oi.sku AND isi.snapshot_id = snap.id)
      WHERE cs.status IN ('ACTIVE', 'ATTENTION')
        AND oi.sku IS NOT NULL
        AND isi.stock_quantity > 0
      GROUP BY oi.sku
      ORDER BY total_quantity_bought DESC
      LIMIT 30
    `;

    console.log('Running top 30 in-stock SKUs query...');
    const result = await pool.query(top30Query);
    console.log('\n--- Top 30 SKUs bought by Active/Attention Customers ---');
    console.table(result.rows.map((row, index) => ({
      Rank: index + 1,
      SKU: row.sku,
      Descrição: row.description ? row.description.substring(0, 40) : 'N/A',
      'Qtd Comprada': parseFloat(row.total_quantity_bought),
      'Clientes Únicos': parseInt(row.unique_customers_buying),
      'Pedidos': parseInt(row.number_of_orders),
      'Estoque Atual': parseInt(row.current_stock),
      'Preço Unit': parseFloat(row.unit_price)
    })));

  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await pool.end();
  }
}

run();

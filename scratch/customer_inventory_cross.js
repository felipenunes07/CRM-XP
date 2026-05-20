const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = "postgresql://postgres:9630Jinren@localhost:5432/olist_crm?sslmode=disable";

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('--- Organizando Cruzamento de Dados por Cliente ---');
    
    const inventorySnapshot = await pool.query(`
      SELECT id FROM inventory_snapshots WHERE is_active = TRUE LIMIT 1
    `);
    
    if (inventorySnapshot.rowCount === 0) {
      console.log('Nenhum snapshot de estoque ativo encontrado.');
      return;
    }
    const snapshotId = inventorySnapshot.rows[0].id;

    const topCustomersQuery = `
      SELECT customer_id FROM customer_snapshot 
      WHERE status IN ('ACTIVE', 'ATTENTION')
      ORDER BY total_spent DESC LIMIT 100
    `;
    
    const topCustomers = await pool.query(topCustomersQuery);
    const customerIds = topCustomers.rows.map(r => r.customer_id);

    // Cruzamento organizado por cliente
    // Filtro: Compra >= 3 unid, Estoque >= 50 unid
    const crossDataQuery = `
      WITH top_items AS (
        SELECT 
          o.customer_id,
          oi.sku,
          oi.item_description,
          SUM(oi.quantity) as total_quantity
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id = ANY($1)
        AND o.order_date >= CURRENT_DATE - INTERVAL '6 months'
        AND oi.sku IS NOT NULL
        GROUP BY o.customer_id, oi.sku, oi.item_description
        HAVING SUM(oi.quantity) >= 3
      )
      SELECT 
        c.customer_code as cl,
        c.display_name as customer_name,
        ti.item_description as product_name,
        ti.sku,
        ti.total_quantity,
        COALESCE(isi.stock_quantity, 0) as stock_balance
      FROM top_items ti
      JOIN customers c ON c.id = ti.customer_id
      JOIN inventory_snapshot_items isi ON (isi.sku = ti.sku AND isi.snapshot_id = $2)
      WHERE isi.stock_quantity >= 50
      ORDER BY c.display_name ASC, ti.total_quantity DESC
    `;

    const result = await pool.query(crossDataQuery, [customerIds, snapshotId]);
    const reportData = result.rows;
    
    // Gerar CSV
    const csvHeader = 'CL,Cliente,Produto,SKU,Qtd Comprada (6m),Saldo em Estoque\n';
    const csvRows = reportData.map(row => {
      const cl = (row.cl || '').replace(/"/g, '""');
      const client = (row.customer_name || '').replace(/"/g, '""');
      const product = (row.product_name || '').replace(/"/g, '""');
      const sku = (row.sku || '').replace(/"/g, '""');
      return `"${cl}","${client}","${product}","${sku}",${row.total_quantity},${row.stock_balance}`;
    }).join('\n');
    
    const outputDir = path.join(__dirname, '..', 'artifacts');
    const filePath = path.join(outputDir, 'oportunidades_por_cliente.csv');
    fs.writeFileSync(filePath, csvContent = csvHeader + csvRows);
    console.log(`Relatório organizado por cliente exportado para: ${filePath}`);

    // Exibir amostra organizada por cliente
    console.log('\n--- Oportunidades Agrupadas por Cliente (Amostra) ---');
    console.table(reportData.slice(0, 100).map(r => ({
      CL: r.cl,
      Cliente: r.customer_name.substring(0, 25),
      Produto: r.product_name.substring(0, 30),
      'Comprado': r.total_quantity,
      'Estoque': r.stock_balance
    })));

  } catch (err) {
    console.error('Erro ao processar:', err);
  } finally {
    await pool.end();
  }
}

run();

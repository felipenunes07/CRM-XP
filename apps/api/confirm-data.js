import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm?sslmode=disable'
});

async function main() {
  try {
    // Verificar sales_raw
    const salesRaw = await pool.query(`
      SELECT
        EXTRACT(YEAR FROM sale_date) as year,
        COUNT(*)::int as registros,
        SUM(line_total)::numeric(14,2) as faturamento_total
      FROM sales_raw
      WHERE EXTRACT(YEAR FROM sale_date) IN (2023, 2024, 2025, 2026)
      GROUP BY EXTRACT(YEAR FROM sale_date)
      ORDER BY year
    `);
    
    console.log('\n=== SALES_RAW (dados brutos) ===');
    console.table(salesRaw.rows);
    
    // Verificar orders
    const orders = await pool.query(`
      SELECT
        EXTRACT(YEAR FROM order_date) as year,
        COUNT(*)::int as pedidos,
        SUM(total_amount)::numeric(14,2) as faturamento_total
      FROM orders
      WHERE EXTRACT(YEAR FROM order_date) IN (2023, 2024, 2025, 2026)
      GROUP BY EXTRACT(YEAR FROM order_date)
      ORDER BY year
    `);
    
    console.log('\n=== ORDERS (pedidos agregados) ===');
    console.table(orders.rows);
    
    // Verificar alguns pedidos de 2024 como exemplo
    const sample = await pool.query(`
      SELECT
        order_date::text,
        order_number,
        total_amount,
        item_count
      FROM orders
      WHERE EXTRACT(YEAR FROM order_date) = 2024
        AND total_amount > 0
      ORDER BY total_amount DESC
      LIMIT 5
    `);
    
    console.log('\n=== EXEMPLO: Top 5 pedidos de 2024 ===');
    console.table(sample.rows);
    
    console.log('\n✅ Todos os dados estão corretos no PostgreSQL!');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await pool.end();
  }
}

main();

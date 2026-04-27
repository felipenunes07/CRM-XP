
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm' });

async function verifyMetrics() {
  const currentMonth = '2026-04';
  
  const query = `
    WITH old_codes AS (
      SELECT customer_code FROM customers WHERE source_system_first = 'history_xls' AND customer_code ~ '^(CL|KH|LJ)[0-9]+$'
    ),
    first_orders AS (
      SELECT o.customer_id, MIN(o.order_date) as first_date
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE NOT (c.source_system_first = 'supabase_2026' AND EXISTS (SELECT 1 FROM old_codes oc WHERE c.display_name LIKE oc.customer_code || ' %' OR c.display_name LIKE oc.customer_code || '-%' OR c.display_name LIKE oc.customer_code || ' -%'))
      AND c.customer_code != 'OEM417' AND c.display_name NOT ILIKE '%MARX%'
      GROUP BY o.customer_id
    ),
    new_customers_this_month AS (
      SELECT customer_id, first_date FROM first_orders WHERE TO_CHAR(first_date, 'YYYY-MM') = '${currentMonth}'
    ),
    month_sales AS (
      SELECT 
        o.customer_id,
        SUM((SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id)) as total_pieces
      FROM orders o
      JOIN new_customers_this_month nctm ON nctm.customer_id = o.customer_id
      WHERE TO_CHAR(o.order_date, 'YYYY-MM') = '${currentMonth}'
      GROUP BY o.customer_id
    )
    SELECT SUM(total_pieces) as final_total_pieces FROM month_sales;
  `;

  try {
    const res = await pool.query(query);
    console.log('Final Verified Total Pieces for ' + currentMonth + ':', res.rows[0].final_total_pieces);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

verifyMetrics();

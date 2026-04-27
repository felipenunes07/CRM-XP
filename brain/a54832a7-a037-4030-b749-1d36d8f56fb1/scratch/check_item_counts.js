
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm' });

async function compareItemCounts() {
  try {
    // 1. Check some orders where item_count might differ from sum of quantities
    const query = `
      SELECT 
        o.id, 
        o.order_number, 
        o.item_count as orders_table_item_count,
        SUM(oi.quantity) as order_items_sum_quantity,
        COUNT(oi.id) as order_items_count_rows
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id, o.order_number, o.item_count
      HAVING o.item_count != SUM(oi.quantity) OR o.item_count != COUNT(oi.id)
      LIMIT 10;
    `;
    
    const res = await pool.query(query);
    console.log('--- COMPARISON ---');
    if (res.rows.length === 0) {
      console.log('No discrepancies found in the first 10 sampled orders with mismatches.');
    } else {
      console.log('Discrepancies found:');
      console.table(res.rows);
    }
    
    // 2. Check general sum for the current month
    const currentMonth = '2026-04';
    const queryMonth = `
      SELECT 
        SUM(item_count) as total_from_orders_table,
        (SELECT SUM(quantity) FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id WHERE TO_CHAR(o2.order_date, 'YYYY-MM') = '${currentMonth}') as total_from_order_items
      FROM orders
      WHERE TO_CHAR(order_date, 'YYYY-MM') = '${currentMonth}';
    `;
    const resMonth = await pool.query(queryMonth);
    console.log('--- MONTH TOTALS (' + currentMonth + ') ---');
    console.table(resMonth.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

compareItemCounts();

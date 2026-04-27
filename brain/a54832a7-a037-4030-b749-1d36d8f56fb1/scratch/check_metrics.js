
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: "postgresql://postgres:9630Jinren@localhost:5432/olist_crm"
});

async function checkMetrics() {
  const currentMonth = '2026-04';
  
  // 1. Current Logic: Sum of item_count of the FIRST order for customers whose first order is in 2026-04
  const query1 = `
    WITH first_orders AS (
      SELECT
        customer_id,
        MIN(order_date) as first_date
      FROM orders
      GROUP BY customer_id
    ),
    new_customers_this_month AS (
      SELECT customer_id
      FROM first_orders
      WHERE TO_CHAR(first_date, 'YYYY-MM') = '${currentMonth}'
    ),
    first_order_details AS (
      SELECT 
        o.customer_id,
        o.item_count,
        ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC) as rn
      FROM orders o
      JOIN new_customers_this_month nctm ON nctm.customer_id = o.customer_id
    )
    SELECT SUM(item_count) as total_pieces_first_order
    FROM first_order_details
    WHERE rn = 1
  `;

  // 2. All orders in the SAME month for these new customers
  const query2 = `
    WITH first_orders AS (
      SELECT
        customer_id,
        MIN(order_date) as first_date
      FROM orders
      GROUP BY customer_id
    ),
    new_customers_this_month AS (
      SELECT customer_id
      FROM first_orders
      WHERE TO_CHAR(first_date, 'YYYY-MM') = '${currentMonth}'
    )
    SELECT SUM(o.item_count) as total_pieces_all_orders_this_month
    FROM orders o
    JOIN new_customers_this_month nctm ON nctm.customer_id = o.customer_id
    WHERE TO_CHAR(o.order_date, 'YYYY-MM') = '${currentMonth}'
  `;

  try {
    const res1 = await pool.query(query1);
    const res2 = await pool.query(query2);
    
    console.log('--- METRICS FOR ' + currentMonth + ' ---');
    console.log('Total Pieces (First Order Only):', res1.rows[0].total_pieces_first_order);
    console.log('Total Pieces (All Orders in Month):', res2.rows[0].total_pieces_all_orders_this_month);
    
    if (res2.rows[0].total_pieces_all_orders_this_month > res1.rows[0].total_pieces_first_order) {
      console.log('DIFFERENCE DETECTED!');
    } else {
      console.log('No difference detected.');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkMetrics();

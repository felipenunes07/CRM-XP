
import { pool } from "../db/client.js";

async function checkGeographicData() {
  try {
    const result = await pool.query(`
      SELECT state, city, COUNT(*) as count
      FROM customer_snapshot
      WHERE state IS NOT NULL OR city IS NOT NULL
      GROUP BY state, city
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log("Geographic data in customer_snapshot:");
    console.table(result.rows);
    
    const salesResult = await pool.query(`
      SELECT
        s.state,
        COUNT(DISTINCT o.id) as orders_count,
        SUM(o.total_amount) as revenue,
        COUNT(DISTINCT s.customer_id) as customers_count
      FROM orders o
      JOIN customer_snapshot s ON s.customer_id = o.customer_id
      WHERE s.state IS NOT NULL AND s.state != ''
      GROUP BY s.state
      ORDER BY revenue DESC
    `);
    
    console.log("Sales data by state:");
    console.table(salesResult.rows);

    if (salesResult.rows.length === 0) {
      console.log("WARNING: No sales data found for any state!");
      
      const orderCount = await pool.query("SELECT COUNT(*) FROM orders");
      console.log("Total orders in database:", orderCount.rows[0].count);
      
      const unmatchedOrders = await pool.query(`
        SELECT COUNT(*) FROM orders o
        LEFT JOIN customer_snapshot s ON s.customer_id = o.customer_id
        WHERE s.customer_id IS NULL
      `);
      console.log("Orders without matching customer_snapshot:", unmatchedOrders.rows[0].count);
    }

  } catch (err: any) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

checkGeographicData();

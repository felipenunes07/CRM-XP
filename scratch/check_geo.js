
import { pool } from "../apps/api/src/db/client.js";

async function checkGeographicData() {
  try {
    const result = await pool.query(`
      SELECT state, city, COUNT(*) as count
      FROM customer_snapshot
      WHERE state IS NOT NULL OR city IS NOT NULL
      GROUP BY state, city
      ORDER BY count DESC
      LIMIT 20
    `);
    
    console.log("Geographic data in customer_snapshot:");
    console.table(result.rows);
    
    const total = await pool.query(`SELECT COUNT(*) FROM customer_snapshot`);
    console.log("Total customers in snapshot:", total.rows[0].count);
    
    const withGeo = await pool.query(`
      SELECT COUNT(*) FROM customer_snapshot 
      WHERE state IS NOT NULL AND state != ''
    `);
    console.log("Customers with state:", withGeo.rows[0].count);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

checkGeographicData();

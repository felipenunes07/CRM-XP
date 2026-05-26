import { pool } from "../src/db/client.js";

async function run() {
  try {
    const result = await pool.query(`
      SELECT *
      FROM customers
      LIMIT 3
    `);

    console.log("SAMPLE CUSTOMERS:");
    console.log(JSON.stringify(result.rows, null, 2));

  } catch (error) {
    console.error("Error querying customers:", error);
  } finally {
    await pool.end();
  }
}

run();

import { pool } from "../src/db/client.js";
import { buildWhere } from "../src/modules/crm/customerService.js";

async function run() {
  try {
    const filters = {
      status: ["INACTIVE"] as any[],
      customerCodes: ["CL1159"]
    };

    const { whereSql, params } = buildWhere(filters);

    const query = `
      SELECT
        s.customer_id,
        s.customer_code,
        s.display_name,
        s.status,
        s.state,
        s.city
      FROM customer_snapshot s
      ${whereSql}
    `;

    console.log("EXECUTING QUERY...");
    const result = await pool.query(query, params);
    console.log(`TOTAL ROWS RETURNED: ${result.rows.length}`);
    
    const cl1159Row = result.rows.find(row => row.customer_code === "CL1159");
    console.log("CL1159 ROW FOUND IN RESULTS:", cl1159Row);

  } catch (error) {
    console.error("Error executing query:", error);
  } finally {
    await pool.end();
  }
}

run();

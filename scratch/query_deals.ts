import { pool } from "../apps/api/src/db/client.js";

async function main() {
  try {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default 
       FROM information_schema.columns 
       WHERE table_name = 'deals'`
    );
    console.log("Deals table columns:");
    result.rows.forEach(col => {
      if (col.is_nullable === 'NO' && col.column_default === null) {
        console.log(`❌ Required column without default: ${col.column_name} (${col.data_type})`);
      } else {
        console.log(`  ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}, Default: ${col.column_default}`);
      }
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

main();

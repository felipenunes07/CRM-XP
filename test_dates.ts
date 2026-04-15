import { pool } from './apps/api/src/db/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / DAY_MS));
}

async function main() {
  const result = await pool.query(`
    WITH customers AS (
      SELECT
        c.id,
        (SELECT MAX(order_date) FROM orders WHERE customer_id = c.id) AS max_order_date
      FROM customers c
    )
    SELECT
      id,
      max_order_date,
      (CURRENT_DATE - max_order_date) AS sql_diff
    FROM customers
    WHERE max_order_date IS NOT NULL
  `);

  let differences = 0;
  const now = new Date();

  for (const row of result.rows) {
    // max_order_date is returned as a JS Date object by node-postgres for DATE types!
    // Wait, node-postgres parses DATE to a local Date object!
    // Ah, if node-postgres parses DATE to a local Date at midnight:
    const jsDate = row.max_order_date;
    
    // In actual code, ARRAY_AGG(o.order_date::text) is used!
    // So order date is a string "YYYY-MM-DD". Let's format it exactly like the code:
    const isoString = jsDate.toISOString().split('T')[0]; 
    const stringDate = new Date(isoString); // 'YYYY-MM-DD' parses to UTC midnight
    
    // BUT what if isoString is a day behind because node-postgres parsed local midnight, and toISOString shifts it back?
    // Let's see what the DB returns as text.
    
    const textQuery = await pool.query('SELECT order_date::text FROM orders WHERE customer_id = $1 LIMIT 1', [row.id]);
    const rawText = textQuery.rows[0].order_date; // e.g. '2026-03-16'
    
    const parsedDate = new Date(rawText);
    const tsDiff = daysBetween(now, parsedDate);

    const sqlDiff = Number(row.sql_diff);

    if (tsDiff !== sqlDiff) {
      differences++;
      if (differences <= 5) {
        console.log(`Diff on ${row.id}: Text=${rawText}, TS=${tsDiff}, SQL=${sqlDiff}, now=${now.toISOString()}, parsed=${parsedDate.toISOString()}`);
      }
    }
  }

  console.log('Total differences:', differences);
  pool.end();
}

main().catch(console.error);

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const result = await pool.query(`
    WITH old_codes AS (
      SELECT customer_code
      FROM customers
      WHERE source_system_first = 'history_xls'
        AND customer_code ~ '^(CL|KH|OEM)[0-9]+$'
    ),
    ranked_orders AS (
      SELECT
        o.customer_id AS "customerId",
        c.customer_code AS "customerCode",
        c.display_name AS "displayName",
        o.order_date::date::text AS "firstOrderDate",
        o.total_amount AS "firstOrderAmount",
        o.item_count AS "firstItemCount",
        NULLIF(o.last_attendant, '') AS "firstAttendant",
        ROW_NUMBER() OVER (
          PARTITION BY o.customer_id
          ORDER BY o.order_date ASC, o.created_at ASC, o.id ASC
        ) AS order_rank
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE NOT (
        c.source_system_first = 'supabase_2026'
        AND EXISTS (
          SELECT 1 FROM old_codes oc
          WHERE c.display_name LIKE oc.customer_code || ' %'
             OR c.display_name LIKE oc.customer_code || '-%'
             OR c.display_name LIKE oc.customer_code || ' -%'
        )
      )
    )
    SELECT
      "customerId",
      "customerCode",
      "displayName",
      "firstOrderDate",
      "firstOrderAmount",
      "firstItemCount",
      "firstAttendant"
    FROM ranked_orders
    WHERE order_rank = 1
    ORDER BY "firstOrderDate" ASC
  `);

  console.log(`Total customers: ${result.rowCount}`);

  // Check date range
  const first = result.rows[0];
  const last = result.rows[result.rowCount - 1];
  console.log(`Date range: ${first.firstOrderDate} to ${last.firstOrderDate}`);
  
  // Monthly breakdown
  const byMonth = {};
  result.rows.forEach(r => {
    const m = r.firstOrderDate.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
  });
  console.log('\n=== MONTHLY BREAKDOWN ===');
  Object.entries(byMonth).sort().forEach(([m, c]) => console.log(`  ${m}: ${c} customers`));

  // Verify no duplicates in current month
  const april2026 = result.rows.filter(r => r.firstOrderDate.startsWith('2026-04'));
  console.log(`\n=== APRIL 2026 CUSTOMERS (${april2026.length}) ===`);
  april2026.forEach(r => console.log(`  [${r.customerCode}] ${r.displayName} | ${r.firstOrderDate}`));

  const hasBad = april2026.some(r => r.displayName.includes('Zap Cell') || r.displayName.includes('MURILO'));
  console.log(`\nContains duplicates? ${hasBad ? '❌ YES' : '✅ NO'}`);

  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });

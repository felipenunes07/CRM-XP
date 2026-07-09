const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const res = await pool.query(`
    SELECT id, customer_code, display_name, normalized_name, source_system_first
    FROM customers
    ORDER BY normalized_name, customer_code
  `);

  const rows = res.rows;
  const erpDuplicates = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      const c1 = rows[i];
      const c2 = rows[j];

      const c1IsNumeric = /^\d+$/.test(c1.customer_code);
      const c2IsAlphaNumeric = /^[A-Z]+\d+$/.test(c2.customer_code);

      if (c1IsNumeric && c2IsAlphaNumeric) {
        const codeInName = c1.display_name.toUpperCase().includes(c2.customer_code.toUpperCase());
        const cleanName1 = c1.display_name.replace(new RegExp(`^${c2.customer_code}\\s*-\\s*`, 'i'), '').trim();
        const cleanName2 = c2.display_name.trim();
        const baseNameMatch = cleanName1.toLowerCase() === cleanName2.toLowerCase();

        if (codeInName && baseNameMatch) {
          erpDuplicates.push({ numeric: c1, alphanumeric: c2 });
        }
      }
    }
  }

  console.log(`Analyzing ${erpDuplicates.length} duplicate pairs for merging...\n`);

  const stats = [];
  for (const pair of erpDuplicates) {
    const num = pair.numeric;
    const alpha = pair.alphanumeric;

    // Count sales in sales_raw
    const numSales = (await pool.query(`SELECT COUNT(*) FROM sales_raw WHERE customer_code = $1`, [num.customer_code])).rows[0].count;
    const alphaSales = (await pool.query(`SELECT COUNT(*) FROM sales_raw WHERE customer_code = $1`, [alpha.customer_code])).rows[0].count;

    // Count deals
    const numDeals = (await pool.query(`SELECT COUNT(*) FROM deals WHERE customer_id = $1`, [num.id])).rows[0].count;
    const alphaDeals = (await pool.query(`SELECT COUNT(*) FROM deals WHERE customer_id = $1`, [alpha.id])).rows[0].count;

    // Count messages
    const numMsgs = (await pool.query(`SELECT COUNT(*) FROM message_logs WHERE customer_id = $1`, [num.id])).rows[0].count;
    const alphaMsgs = (await pool.query(`SELECT COUNT(*) FROM message_logs WHERE customer_id = $1`, [alpha.id])).rows[0].count;

    // Count labels
    const numLabels = (await pool.query(`SELECT COUNT(*) FROM customer_label_assignments WHERE customer_id = $1`, [num.id])).rows[0].count;
    const alphaLabels = (await pool.query(`SELECT COUNT(*) FROM customer_label_assignments WHERE customer_id = $1`, [alpha.id])).rows[0].count;

    stats.push({
      client: cleanClientName(num.display_name),
      num_code: num.customer_code,
      alpha_code: alpha.customer_code,
      sales: `${alphaSales} -> ${numSales}`,
      deals: `${alphaDeals} -> ${numDeals}`,
      msgs: `${alphaMsgs} -> ${numMsgs}`,
      labels: `${alphaLabels} -> ${numLabels}`
    });
  }

  console.table(stats);
  await pool.end();
}

function cleanClientName(name) {
  return name.replace(/^[A-Z0-9]+\s*-\s*/i, '').trim();
}

run().catch(console.error);

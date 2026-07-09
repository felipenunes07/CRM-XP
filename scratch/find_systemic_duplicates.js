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

      // We want c1 to have a numeric code (typically the database ID or internal Tiny ERP/Omie code)
      const c1IsNumeric = /^\d+$/.test(c1.customer_code);
      // We want c2 to have an alphanumeric code like CL010, CL005, etc.
      const c2IsAlphaNumeric = /^[A-Z]+\d+$/.test(c2.customer_code);

      if (c1IsNumeric && c2IsAlphaNumeric) {
        // Now check if they are the same client
        // E.g., display_name of c1 is "CL010 - W2A" (contains c2's code "CL010")
        // and display_name of c2 is "W2A" (base name matches "W2A")
        // Or if c1's display name matches c2's display name plus prefix/suffix.
        const codeInName = c1.display_name.toUpperCase().includes(c2.customer_code.toUpperCase());
        
        // Clean display name of c1 (e.g., "CL010 - W2A" -> "W2A")
        const cleanName1 = c1.display_name.replace(new RegExp(`^${c2.customer_code}\\s*-\\s*`, 'i'), '').trim();
        const cleanName2 = c2.display_name.trim();
        const baseNameMatch = cleanName1.toLowerCase() === cleanName2.toLowerCase();

        if (codeInName && baseNameMatch) {
          erpDuplicates.push({
            c1_code: c1.customer_code,
            c1_name: c1.display_name,
            c1_source: c1.source_system_first,
            c2_code: c2.customer_code,
            c2_name: c2.display_name,
            c2_source: c2.source_system_first
          });
        }
      }
    }
  }

  console.log(`\n=== FOUND ${erpDuplicates.length} ERP DUPLICATE PAIRS ===`);
  erpDuplicates.forEach((d, idx) => {
    console.log(`${idx + 1}. Numeric Client [Code: ${d.c1_code} | Name: "${d.c1_name}" (Source: ${d.c1_source})] <---> Alphanumeric Client [Code: ${d.c2_code} | Name: "${d.c2_name}" (Source: ${d.c2_source})]`);
  });

  await pool.end();
}

run().catch(console.error);

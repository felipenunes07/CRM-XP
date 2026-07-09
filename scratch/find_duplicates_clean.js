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

  console.log(`Total customers loaded: ${res.rows.length}`);

  const rows = res.rows;
  const duplicates = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const c1 = rows[i];
      const c2 = rows[j];

      // Exact name match or one code referenced in the other's display name,
      // or base name matching.
      const nameClean1 = c1.normalized_name.replace(/^(cl|kh|lj)\d+\s*-\s*/, '').trim();
      const nameClean2 = c2.normalized_name.replace(/^(cl|kh|lj)\d+\s*-\s*/, '').trim();

      const exactNameMatch = c1.normalized_name === c2.normalized_name;
      const baseNameMatch = nameClean1 === nameClean2 && nameClean1.length > 2;

      // Or if the names are very similar, e.g., one contains the other
      const c1InC2 = c2.normalized_name.includes(c1.normalized_name) && c1.normalized_name.length > 3;
      const c2InC1 = c1.normalized_name.includes(c2.normalized_name) && c2.normalized_name.length > 3;

      const codeInName1 = c1.display_name.toLowerCase().includes(c2.customer_code.toLowerCase());
      const codeInName2 = c2.display_name.toLowerCase().includes(c1.customer_code.toLowerCase());

      if (exactNameMatch || baseNameMatch || c1InC2 || c2InC1 || codeInName1 || codeInName2) {
        duplicates.push({
          c1_code: c1.customer_code,
          c1_name: c1.display_name,
          c1_source: c1.source_system_first,
          c2_code: c2.customer_code,
          c2_name: c2.display_name,
          c2_source: c2.source_system_first,
          reason: exactNameMatch 
            ? 'Exact normalized name' 
            : (baseNameMatch ? 'Same base name' : (c1InC2 || c2InC1 ? 'Substring name' : 'Code in name'))
        });
      }
    }
  }

  console.log(`\nFound ${duplicates.length} duplicate pairs.`);
  duplicates.forEach((d, idx) => {
    console.log(`${idx + 1}. [${d.c1_source}] Code: ${d.c1_code} | Name: "${d.c1_name}" <---> [${d.c2_source}] Code: ${d.c2_code} | Name: "${d.c2_name}" (${d.reason})`);
  });

  await pool.end();
}

run().catch(console.error);

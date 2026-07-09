const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  // Query all customers to analyze duplication patterns
  const res = await pool.query(`
    SELECT id, customer_code, display_name, normalized_name, source_system_first
    FROM customers
    ORDER BY normalized_name, customer_code
  `);

  console.log(`Total customers loaded: ${res.rows.length}`);

  // Let's find duplicates based on normalized_name similarities
  // or containing "CL" code and a numeric code.
  const duplicates = [];
  const rows = res.rows;

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const c1 = rows[i];
      const c2 = rows[j];

      // Exact normalized name match
      const exactNameMatch = c1.normalized_name === c2.normalized_name;

      // Substring/prefix/suffix match in names (e.g. "cl010 - w2a" vs "w2a")
      const cleaned1 = c1.normalized_name.replace(/^cl\d+\s*-\s*/, '').trim();
      const cleaned2 = c2.normalized_name.replace(/^cl\d+\s*-\s*/, '').trim();

      const nameMatchCleaned = cleaned1 === cleaned2 && cleaned1.length > 2;

      // Or if one customer code is contained in the other's display name
      const codeInName1 = c1.display_name.toLowerCase().includes(c2.customer_code.toLowerCase());
      const codeInName2 = c2.display_name.toLowerCase().includes(c1.customer_code.toLowerCase());

      if (exactNameMatch || nameMatchCleaned || codeInName1 || codeInName2) {
        duplicates.push({
          c1: { code: c1.customer_code, name: c1.display_name, source: c1.source_system_first },
          c2: { code: c2.customer_code, name: c2.display_name, source: c2.source_system_first },
          reason: exactNameMatch 
            ? 'Exact normalized name' 
            : (nameMatchCleaned ? 'Same base name (removing CL prefix)' : 'Code in other name')
        });
      }
    }
  }

  console.log(`\n=== POTENTIAL DUPLICATES FOUND: ${duplicates.length} ===`);
  console.table(duplicates.slice(0, 50).map(d => ({
    'Client 1 Code': d.c1.code,
    'Client 1 Name': d.c1.name,
    'Client 1 Source': d.c1.source,
    'Client 2 Code': d.c2.code,
    'Client 2 Name': d.c2.name,
    'Client 2 Source': d.c2.source,
    'Reason': d.reason
  })));

  await pool.end();
}

run().catch(console.error);

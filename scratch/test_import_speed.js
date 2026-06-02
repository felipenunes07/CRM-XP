const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Exists" : "Missing");
  console.log("WHATSAPP_GROUPS_SHEET_CSV_URL:", process.env.WHATSAPP_GROUPS_SHEET_CSV_URL);

  const csvUrl = process.env.WHATSAPP_GROUPS_SHEET_CSV_URL;
  if (!csvUrl) {
    console.error("Missing WHATSAPP_GROUPS_SHEET_CSV_URL");
    pool.end();
    return;
  }

  console.log("Fetching CSV...");
  const t0 = Date.now();
  const response = await fetch(csvUrl);
  console.log(`Fetch took ${Date.now() - t0}ms, status: ${response.status}`);
  if (!response.ok) {
    console.error("Fetch failed");
    pool.end();
    return;
  }

  const csvText = await response.text();
  console.log(`CSV size: ${csvText.length} bytes`);
  
  // Minimal csv parser matching whatsappGroupService.ts
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  console.log(`Total CSV lines: ${lines.length}`);
  
  pool.end();
}

run().catch(console.error);

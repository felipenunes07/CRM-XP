const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");
  const res = await pool.query(`
    SELECT 
      LOWER(REGEXP_REPLACE('XP AMANDA', '^xp\\s+', '', 'i')) as reg1,
      LOWER(REGEXP_REPLACE('xp amanda', '^xp\\s+', '', 'i')) as reg2,
      LOWER(REGEXP_REPLACE('XP  AMANDA', '^xp\\s+', '', 'i')) as reg3,
      LOWER(REGEXP_REPLACE('Amanda', '^xp\\s+', '', 'i')) as reg4,
      LOWER(REGEXP_REPLACE('XP-AMANDA', '^xp[-_\\s]+', '', 'i')) as reg5,
      LOWER(REGEXP_REPLACE('XP AMANDA', '^xp[-_\\s]+', '', 'i')) as reg6
  `);
  console.table(res.rows);
  pool.end();
}

run().catch(console.error);

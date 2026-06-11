const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/olist_crm'
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables in olist_crm:', res.rows.map(r => r.table_name));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

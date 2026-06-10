const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.gxvxgpwdgkeskttasrfz:9630Jinren%24@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    console.log('Tables on Supabase:');
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

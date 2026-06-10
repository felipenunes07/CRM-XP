const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.gxvxgpwdgkeskttasrfz:9630Jinren%24@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    const res = await pool.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('Supabase databases:', res.rows.map(r => r.datname));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

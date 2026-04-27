const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm' });

pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
  .then(res => {
    console.log('--- TABLES ---');
    console.log(res.rows.map(r => r.table_name));
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });

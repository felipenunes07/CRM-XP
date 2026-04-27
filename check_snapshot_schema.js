const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:9630Jinren@localhost:5432/olist_crm?sslmode=disable' });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customer_snapshot'")
  .then(res => {
    console.log('--- CUSTOMER_SNAPSHOT ---');
    console.log(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });

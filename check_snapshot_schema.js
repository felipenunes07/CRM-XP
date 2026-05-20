require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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

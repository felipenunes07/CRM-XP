require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers'")
  .then(res => {
    console.log('--- CUSTOMERS ---');
    console.log(res.rows);
    return pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders'");
  })
  .then(res => {
    console.log('--- ORDERS ---');
    console.log(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });

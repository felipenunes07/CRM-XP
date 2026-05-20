require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'deals'")
  .then(res => {
    console.log('--- DEALS ---');
    console.log(res.rows);
    return pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'deal_activities'");
  })
  .then(res => {
    console.log('--- DEAL_ACTIVITIES ---');
    console.log(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });

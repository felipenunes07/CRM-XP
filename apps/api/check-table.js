const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

pool.query(`
  SELECT column_name, data_type, is_nullable, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'message_events' 
  ORDER BY ordinal_position
`)
.then(r => {
  console.log('Colunas da tabela message_events:');
  console.log(JSON.stringify(r.rows, null, 2));
  
  return pool.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'message_events'
  `);
})
.then(r => {
  console.log('\nÍndices da tabela message_events:');
  console.log(JSON.stringify(r.rows, null, 2));
  pool.end();
})
.catch(e => {
  console.error('Erro:', e);
  pool.end();
  process.exit(1);
});

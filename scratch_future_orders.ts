import { pool } from './apps/api/src/db/client.js';

async function main() {
  const result = await pool.query('SELECT COUNT(*) FROM orders WHERE order_date > CURRENT_DATE');
  console.log('Future orders:', result.rows);
  pool.end();
}

main();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/olist_crm'
});

async function run() {
  try {
    const statusRes = await pool.query('SELECT DISTINCT status FROM orders');
    console.log('Order Statuses:', statusRes.rows.map(r => r.status));
    
    const sourceRes = await pool.query('SELECT DISTINCT source_system FROM orders');
    console.log('Source Systems:', sourceRes.rows.map(r => r.source_system));

    const sampleRes = await pool.query(`
      SELECT o.id, o.order_number, o.status, o.source_system, o.total_amount,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      LIMIT 3
    `);
    console.log('Sample Orders:', sampleRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();

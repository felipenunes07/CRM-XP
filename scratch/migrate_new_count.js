import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await pool.query('ALTER TABLE dashboard_daily_metrics ADD COLUMN IF NOT EXISTS new_count INT DEFAULT 0');
    console.log('Column new_count added successfully');
  } catch (error) {
    console.error('Error adding column:', error);
  } finally {
    await pool.end();
  }
}

migrate();

import { pool } from './apps/api/src/db/client.js';

async function main() {
  const result = await pool.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
  console.log('Tables:', result.rows.map(r => r.tablename));
  await pool.end();
}

main().catch(console.error);

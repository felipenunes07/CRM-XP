import { refreshAllSnapshots } from './apps/api/src/modules/analytics/analyticsService.js';
import { pool } from './apps/api/src/db/client.js';

async function main() {
  console.log('Running recalculation...');
  await refreshAllSnapshots();
  console.log('Done recalculating.');
  await pool.end();
}

main().catch(console.error);

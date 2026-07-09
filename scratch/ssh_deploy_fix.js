const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const localFilePath = path.join(__dirname, '..', 'apps', 'api', 'src', 'modules', 'analytics', 'analyticsService.ts');
const localFileContent = fs.readFileSync(localFilePath, 'utf8');

const remoteScriptContent = `
import { refreshAllSnapshots, refreshDashboardDailyMetrics } from "./apps/api/src/modules/analytics/analyticsService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== REBUILDING ALL CUSTOMER SNAPSHOTS ===");
  await refreshAllSnapshots();
  console.log("All snapshots refreshed successfully.");

  console.log("\\n=== RECALCULATING DAILY METRICS (180 DAYS) ===");
  await pool.query("DELETE FROM dashboard_daily_metrics WHERE day >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 180");
  await refreshDashboardDailyMetrics(180);
  console.log("Daily metrics recalculated successfully!");

  await pool.end();
}

run().catch(console.error);
`;

const cacheScriptContent = `
import { clearDashboardCache } from "./apps/api/src/modules/crm/dashboardService.js";
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  console.log("=== CLEARING REDIS CACHE FOR DASHBOARD ===");
  await clearDashboardCache();
  console.log("Redis cache cleared successfully.");
  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connected. Uploading files...');
  
  const base64Service = Buffer.from(localFileContent).toString('base64');
  const base64Rebuild = Buffer.from(remoteScriptContent).toString('base64');
  const base64Cache = Buffer.from(cacheScriptContent).toString('base64');
  
  conn.exec(`
    echo "${base64Service}" | base64 -d > /tmp/analyticsService.ts
    echo "${base64Rebuild}" | base64 -d > /tmp/rebuild_all_snapshots.ts
    echo "${base64Cache}" | base64 -d > /tmp/clear_cache.ts
  `, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      console.log('Files written to VPS /tmp.');
      
      const cmd = `
        CONTAINER_ID=$(docker ps --filter name=xpcrm_crm-backend -q)
        echo "Found active container ID: \$CONTAINER_ID"
        
        echo "Copying analyticsService.ts to container..."
        docker cp /tmp/analyticsService.ts \$CONTAINER_ID:/app/apps/api/src/modules/analytics/analyticsService.ts
        
        echo "Compiling backend..."
        docker exec \$CONTAINER_ID npm run build:legacy-api
        
        echo "Copying scripts to container..."
        docker cp /tmp/rebuild_all_snapshots.ts \$CONTAINER_ID:/app/rebuild_all_snapshots.ts
        docker cp /tmp/clear_cache.ts \$CONTAINER_ID:/app/clear_cache.ts
        
        echo "Running rebuild_all_snapshots.ts..."
        docker exec \$CONTAINER_ID npx tsx rebuild_all_snapshots.ts
        
        echo "Running clear_cache.ts..."
        docker exec \$CONTAINER_ID npx tsx clear_cache.ts
        
        echo "Cleaning up files..."
        docker exec \$CONTAINER_ID rm /app/rebuild_all_snapshots.ts /app/clear_cache.ts
        rm /tmp/analyticsService.ts /tmp/rebuild_all_snapshots.ts /tmp/clear_cache.ts
        echo "DEPLOY AND REBUILD COMPLETE!"
      `;
      
      console.log('Running deploy and rebuild commands on VPS...');
      conn.exec(cmd, (err2, stream2) => {
        if (err2) throw err2;
        let out = '';
        stream2.on('close', () => {
          console.log(out);
          conn.end();
        }).on('data', d => out += d).stderr.on('data', d => console.error(d.toString()));
      });
    });
  });
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});

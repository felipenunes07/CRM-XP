const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

const pool = new Pool({ 
  connectionString: connectionString,
  ssl: connectionString.includes('supabase.com') ? { rejectUnauthorized: false } : undefined
});

async function run() {
  try {
    console.log("Connecting to Supabase Database:", connectionString.replace(/:[^:@]+@/, ':***@'));
    
    // 1. Run 20260609_campaign_stats_cache.sql
    console.log("Applying 20260609_campaign_stats_cache.sql...");
    const cacheSqlPath = path.resolve(__dirname, '../../supabase/migrations/20260609_campaign_stats_cache.sql');
    const cacheSql = fs.readFileSync(cacheSqlPath, 'utf8');
    await pool.query(cacheSql);
    console.log("Successfully applied cache schema to Supabase!");

    // 2. Run 20260609_optimize_campaigns_performance.sql
    console.log("Applying 20260609_optimize_campaigns_performance.sql...");
    const perfSqlPath = path.resolve(__dirname, '../../supabase/migrations/20260609_optimize_campaigns_performance.sql');
    const perfSql = fs.readFileSync(perfSqlPath, 'utf8');
    await pool.query(perfSql);
    console.log("Successfully applied performance indexes to Supabase!");

    // 3. Mark the migration as executed in the migrations table of Supabase
    // Let's check the current version in Supabase first
    const migrationsTableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migrations'
      );
    `);
    
    if (migrationsTableResult.rows[0].exists) {
      const currentVersionResult = await pool.query("SELECT MAX(version) as version FROM migrations");
      const currentVersion = currentVersionResult.rows[0]?.version ?? 0;
      console.log("Current Supabase migration version:", currentVersion);
      
      // If version is 38, insert version 39 so the server startup won't try to run it again
      if (currentVersion === 38) {
        await pool.query("INSERT INTO migrations (version) VALUES (39)");
        console.log("Marked migration 39 as executed in Supabase migrations table!");
      }
    }

    console.log("Supabase migrations applied successfully!");
  } catch (err) {
    console.error("Error applying migrations to Supabase:", err);
  } finally {
    await pool.end();
  }
}

run();

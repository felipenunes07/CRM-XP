import { pool } from "../apps/api/src/db/client.ts";
import { migrations } from "../apps/api/src/db/migrations.ts";

async function run() {
  console.log("Checking database migrations directly...");
  
  // Basic migration table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      version INTEGER NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query("SELECT MAX(version) as version FROM migrations");
  const currentVersion = rows[0]?.version ?? 0;
  
  console.log(`Current database version: ${currentVersion}`);
  console.log(`Total migrations in code: ${migrations.length}`);

  for (let i = currentVersion; i < migrations.length; i++) {
    const version = i + 1;
    const sql = migrations[i];
    
    console.log(`Executing migration ${version}...`);
    
    try {
      await pool.query("BEGIN");
      await pool.query(sql as string);
      await pool.query("INSERT INTO migrations (version) VALUES ($1)", [version]);
      await pool.query("COMMIT");
      console.log(`Migration ${version} executed successfully!`);
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error(`Migration ${version} failed:`, error);
      throw error;
    }
  }

  console.log("All migrations are up to date!");
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Failed to run migrations:", error);
    await pool.end();
    process.exit(1);
  });

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log("Connecting to DB...");

  // 1. Get all users
  const users = await pool.query("SELECT id, name, email, role FROM users");
  console.log("\n--- USERS ---");
  console.table(users.rows);

  // 2. Get all whatsapp_instances
  const instances = await pool.query("SELECT id, instance_name, assigned_user_id, assigned_user_name, display_label, phone_number FROM whatsapp_instances");
  console.log("\n--- INSTANCES ---");
  console.table(instances.rows);

  // 3. Find any deal_activities where actor_name is not null
  const actorNames = await pool.query(`
    SELECT actor_name, COUNT(*) as count
    FROM deal_activities
    WHERE actor_name IS NOT NULL
    GROUP BY actor_name
    ORDER BY count DESC
  `);
  console.log("\n--- ACTOR NAMES IN ACTIVITIES ---");
  console.table(actorNames.rows);

  pool.end();
}

run().catch(console.error);

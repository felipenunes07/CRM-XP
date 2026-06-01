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
  for (const row of users.rows) {
    console.log(`ID: ${row.id} | Name: ${row.name} | Email: ${row.email} | Role: ${row.role}`);
  }

  // 2. Get all whatsapp_instances
  const instances = await pool.query("SELECT id, instance_name, assigned_user_id, assigned_user_name, display_label, phone_number FROM whatsapp_instances");
  console.log("\n--- INSTANCES ---");
  for (const row of instances.rows) {
    console.log(`ID: ${row.id} | Instance: ${row.instance_name} | AssignedUserID: ${row.assigned_user_id} | AssignedUserName: ${row.assigned_user_name} | DisplayLabel: ${row.display_label} | Phone: ${row.phone_number}`);
  }

  pool.end();
}

run().catch(console.error);

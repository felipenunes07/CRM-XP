// Local-only fixture server: real CRM routes, isolated PostgreSQL, no workers or messages.
import { pool } from "../apps/api/src/db/client.js";
import { createApp } from "../apps/api/src/app.js";
import { returnWorkflowMigration } from "../apps/api/src/db/returnWorkflowMigration.js";

const url=new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1","localhost"].includes(url.hostname) || url.pathname!=="/crm_returns_test") throw Error("Preview requires the isolated local crm_returns_test database");
await pool.query(`CREATE TABLE IF NOT EXISTS profiles(id uuid PRIMARY KEY,email text,full_name text,role text,is_active boolean);
  CREATE TABLE IF NOT EXISTS customers(id uuid PRIMARY KEY,customer_code text,display_name text);
  CREATE TABLE IF NOT EXISTS user_permissions(user_id uuid,permission_key text,allowed boolean);
  CREATE TABLE IF NOT EXISTS permissions(key text PRIMARY KEY,name text,description text);
  CREATE TABLE IF NOT EXISTS role_permissions(role text,permission_key text,PRIMARY KEY(role,permission_key));
  INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','admin@test.invalid','Administrador Local','admin',true),
    ('10000000-0000-4000-8000-000000000001','isis@test.invalid','Isis','operacional',true),
    ('10000000-0000-4000-8000-000000000002','triagem@test.invalid','Técnico de demonstração','operacional',true)
    ON CONFLICT(id) DO NOTHING;
  INSERT INTO customers VALUES('20000000-0000-4000-8000-000000000001','CL-TESTE','Cliente de demonstração') ON CONFLICT(id) DO NOTHING;`);
if (!(await pool.query("SELECT to_regclass('public.return_cases') AS name")).rows[0].name) await pool.query(returnWorkflowMigration);
const server=createApp().listen(15439,"127.0.0.1",()=>console.log("Returns preview API: http://127.0.0.1:15439 (isolated test database)"));
process.on("SIGINT",()=>server.close(()=>{void pool.end().then(()=>process.exit(0));}));

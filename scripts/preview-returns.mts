// Local-only fixture server: real CRM routes, isolated PostgreSQL, no workers or messages.
import { createHash } from 'node:crypto';
import { returnWorkflowMigration } from "../apps/api/src/db/returnWorkflowMigration.js";
import { returnExecutionMigration } from "../apps/api/src/db/returnExecutionMigration.js";
import {returnFactoryMigration} from '../apps/api/src/db/returnFactoryMigration.js';
import {returnNativeMigration} from '../apps/api/src/db/returnNativeMigration.js';

const url=new URL(process.env.DATABASE_URL ?? "");
if (!["127.0.0.1","localhost"].includes(url.hostname) || url.pathname!=="/crm_returns_test") throw Error("Preview requires the isolated local crm_returns_test database");
// A schema per migration definition keeps the fixture repeatable during development without deleting earlier fixtures.
const schema='returns_preview_'+createHash('sha256').update(returnWorkflowMigration+returnExecutionMigration+returnFactoryMigration+returnNativeMigration).digest('hex').slice(0,12);
url.searchParams.set('options','-c search_path='+schema);
process.env.DATABASE_URL=url.toString();
const {pool}=await import('../apps/api/src/db/client.js');
const {createApp}=await import('../apps/api/src/app.js');
await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
await pool.query(`CREATE TABLE IF NOT EXISTS profiles(id uuid PRIMARY KEY,email text,full_name text,role text,is_active boolean);
  CREATE TABLE IF NOT EXISTS customers(id uuid PRIMARY KEY,customer_code text,display_name text);
  CREATE TABLE IF NOT EXISTS user_permissions(user_id uuid,permission_key text,allowed boolean);
  CREATE TABLE IF NOT EXISTS permissions(key text PRIMARY KEY,name text,description text);
  CREATE TABLE IF NOT EXISTS role_permissions(role text,permission_key text,PRIMARY KEY(role,permission_key));
  CREATE TABLE IF NOT EXISTS whatsapp_instances(id uuid PRIMARY KEY,display_label text,phone_number text,status text,is_default boolean,assigned_user_id uuid,provider text,instance_name text,evolution_base_url text,evolution_api_key text,uazapi_base_url text,uazapi_token text);
  CREATE TABLE IF NOT EXISTS customer_credit_snapshots(id uuid PRIMARY KEY,is_active boolean);
  CREATE TABLE IF NOT EXISTS customer_credit_payment_entries(snapshot_id uuid,customer_id uuid,payment_key text,amount numeric,payment_number text,payment_type text);
  INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','admin@test.invalid','Administrador Local','admin',true),
    ('10000000-0000-4000-8000-000000000001','isis@test.invalid','Isis','operacional',true),
    ('10000000-0000-4000-8000-000000000002','triagem@test.invalid','Técnico de demonstração','operacional',true)
    ON CONFLICT(id) DO NOTHING;
  INSERT INTO customers VALUES('20000000-0000-4000-8000-000000000001','CL-TESTE','Cliente de demonstração'),
    ('20000000-0000-4000-8000-000000000002','CL-TESTE-2','Segundo cliente de demonstração') ON CONFLICT(id) DO NOTHING;`);
if (!(await pool.query("SELECT to_regclass('return_cases') AS name")).rows[0].name) await pool.query(returnWorkflowMigration);
if (!(await pool.query("SELECT to_regclass('return_factory_batches') AS name")).rows[0].name) await pool.query(returnExecutionMigration);
if (!(await pool.query("SELECT to_regclass('return_factory_profiles') AS name")).rows[0].name) await pool.query(returnFactoryMigration);
if (!(await pool.query("SELECT to_regclass('return_wallet_entries') AS name")).rows[0].name) await pool.query(returnNativeMigration);
if(!(await pool.query('SELECT id FROM return_legacy_revisions LIMIT 1')).rowCount){
 const revision=(await pool.query("INSERT INTO return_legacy_revisions(source_path,source_file_id,source_revision,source_hash,source_modified_at,row_count,active) VALUES('/TESTE-LOCAL.xlsx','test-local','local-preview','hash-local',NOW(),1,true) RETURNING id")).rows[0];
 await pool.query("INSERT INTO return_legacy_rows(revision_id,sheet,row_number,fingerprint,anchor,occurrence,document,customer_code,customer_name,occurred_on,sku,description,signed_quantity,amount_cents,raw_status,raw_payload) VALUES($1,'DEFEITOS',2,'preview-fingerprint','preview-anchor',1,'DEF-TESTE-LOCAL','CL-TESTE','Cliente de demonstração','2026-11-17','CX156-1','Tela de teste',-1,-5000,'EM ANALISE','{}')",[revision.id]);
}
await pool.query("INSERT INTO whatsapp_instances(id,display_label,phone_number,status,is_default,provider,instance_name,evolution_base_url,evolution_api_key) VALUES('30000000-0000-4000-8000-000000000001','TESTE LOCAL — NÃO ENVIAR','5500000000000','ACTIVE',true,'EVOLUTION','TEST-LOCAL','https://provider.invalid','invalid') ON CONFLICT DO NOTHING");
const port=Number(process.env.RETURN_PREVIEW_PORT??15439);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local preview port');
const server=createApp().listen(port,"127.0.0.1",()=>console.log(`Returns preview API: http://127.0.0.1:${port} (isolated test database)`));
process.on("SIGINT",()=>server.close(()=>{void pool.end().then(()=>process.exit(0));}));

const pkg = require("pg");
const { Pool } = pkg;
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Carrega o DATABASE_URL do arquivo .env
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERRO: DATABASE_URL não encontrado no .env");
  process.exit(1);
}

const pool = new Pool({ connectionString });

const migrationFiles = [
  "202604030001_base_schema.sql",
  "202604030002_rpc_functions.sql",
  "202604030003_customer_rpcs.sql",
  "202604030004_read_models.sql"
];

async function run() {
  try {
    console.log(`Conectando ao banco de dados: ${connectionString.split("@")[1].split("/")[0]}`);
    
    // Preparação para ambiente local (Não-Supabase)
    console.log("Preparando schemas e extensões...");
    await pool.query("CREATE SCHEMA IF NOT EXISTS auth;");
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    
    console.log("Criando roles compatíveis...");
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        instance_id uuid,
        email text UNIQUE,
        encrypted_password text,
        email_confirmed_at timestamptz,
        raw_user_meta_data jsonb,
        raw_app_meta_data jsonb,
        aud text,
        role text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);

    for (const file of migrationFiles) {
      console.log(`Aplicando migração local: ${file}`);
      const sql = fs.readFileSync(path.join("supabase", "migrations", file), "utf8");
      await pool.query(sql);
      console.log(`Sucesso: ${file}`);
    }

    console.log("Criando Usuário Administrador Local...");
    const adminEmail = "admin@olist-crm.com.br";
    const adminPass = "OlistCrm2026#Admin";
    const adminName = "Administrador";
    const user_id = "00000000-0000-0000-0000-000000000001";
    
    const insertUserSql = `
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at, 
        raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at
      )
      VALUES (
        '${user_id}', '00000000-0000-0000-0000-000000000000', '${adminEmail}', crypt('${adminPass}', gen_salt('bf')), now(),
        '{"name": "${adminName}", "role": "ADMIN"}'::jsonb, '{"provider": "email", "providers": ["email"]}'::jsonb, 'authenticated', 'authenticated', now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_password = EXCLUDED.encrypted_password,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data;
    `;
    
    await pool.query(insertUserSql);
    console.log(`[LOCAL] Usuário admin ${adminEmail} configurado.`);

  } catch (err) {
    console.error("Erro na migração local:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

const pkg = require("pg");
const { Client } = pkg;
const fs = require("fs");
const path = require("path");

async function setup() {
  const adminClient = new Client({
    connectionString: "postgresql://postgres:postgres@localhost:5432/postgres"
  });

  try {
    await adminClient.connect();
    console.log("--------------------------------------------------");
    console.log("🚀 INICIANDO SETUP DO BANCO DE DADOS LOCAL...");
    console.log("--------------------------------------------------");

    // 1. Criar Banco de Dados
    const dbRes = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'olist_crm'");
    if (dbRes.rowCount === 0) {
      await adminClient.query("CREATE DATABASE olist_crm");
      console.log("✅ Banco 'olist_crm' criado.");
    } else {
      console.log("ℹ️ Banco 'olist_crm' já existe.");
    }
    await adminClient.end();

    // 2. Conectar no novo banco para aplicar roles e migrations
    const client = new Client({
      connectionString: "postgresql://postgres:postgres@localhost:5432/olist_crm"
    });
    await client.connect();

    // 3. Criar Schema Auth e Roles (Compatibilidade Supabase)
    console.log("🛠️ Configurando schemas e funções de compatibilidade...");
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE,
        encrypted_password text,
        email_confirmed_at timestamptz DEFAULT now(),
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    // 4. Aplicar Migrações SQL
    const migrationsDir = path.join(__dirname, "../supabase/migrations");
    const migrationFiles = [
      "202604030001_base_schema.sql",
      "202604030002_user_management.sql",
      "202604030003_rpc_functions.sql",
      "202604030004_read_models.sql"
    ];

    console.log("📄 Aplicando migrações SQL...");
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`   - Executando ${file}...`);
        const sql = fs.readFileSync(filePath, "utf8");
        await client.query(sql);
      }
    }

    // 5. Garantir Usuário Admin
    console.log("👤 Configurando usuário administrador...");
    await client.query(`
      INSERT INTO auth.users (id, email, encrypted_password)
      VALUES (
        '00000000-0000-0000-0000-000000000001', 
        'admin@olist-crm.com.br', 
        crypt('OlistCrm2026#Admin', gen_salt('bf'))
      )
      ON CONFLICT (email) DO NOTHING;

      INSERT INTO public.profiles (id, email, role, name)
      VALUES (
        '00000000-0000-0000-0000-000000000001', 
        'admin@olist-crm.com.br', 
        'ADMIN', 
        'Administrador Local'
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log("--------------------------------------------------");
    console.log("✔️ SETUP CONCLUÍDO COM SUCESSO!");
    console.log("--------------------------------------------------");
    console.log("Próximos passos:");
    console.log("1. npm run import:history  (Para importar dados do Excel)");
    console.log("2. npm run dev             (Para iniciar a aplicação)");
    console.log("--------------------------------------------------");

    await client.end();
  } catch (err) {
    console.error("❌ ERRO NO SETUP:", err);
    process.exit(1);
  }
}

setup();

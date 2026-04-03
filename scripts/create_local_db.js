const pkg = require("pg");
const { Client } = pkg;

async function createDb() {
  // Conecta ao banco padrão 'postgres' para criar o novo banco
  const client = new Client({
    connectionString: "postgresql://postgres:postgres@localhost:5432/postgres"
  });

  try {
    await client.connect();
    console.log("Conectado ao Postgres para criar o banco 'olist_crm'...");
    
    // Verifica se o banco já existe
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'olist_crm'");
    if (res.rowCount === 0) {
      await client.query("CREATE DATABASE olist_crm");
      console.log("Banco 'olist_crm' criado com sucesso!");
    } else {
      console.log("Banco 'olist_crm' já existe.");
    }
  } catch (err) {
    console.error("Erro ao criar banco:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createDb();

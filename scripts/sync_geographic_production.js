/**
 * Script para sincronizar dados geográficos no servidor de produção.
 * 
 * USO:
 *   node scripts/sync_geographic_production.js <API_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD>
 * 
 * EXEMPLO LOCAL:
 *   node scripts/sync_geographic_production.js http://localhost:4000 admin@example.com change-me
 * 
 * EXEMPLO PRODUÇÃO:
 *   node scripts/sync_geographic_production.js https://api.seu-dominio.com admin@example.com sua-senha
 */

const API_URL = process.argv[2] || "http://localhost:4000";
const EMAIL = process.argv[3] || "admin@example.com";
const PASSWORD = process.argv[4] || "change-me";

async function main() {
  console.log(`\n🌍 Sincronização Geográfica`);
  console.log(`   API: ${API_URL}`);
  console.log(`   User: ${EMAIL}\n`);

  // 1. Login
  console.log("🔑 Fazendo login...");
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.text();
    console.error(`❌ Login falhou: ${loginRes.status} - ${err}`);
    process.exit(1);
  }

  const { token } = await loginRes.json();
  console.log("✅ Login OK\n");

  // 2. Verificar estado atual
  console.log("📊 Verificando dados geográficos atuais...");
  const currentRes = await fetch(`${API_URL}/api/geographic/sales`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (currentRes.ok) {
    const current = await currentRes.json();
    console.log(`   Estados: ${current.summary.totalStates}`);
    console.log(`   Cidades: ${current.summary.totalCities}`);
    console.log(`   Clientes mapeados: ${current.summary.totalCustomers}`);
    console.log(`   Peças: ${current.summary.totalPieces.toLocaleString()}\n`);

    if (current.summary.totalStates > 0) {
      console.log("✅ Dados geográficos já existem! O mapa deveria funcionar.");
      console.log("   Se não está funcionando, o problema pode ser no frontend.\n");
    }
  } else {
    console.log("   ⚠️ Não foi possível verificar dados atuais\n");
  }

  // 3. Executar sync da planilha
  console.log("🔄 Executando sincronização geográfica da planilha Google Sheets...");
  const syncRes = await fetch(`${API_URL}/api/geographic/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!syncRes.ok) {
    const err = await syncRes.text();
    console.error(`❌ Sync falhou: ${syncRes.status} - ${err}`);
    process.exit(1);
  }

  const syncResult = await syncRes.json();
  console.log(`✅ Sync concluído! Clientes atualizados: ${syncResult.updatedCount}\n`);

  // 4. Verificar resultado
  console.log("📊 Verificando dados após sync...");
  const afterRes = await fetch(`${API_URL}/api/geographic/sales`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (afterRes.ok) {
    const after = await afterRes.json();
    console.log(`   Estados: ${after.summary.totalStates}`);
    console.log(`   Cidades: ${after.summary.totalCities}`);
    console.log(`   Clientes mapeados: ${after.summary.totalCustomers}`);
    console.log(`   Peças: ${after.summary.totalPieces.toLocaleString()}`);

    if (after.stateStats.length > 0) {
      console.log("\n   Top 5 estados:");
      after.stateStats.slice(0, 5).forEach((state, i) => {
        console.log(`   ${i + 1}. ${state.state} - ${state.customerCount} clientes, ${state.totalPieces.toLocaleString()} peças`);
      });
    }
  }

  console.log("\n🎉 Pronto! Os dados geográficos devem aparecer no mapa agora.");
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});

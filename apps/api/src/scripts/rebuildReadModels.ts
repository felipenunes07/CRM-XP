/**
 * Reconstrói os read-models (customers, orders, order_items, snapshots) para
 * TODOS os clientes do sales_raw — não só os que mudaram no último sync. Use para
 * corrigir manualmente uma divergência de telas/peças no painel. O agendador
 * diário (startDailyRebuildScheduler) já roda isto sozinho na madrugada.
 *
 * Rodar (no container do crm-backend):  npm run rebuild:readmodels -w @olist-crm/api
 */
import { pool } from "../db/client.js";
import { rebuildAllReadModels } from "../modules/analytics/readModelRebuild.js";

async function main() {
  try {
    console.log("Reconstruindo read-models de todos os clientes do sales_raw...");
    const result = await rebuildAllReadModels((done, total) => {
      console.log(`  ${done}/${total} clientes reconstruídos`);
    });
    console.log(`Reconstrução completa concluída com sucesso (${result.customers} clientes).`);
  } catch (err) {
    console.error("Falha na reconstrução:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

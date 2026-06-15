/**
 * Reconstrói os read-models (customers, orders, order_items, snapshots) para
 * TODOS os clientes que existem no sales_raw — não só os que mudaram no último
 * sync. Use isto para corrigir divergências quando algum sync foi interrompido
 * (timeout) e deixou pedidos de certos clientes sem reconstruir, fazendo o total
 * de telas/peças do painel ficar abaixo do que está no sales_raw/Supabase.
 *
 * Rodar (no container do crm-backend):  npm run rebuild:readmodels -w @olist-crm/api
 */
import { pool } from "../db/client.js";
import { rebuildReadModels, refreshDashboardDailyMetrics } from "../modules/analytics/analyticsService.js";
import { clearDashboardCache } from "../modules/crm/dashboardService.js";

const BATCH_SIZE = 200;

async function main() {
  try {
    const { rows } = await pool.query<{ customer_code: string }>(
      `SELECT DISTINCT customer_code
         FROM sales_raw
        WHERE COALESCE(customer_code, '') <> ''
        ORDER BY customer_code`,
    );

    const codes = rows.map((r) => r.customer_code);
    console.log(`Encontrados ${codes.length} clientes no sales_raw. Reconstruindo em lotes de ${BATCH_SIZE}...`);

    for (let i = 0; i < codes.length; i += BATCH_SIZE) {
      const batch = codes.slice(i, i + BATCH_SIZE);
      await rebuildReadModels(batch);
      console.log(`  ${Math.min(i + BATCH_SIZE, codes.length)}/${codes.length} clientes reconstruídos`);
    }

    console.log("Atualizando métricas diárias do dashboard...");
    await refreshDashboardDailyMetrics();
    await clearDashboardCache();

    console.log("Reconstrução completa concluída com sucesso.");
  } catch (err) {
    console.error("Falha na reconstrução:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

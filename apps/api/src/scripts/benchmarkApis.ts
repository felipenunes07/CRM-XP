/**
 * Benchmark dos endpoints que eram lentos — cronometra cada um contra o banco
 * de produção e imprime os ms. Rodar no console do crm-backend (EasyPanel):
 *
 *   npm run db:benchmark -w @olist-crm/api
 *
 * Chama as MESMAS funções que as rotas HTTP usam, então o tempo é real. Faz 2
 * passadas: a 1ª "fria" (sem cache) e a 2ª "quente" (com cache), como o usuário vê.
 */
import { pool } from "../db/client.js";
import type { JwtUser } from "../modules/platform/authService.js";
import { listWhatsappCampaigns, getWhatsappCampaignDetail } from "../modules/whatsapp/whatsappCampaignService.js";
import { getDashboardMetrics } from "../modules/crm/dashboardService.js";
import {
  listWhatsappMonitorConversations,
  getWhatsappAgentActivityReport,
} from "../modules/whatsapp/whatsappMonitorService.js";

type Row = { endpoint: string; passada: string; ms: number; status: string };

async function timeIt(endpoint: string, passada: string, fn: () => Promise<unknown>): Promise<Row> {
  const start = Date.now();
  try {
    await fn();
    return { endpoint, passada, ms: Date.now() - start, status: "ok" };
  } catch (error) {
    return {
      endpoint,
      passada,
      ms: Date.now() - start,
      status: `ERRO: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function main() {
  const userRes = await pool.query(
    `SELECT id, email, name, role FROM users
     WHERE role <> 'SELLER'
     ORDER BY created_at LIMIT 1`,
  );
  const row =
    userRes.rows[0] ?? (await pool.query(`SELECT id, email, name, role FROM users LIMIT 1`)).rows[0];
  if (!row) {
    console.error("Nenhum usuário encontrado para o benchmark.");
    await pool.end();
    return;
  }
  const user = {
    id: String(row.id),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    role: row.role,
  } as JwtUser;

  const campRes = await pool.query(`SELECT id FROM whatsapp_campaigns ORDER BY created_at DESC LIMIT 1`);
  const campaignId = campRes.rows[0]?.id as string | undefined;

  const cases: Array<{ endpoint: string; run: () => Promise<unknown> }> = [
    { endpoint: "GET /campaigns (lista)", run: () => listWhatsappCampaigns(20) },
    { endpoint: "GET /dashboard/metrics", run: () => getDashboardMetrics() },
    { endpoint: "GET /whatsapp-monitor/conversations (/mensagens)", run: () => listWhatsappMonitorConversations(user, {}) },
    { endpoint: "GET /whatsapp-monitor/activity (heatmap 7d)", run: () => getWhatsappAgentActivityReport(user, 7) },
  ];
  if (campaignId) {
    cases.push({
      endpoint: "GET /campaigns/:id  ABRIR painel (sem metricas)",
      run: () => getWhatsappCampaignDetail(campaignId, 5000, 0, true),
    });
    cases.push({
      endpoint: "GET /campaigns/:id  metricas (atribuicao)",
      run: () => getWhatsappCampaignDetail(campaignId, 5000, 0, false),
    });
  }

  const results: Row[] = [];
  for (const passada of ["1a (fria)", "2a (quente)"]) {
    for (const c of cases) {
      results.push(await timeIt(c.endpoint, passada, c.run));
    }
  }

  console.log("\n========== BENCHMARK DOS ENDPOINTS (ms) ==========");
  console.table(results);

  const worst = Math.max(...results.filter((r) => r.status === "ok").map((r) => r.ms), 0);
  const slow = results.filter((r) => r.status === "ok" && r.ms > 3000);
  console.log(`\nMais lento: ${worst} ms.`);
  if (slow.length === 0) {
    console.log("✅ Todos responderam em menos de 3 segundos.");
  } else {
    console.log(`⚠️ Ainda acima de 3s: ${[...new Set(slow.map((s) => s.endpoint))].join("; ")}`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Liga o trace de atribuição do Resumo Diário e roda para hoje + ontem.
 * Mostra, por remetente real, em qual agentName cada mensagem enviada caiu —
 * pra achar onde as mensagens da Tamires (e outras) estão sendo creditadas errado.
 *
 * Rodar no console do crm-backend:  npm run db:debug-report -w @olist-crm/api
 */
process.env.DEBUG_DAILY_REPORT = "1";

import { pool } from "../db/client.js";
import type { JwtUser } from "../modules/platform/authService.js";
import { getWhatsappDailySummaryReport } from "../modules/whatsapp/whatsappMonitorService.js";

function spDate(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}

async function main() {
  const row =
    (await pool.query(`SELECT id, email, name, role FROM users WHERE role <> 'SELLER' ORDER BY created_at LIMIT 1`)).rows[0];
  const user = {
    id: String(row.id),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    role: row.role,
  } as JwtUser;

  for (const off of [0, 1]) {
    const date = spDate(off);
    const r = await getWhatsappDailySummaryReport(user, date);
    console.log(`\n=== RELATORIO FINAL ${date} (agents) ===`);
    for (const a of r.agents ?? []) {
      console.log(`  ${a.agentName}: enviadas=${a.sentMessages} | grupos=${a.groupChatsCount} | particular=${a.privateChatsCount}`);
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

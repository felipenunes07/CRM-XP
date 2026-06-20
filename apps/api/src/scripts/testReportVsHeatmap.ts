/**
 * Teste de 5 dias: reconstrói o rollup (heatmap) e compara, dia a dia e agente a
 * agente, as ENVIADAS do Resumo Diário (função real) com as do Heatmap (rollup).
 * Diz OK/DIVERGE. Se bater nos 5 dias, as duas telas usam a MESMA regra.
 *
 * Rodar no console do crm-backend:  npm run db:test-5d -w @olist-crm/api
 */
import { pool } from "../db/client.js";
import type { JwtUser } from "../modules/platform/authService.js";
import { getWhatsappDailySummaryReport } from "../modules/whatsapp/whatsappMonitorService.js";
import { refreshWhatsappActivityRollups } from "../modules/whatsapp/whatsappActivityRollupService.js";

const SP = "America/Sao_Paulo";
function spDate(off: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - off);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: SP }).format(d);
}
function norm(s: unknown) {
  return String(s ?? "").toLowerCase().replace(/^xp\s+/, "").replace(/\s*\(.*\)\s*$/, "").trim();
}

async function rollupByAgent(date: string) {
  const r = await pool.query(
    `SELECT agent_name, SUM(sent_messages)::int AS env
     FROM whatsapp_activity_rollups WHERE period_date = $1::date GROUP BY agent_name`,
    [date],
  );
  const m = new Map<string, number>();
  for (const row of r.rows) {
    const k = norm(row.agent_name);
    if (k) m.set(k, (m.get(k) ?? 0) + Number(row.env));
  }
  return m;
}

async function main() {
  const row = (await pool.query(`SELECT id, email, name, role FROM users WHERE role <> 'SELLER' ORDER BY created_at LIMIT 1`)).rows[0];
  const user = { id: String(row.id), email: String(row.email ?? ""), name: String(row.name ?? ""), role: row.role } as JwtUser;

  // Reconstroi o rollup dos ultimos 6 dias (cobre o teste de 5), com retry no lock.
  let rebuilt = false;
  for (let i = 0; i < 6 && !rebuilt; i++) {
    const res = await refreshWhatsappActivityRollups(6);
    if (res.refreshed) {
      console.log(`Rollup reconstruido: ${res.inserted} linhas (${res.startDate}..${res.endDate})`);
      rebuilt = true;
    } else {
      const reason = (res as { reason?: string }).reason ?? "lock";
      console.log(`Rollup ocupado (${reason}); tentativa ${i + 1}/6, aguardando 8s...`);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  if (!rebuilt) console.log("AVISO: nao consegui reconstruir o rollup (segue lock). Comparando com o que ja existe.");

  let diverge = 0;
  for (let off = 0; off < 5; off++) {
    const date = spDate(off);
    const report = await getWhatsappDailySummaryReport(user, date);
    const rep = new Map<string, number>();
    for (const a of report.agents ?? []) {
      const k = norm(a.agentName);
      if (k) rep.set(k, (rep.get(k) ?? 0) + Number(a.sentMessages));
    }
    const roll = await rollupByAgent(date);

    const rows: Array<Record<string, unknown>> = [];
    for (const k of [...new Set([...rep.keys(), ...roll.keys()])].sort()) {
      const r = rep.get(k) ?? 0;
      const h = roll.get(k) ?? 0;
      if (r === 0 && h === 0) continue;
      const ok = r === h;
      if (!ok) diverge++;
      rows.push({ agente: k, resumo_env: r, heatmap_env: h, status: ok ? "OK" : "DIVERGE" });
    }
    console.log(`\n===== ${date} — Resumo vs Heatmap (enviadas) =====`);
    console.table(rows);
  }

  console.log(diverge === 0 ? "\n✅ Resumo e Heatmap BATEM nos 5 dias." : `\n⚠️ ${diverge} divergencias — ver linhas DIVERGE.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

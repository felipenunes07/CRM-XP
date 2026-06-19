/**
 * Validação científica do Resumo Diário: roda a FUNÇÃO REAL do relatório para hoje
 * e os 3 dias anteriores e compara, agente por agente, com a verdade crua do banco
 * (mensagens enviadas únicas por remetente real, deduplicadas por jid, excluindo
 * grupos/contatos internos). Mostra "OK" ou "DIVERGE".
 *
 * Rodar no console do crm-backend:  npm run db:audit-report -w @olist-crm/api
 */
import { pool } from "../db/client.js";
import type { JwtUser } from "../modules/platform/authService.js";
import { getWhatsappDailySummaryReport } from "../modules/whatsapp/whatsappMonitorService.js";

const SP_TZ = "America/Sao_Paulo";
// Aproxima os padrões de nome interno do relatório (grupos/contatos da equipe XP).
const INTERNAL_RX = "^xp[ -]|conferencia|interno|uniao faz acucar|fechar caixas|saida de caixas|funcionario faltas|taxista|marketing xp";

function spDateKey(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: SP_TZ }).format(d);
}

async function rawTruth(dateStr: string) {
  const res = await pool.query(
    `
    WITH dd AS (
      SELECT DISTINCT ON (wmm.remote_jid, wmm.message_id)
        -- O relatorio atribui por REMETENTE real (sender_name), nao por instancia:
        -- assim uma msg de grupo de quem esta com a Evolution off, mas captada por
        -- outra instancia, ainda e creditada a pessoa certa.
        lower(COALESCE(NULLIF(wmm.sender_name,''), wmm.instance_name)) AS agente,
        COALESCE(NULLIF(wmm.media_json->>'chatDisplayName',''), d.title, d.customer_display_name, '') AS chat,
        wmm.from_me
      FROM whatsapp_monitor_messages wmm
      JOIN deals d ON d.id = wmm.deal_id
      WHERE wmm.created_at >= ($1::date AT TIME ZONE '${SP_TZ}')
        AND wmm.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE '${SP_TZ}')
        AND COALESCE(wmm.message_id,'') <> ''
        AND wmm.remote_jid IS NOT NULL
      ORDER BY wmm.remote_jid, wmm.message_id, wmm.created_at
    )
    SELECT agente,
      count(*) FILTER (WHERE from_me AND NOT (lower(chat) ~ '${INTERNAL_RX}'))::int AS enviadas,
      count(*) FILTER (WHERE NOT from_me AND NOT (lower(chat) ~ '${INTERNAL_RX}'))::int AS recebidas
    FROM dd GROUP BY agente
    `,
    [dateStr],
  );
  const map = new Map<string, { sent: number; received: number }>();
  for (const r of res.rows) {
    map.set(String(r.agente), { sent: Number(r.enviadas), received: Number(r.recebidas) });
  }
  return map;
}

async function main() {
  const userRes = await pool.query(
    `SELECT id, email, name, role FROM users WHERE role <> 'SELLER' ORDER BY created_at LIMIT 1`,
  );
  const row = userRes.rows[0] ?? (await pool.query(`SELECT id, email, name, role FROM users LIMIT 1`)).rows[0];
  const user = {
    id: String(row.id),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    role: row.role,
  } as JwtUser;

  let totalDiverge = 0;
  for (let off = 0; off < 4; off++) {
    const dateStr = spDateKey(off);
    let report: any;
    try {
      report = await getWhatsappDailySummaryReport(user, dateStr);
    } catch (error) {
      console.log(`\n===== ${dateStr} =====`);
      console.log(`  ERRO ao gerar o relatorio: ${error instanceof Error ? error.message : String(error)}`);
      totalDiverge++;
      continue;
    }
    const raw = await rawTruth(dateStr);

    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const a of report.agents ?? []) {
      const key = String(a.agentName).trim().toLowerCase();
      seen.add(key);
      const r = raw.get(key) ?? { sent: 0, received: 0 };
      const bate = a.sentMessages === r.sent && a.receivedMessages === r.received;
      if (!bate) totalDiverge++;
      rows.push({
        agente: a.agentName,
        relatorio_env: a.sentMessages,
        real_env: r.sent,
        relatorio_rec: a.receivedMessages,
        real_rec: r.received,
        status: bate ? "OK" : "DIVERGE",
      });
    }
    for (const [k, v] of raw) {
      if (!seen.has(k) && (v.sent > 0 || v.received > 0)) {
        totalDiverge++;
        rows.push({ agente: `${k} (só no real)`, relatorio_env: "-", real_env: v.sent, relatorio_rec: "-", real_rec: v.received, status: "FALTA NO RELATORIO" });
      }
    }

    console.log(`\n===== ${dateStr} =====`);
    console.table(rows);
  }

  console.log(totalDiverge === 0 ? "\n✅ TUDO BATEU nos 4 dias." : `\n⚠️ ${totalDiverge} divergências — ver linhas DIVERGE/FALTA acima.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { REACTIVATION_PRESET } from "../crm/reactivationCore.js";
import { startRecurringJob } from "../platform/scheduledJobs.js";
import { getAttendanceReportSchedule, sendDailyGroupReportOnce } from "./whatsappAttendanceReportService.js";
import { getWhatsappCampaignPerformance } from "./whatsappCampaignService.js";

interface ReactivationRecipientRow {
  id: string;
  campaign_id: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_display_name: string | null;
  source_name: string;
  jid: string;
  status: "SENT" | "FAILED";
  stage: number;
}

export interface ReactivationReportCustomer {
  key: string;
  stage: number;
  code: string | null;
  name: string;
  status: "SENT" | "FAILED";
  responded: boolean;
}

export async function getReactivationReportCustomers(date: string, asOf = new Date()): Promise<ReactivationReportCustomer[]> {
  const result = await pool.query<ReactivationRecipientRow>(`
    SELECT DISTINCT r.id, r.campaign_id, r.customer_id, r.customer_code,
      r.customer_display_name, r.source_name, r.jid, r.status,
      (a.segment_definition ->> 'minDaysInactive')::int AS stage,
      COALESCE(r.sent_at, r.failed_at) AS event_at
    FROM message_automations a
    JOIN message_automation_runs ar ON ar.automation_id = a.id
    JOIN whatsapp_campaign_recipients r ON r.campaign_id = ar.campaign_id
    WHERE a.flow_definition ->> 'reactivationPreset' = $2
      AND a.segment_definition ->> 'minDaysInactive' IN ('30', '60', '90')
      AND (
        (r.status = 'SENT' AND r.sent_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
          AND r.sent_at < (($1::date + 1) AT TIME ZONE 'America/Sao_Paulo') AND r.sent_at <= $3::timestamptz)
        OR
        (r.status = 'FAILED' AND r.failed_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
          AND r.failed_at < (($1::date + 1) AT TIME ZONE 'America/Sao_Paulo') AND r.failed_at <= $3::timestamptz)
      )
    ORDER BY event_at, r.id
  `, [date, REACTIVATION_PRESET, asOf.toISOString()]);

  const campaignIds = [...new Set(result.rows.filter((row) => row.status === "SENT").map((row) => row.campaign_id))];
  const performance = await Promise.all(campaignIds.map((id) => getWhatsappCampaignPerformance(id)));
  const respondedIds = new Set(performance.flatMap((campaign) => campaign.recipients)
    .filter((recipient) => recipient.responded && recipient.firstResponseAt && new Date(recipient.firstResponseAt) <= asOf
      && new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(recipient.firstResponseAt)) <= date)
    .map((recipient) => recipient.recipientId));

  const customers = new Map<string, ReactivationReportCustomer>();
  for (const row of result.rows) {
    const customerKey = row.customer_id || row.customer_code || row.jid;
    const key = `${row.stage}:${customerKey}`;
    const previous = customers.get(key);
    const responded = respondedIds.has(row.id);
    if (previous?.status === "SENT") {
      previous.responded ||= responded;
    } else {
      customers.set(key, {
        key: customerKey, stage: Number(row.stage), code: row.customer_code,
        name: row.customer_display_name || row.source_name,
        status: row.status, responded,
      });
    }
  }
  return [...customers.values()];
}

export function formatReactivationGroupReport(date: string, customers: ReactivationReportCustomer[]) {
  const [year, month, day] = date.split("-");
  const sent = customers.filter((customer) => customer.status === "SENT");
  const sentCount = new Set(sent.map((customer) => customer.key)).size;
  const respondedCount = new Set(sent.filter((customer) => customer.responded).map((customer) => customer.key)).size;
  const label = (customer: ReactivationReportCustomer) => `${customer.code ? `${customer.code} — ` : ""}${customer.name}`;
  let text = `🤖 *Resumo da Automação — Lili*\n_${day}/${month}/${year}_\n\n`;
  for (const stage of [30, 60, 90]) {
    const clients = sent.filter((customer) => customer.stage === stage);
    text += `📨 *${stage} dias sem comprar${clients.length ? ` — ${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}` : ""}*\n`;
    if (!clients.length) text += `Nenhum envio hoje.\n\n`;
    for (const customer of clients) {
      text += `\n• ${label(customer)}\n  ${customer.responded ? "💬 Respondeu" : "⏳ Aguardando resposta"}\n`;
    }
    if (clients.length) text += "\n";
  }
  text += `📊 *Resumo do Dia*\n`;
  text += `✅ Clientes com mensagem enviada: ${sentCount}\n`;
  text += `💬 Clientes que responderam: ${respondedCount}\n`;
  text += `⏳ Aguardando resposta: ${sentCount - respondedCount}\n`;
  for (const stage of [30, 60, 90]) {
    const failed = customers.filter((customer) => customer.status === "FAILED" && customer.stage === stage);
    if (!failed.length) continue;
    text += `\n⚠️ *Falha no envio — ${stage} dias sem comprar:*\n`;
    for (const customer of failed) text += `• ${label(customer)}\n`;
  }
  return text.trimEnd();
}

export async function previewReactivationGroupReport(date: string, asOf = new Date()) {
  const customers = await getReactivationReportCustomers(date, asOf);
  return { date, customers, text: formatReactivationGroupReport(date, customers) };
}

export async function runScheduledReactivationReport(now = new Date()) {
  const schedule = getAttendanceReportSchedule(now, 45, true);
  if (!env.WHATSAPP_REACTIVATION_REPORT_ENABLED || !schedule.due) return { sent: false, reason: "not_due" };
  return sendDailyGroupReportOnce(schedule.date, "reactivation", async () => (await previewReactivationGroupReport(schedule.date, now)).text);
}

export function startReactivationReportScheduler() {
  logger.info("whatsapp reactivation report scheduler", {
    enabled: env.WHATSAPP_REACTIVATION_REPORT_ENABLED,
    groupJid: env.WHATSAPP_ATTENDANCE_REPORT_GROUP_JID,
    weekdays: "16:45", saturday: "12:45", sunday: "12:45", timezone: "America/Sao_Paulo",
  });
  if (!env.WHATSAPP_REACTIVATION_REPORT_ENABLED) return { async close() {} };
  return startRecurringJob({
    intervalMs: 30_000,
    run: () => runScheduledReactivationReport(),
    onError: (error) => logger.error("whatsapp reactivation report failed", { error: String(error) }),
  });
}

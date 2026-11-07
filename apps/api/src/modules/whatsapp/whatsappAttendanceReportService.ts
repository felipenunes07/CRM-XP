import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { sendToGroup } from "../crm/offboardingAlertService.js";
import { startRecurringJob } from "../platform/scheduledJobs.js";
import { getWhatsappDailySummaryReport } from "./whatsappMonitorService.js";
import { formatDailySummaryCustomerLines } from "./whatsappMonitorCore.js";

const TIMEZONE = "America/Sao_Paulo";
const SELLERS = [
  { name: "Thaís", aliases: ["thais"] },
  { name: "Suellen", aliases: ["suellen", "suelen"] },
  { name: "Amanda", aliases: ["amanda"] },
  { name: "Tamires", aliases: ["tamires", "thamires"] },
];

interface AttendanceAgent {
  agentName: string;
  sentMessages: number;
  groupChatsCount: number;
  initiatedCount: number;
}

interface AttendanceSummary {
  date: string;
  newCustomersCount: number;
  recoveredCustomersCount: number;
  recoveredCustomersList?: Record<string, unknown>[];
  totalMessagesSent: number;
  totalMessagesReceived: number;
  agents: AttendanceAgent[];
}

export function getAttendanceReportSchedule(now = new Date(), reportMinute = 55) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const scheduledMinute = (weekday === 6 ? 12 : 16) * 60 + reportMinute;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  // A short recovery window tolerates a restart without sending an old report at night.
  return { date, due: weekday !== 0 && minute >= scheduledMinute && minute < scheduledMinute + 15 };
}

function normalizeSellerName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/^xp\s+/, "");
}

export function formatAttendanceGroupReport(summary: AttendanceSummary, lostCustomersCount: number) {
  const agents = SELLERS.map((seller) => {
    const matches = summary.agents.filter((agent) => seller.aliases.includes(normalizeSellerName(agent.agentName)));
    return {
      agentName: seller.name,
      sentMessages: matches.reduce((sum, agent) => sum + agent.sentMessages, 0),
      groupChatsCount: matches.reduce((sum, agent) => sum + agent.groupChatsCount, 0),
      initiatedCount: matches.reduce((sum, agent) => sum + agent.initiatedCount, 0),
    };
  }).sort((left, right) => right.sentMessages - left.sentMessages);
  const [year, month, day] = summary.date.split("-");
  let text = `📅 *Relatório de Atendimento XP*\n_${day}/${month}/${year}_\n\n`;
  text += `📱 *Clientes Novos no Dia:* ${summary.newCustomersCount}\n`;
  text += `🔄 *Clientes Recuperados no Dia:* ${summary.recoveredCustomersCount}\n`;
  if (summary.recoveredCustomersList?.length) {
    text += `${formatDailySummaryCustomerLines(summary.recoveredCustomersList, { recovered: true })}\n`;
  }
  text += `📉 *Clientes Perdidos no Dia:* ${lostCustomersCount}\n\n`;
  text += `💬 *Resumo de Mensagens:*\n`;
  text += `📱 Mensagens Enviadas: ${summary.totalMessagesSent.toLocaleString("pt-BR")}\n`;
  text += `🧾 Mensagens Recebidas: ${summary.totalMessagesReceived.toLocaleString("pt-BR")}\n\n`;
  const top = agents[0]!;
  if (top.sentMessages > 0) {
    text += `🌟 *Vendedora Mais Ativa:* ${top.agentName} (${top.sentMessages.toLocaleString("pt-BR")} mensagens enviadas)\n\n`;
  }
  text += `🏆 *Ranking de Vendedoras e Atendimentos:*\n\n`;
  agents.forEach((agent, index) => {
    text += `${["🥇", "🥈", "🥉"][index] ?? "❤️"} *${agent.agentName}*\n`;
    text += `💬 Mensagens Enviadas: ${agent.sentMessages.toLocaleString("pt-BR")}\n`;
    text += `👥 Atendimentos em Grupo: ${agent.groupChatsCount}\n`;
    text += `✨ Conversas Iniciadas: ${agent.initiatedCount}\n\n`;
  });
  return text.trimEnd();
}

export async function countLostAttendanceCustomers(date: string): Promise<number> {
  // Count only the day the customer reaches 90 days, matching the final Lili stage.
  // Ignore future orders, and exclude customers who already bought again today.
  const result = await pool.query<{ count: number }>(`
    SELECT COUNT(DISTINCT o.customer_id)::int AS count
    FROM orders o
    WHERE o.order_date = $1::date - 90
      AND NOT EXISTS (
        SELECT 1 FROM orders newer
        WHERE newer.customer_id = o.customer_id
          AND newer.order_date > o.order_date
          AND newer.order_date <= $1::date
      )
  `, [date]);
  return Number(result.rows[0]?.count ?? 0);
}

export async function previewAttendanceGroupReport(date: string) {
  const [summary, lostCustomersCount] = await Promise.all([
    getWhatsappDailySummaryReport({
      id: "attendance-report-scheduler", name: "Relatório de Atendimento", email: "scheduler@localhost", role: "ADMIN",
    }, date),
    countLostAttendanceCustomers(date),
  ]);
  return { date, lostCustomersCount, text: formatAttendanceGroupReport(summary, lostCustomersCount) };
}

export async function runScheduledAttendanceReport(now = new Date()) {
  const schedule = getAttendanceReportSchedule(now);
  if (!env.WHATSAPP_ATTENDANCE_REPORT_ENABLED || !schedule.due) return { sent: false, reason: "not_due" };
  return sendDailyGroupReportOnce(schedule.date, "attendance", async () => (await previewAttendanceGroupReport(schedule.date)).text);
}

export async function sendDailyGroupReportOnce(date: string, kind: "attendance" | "reactivation", buildText: () => Promise<string>) {
  const groupJid = env.WHATSAPP_ATTENDANCE_REPORT_GROUP_JID.trim();
  if (!/^\d+(?:-\d+)?@g\.us$/.test(groupJid)) throw new Error("Invalid daily report group JID");
  const lockNamespace = kind === "attendance" ? 724013 : 724014;
  const cursorKey = `whatsapp_${kind}_report:${groupJid}:${date}`;
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::int, $2::int) AS locked", [lockNamespace, 1],
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) return { sent: false, reason: "running" };
    const previous = await client.query("SELECT cursor_value FROM sync_cursors WHERE key = $1", [cursorKey]);
    if (previous.rows.length > 0) return { sent: false, reason: "already_claimed" };

    const text = await buildText();
    // Persist before contacting WhatsApp: a timeout or process crash must not duplicate the message.
    await client.query(`
      INSERT INTO sync_cursors (key, cursor_value, updated_at) VALUES ($1, $2, NOW())
    `, [cursorKey, JSON.stringify({ status: "sending", date })]);
    try {
      await sendToGroup(groupJid, text, env.WHATSAPP_ATTENDANCE_REPORT_INSTANCE_ID);
    } catch (error) {
      await client.query("UPDATE sync_cursors SET cursor_value = $2, updated_at = NOW() WHERE key = $1", [
        cursorKey, JSON.stringify({ status: "failed", date, error: String(error) }),
      ]);
      throw error;
    }
    await client.query("UPDATE sync_cursors SET cursor_value = $2, updated_at = NOW() WHERE key = $1", [
      cursorKey, JSON.stringify({ status: "sent", date, sentAt: new Date().toISOString() }),
    ]);
    logger.info(`whatsapp ${kind} report sent`, { date, groupJid });
    return { sent: true, date };
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [lockNamespace, 1]);
    } finally {
      client.release();
    }
  }
}

export function startAttendanceReportScheduler() {
  logger.info("whatsapp attendance report scheduler", {
    enabled: env.WHATSAPP_ATTENDANCE_REPORT_ENABLED,
    groupJid: env.WHATSAPP_ATTENDANCE_REPORT_GROUP_JID,
    weekdays: "16:55", saturday: "12:55", sunday: false, timezone: TIMEZONE,
  });
  if (!env.WHATSAPP_ATTENDANCE_REPORT_ENABLED) return { async close() {} };
  return startRecurringJob({
    intervalMs: 30_000,
    run: () => runScheduledAttendanceReport(),
    onError: (error) => logger.error("whatsapp attendance report failed", { error: String(error) }),
  });
}

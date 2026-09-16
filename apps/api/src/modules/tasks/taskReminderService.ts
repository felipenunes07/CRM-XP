import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { sendWhatsappInstanceTextMessage } from "../whatsapp/evolutionService.js";
import { sendUazapiTextMessage } from "../whatsapp/uazapiService.js";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const AUTOMATIC_NOTICE_FOOTER = "Aviso automático do CRM XP";
const AUTO_MESSAGES_SETTINGS_KEY = "auto_messages";

export const TASK_AUTO_MESSAGE_KINDS = ["assignment", "review", "return", "overdue"] as const;
export type TaskAutoMessageKind = (typeof TASK_AUTO_MESSAGE_KINDS)[number];
export type TaskAutoMessageSettings = Record<TaskAutoMessageKind, boolean>;

type LiliInstance = {
  provider: string; instance_name: string; display_label: string | null;
  evolution_base_url: string | null; evolution_api_key: string | null;
  uazapi_base_url: string | null; uazapi_token: string | null;
};

async function liliInstance(): Promise<LiliInstance | null> {
  const result = await pool.query<LiliInstance>(
    `SELECT provider, instance_name, display_label, evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
     FROM whatsapp_instances WHERE status = 'ACTIVE' AND (
       LOWER(COALESCE(display_label, '')) LIKE '%lili%' OR
       LOWER(COALESCE(assigned_user_name, '')) LIKE '%lili%' OR
       LOWER(COALESCE(instance_name, '')) LIKE '%lili%'
     ) ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function sendWithLili(instance: LiliInstance, phone: string, message: string) {
  if (instance.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
    return sendUazapiTextMessage({ baseUrl: instance.uazapi_base_url, token: instance.uazapi_token }, phone, message);
  }
  if (instance.evolution_base_url && instance.evolution_api_key) {
    return sendWhatsappInstanceTextMessage({ instanceName: instance.instance_name, evolutionBaseUrl: instance.evolution_base_url, evolutionApiKey: instance.evolution_api_key }, phone, message);
  }
  throw new Error("WhatsApp da Lili sem credenciais validas");
}

/** Sem registro salvo, todos os avisos continuam ligados como antes. */
export async function getTaskAutoMessageSettings(): Promise<TaskAutoMessageSettings> {
  const result = await pool.query<{ value: unknown }>(
    "SELECT value FROM task_board_settings WHERE key = $1",
    [AUTO_MESSAGES_SETTINGS_KEY],
  );
  const saved = (result.rows?.[0]?.value ?? {}) as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    TASK_AUTO_MESSAGE_KINDS.map((kind) => [kind, saved[kind] !== false]),
  ) as TaskAutoMessageSettings;
}

export async function setTaskAutoMessageEnabled(kind: TaskAutoMessageKind, enabled: boolean) {
  await pool.query(
    `INSERT INTO task_board_settings (key, value) VALUES ($1, jsonb_build_object($2::text, $3::boolean))
     ON CONFLICT (key) DO UPDATE SET value = task_board_settings.value || EXCLUDED.value, updated_at = NOW()`,
    [AUTO_MESSAGES_SETTINGS_KEY, kind, enabled],
  );
  return getTaskAutoMessageSettings();
}

async function isEnabled(kind: TaskAutoMessageKind) {
  return (await getTaskAutoMessageSettings())[kind];
}

function formatDue(dueDate: string, dueTime: string | null) {
  const due = dueDate.split("-").reverse().join("/");
  return dueTime ? `${due} às ${dueTime.slice(0, 5)}` : due;
}

/** Textos únicos: usados no envio e na prévia da página de mensagens automáticas. */
export const taskAutoMessageText = {
  assignment: (name: string, title: string, dueDate: string, dueTime: string | null) =>
    `Olá, ${name}! 🆕\n\nVocê recebeu uma nova tarefa: *${title}*.\nPrazo: *${formatDue(dueDate, dueTime)}*.\n\nAbra o CRM XP para ver os detalhes e atualizar o andamento.\n\n${AUTOMATIC_NOTICE_FOOTER}`,
  review: (name: string, title: string) =>
    `Olá, ${name}! ✅\n\nA tarefa *${title}* foi entregue por todos os responsáveis e está *Em revisão*.\n\nAbra o CRM XP para conferir e finalizar ou devolver para ajuste.\n\n${AUTOMATIC_NOTICE_FOOTER}`,
  return: (name: string, title: string) =>
    `Olá, ${name}! ↩️\n\nA tarefa *${title}* foi devolvida para você.\n\nAbra o CRM XP para acompanhar o motivo, ajustar o necessário e atribuí-la novamente.\n\n${AUTOMATIC_NOTICE_FOOTER}`,
  overdue: (name: string, title: string, dueDate: string) =>
    `Olá, ${name}! ⏰\n\nA tarefa *${title}* venceu em *${formatDue(dueDate, null)}* e ainda está pendente.\n\nPor favor, atualize o andamento ou conclua quando finalizar.\n\n${AUTOMATIC_NOTICE_FOOTER}`,
};

type LogEntry = {
  kind: TaskAutoMessageKind;
  status: "sent" | "failed" | "skipped";
  taskId: string;
  taskTitle: string;
  recipientUserId: string | null;
  recipientName: string;
  message: string;
  error?: string;
};

/** O histórico nunca pode impedir o envio: falha ao gravar só vira aviso no log. */
async function logAutoMessage(entry: LogEntry) {
  try {
    await pool.query(
      `INSERT INTO task_auto_message_log (kind, status, task_id, task_title, recipient_user_id, recipient_name, message, error)
       VALUES ($1, $2, $3::uuid, $4, $5::uuid, $6, $7, $8)`,
      [entry.kind, entry.status, entry.taskId, entry.taskTitle, entry.recipientUserId, entry.recipientName, entry.message, entry.error ?? null],
    );
  } catch (error) {
    logger.warn("task auto message log failed", { taskId: entry.taskId, error: String(error) });
  }
}

type EventNotification = {
  kind: Exclude<TaskAutoMessageKind, "overdue">;
  taskId: string;
  taskTitle: string;
  recipientUserId?: string | null;
  recipientName: string;
  rawPhone: string | null;
  message: string;
};

async function sendEventNotification(input: EventNotification) {
  const { kind, taskId } = input;
  const phone = input.rawPhone?.replace(/\D/g, "") ?? "";
  if (!phone) return false;
  const entry = {
    kind,
    taskId,
    taskTitle: input.taskTitle,
    recipientUserId: input.recipientUserId ?? null,
    recipientName: input.recipientName,
    message: input.message,
  };
  try {
    if (!(await isEnabled(kind))) {
      logger.info(`task ${kind} notification skipped (disabled)`, { taskId });
      await logAutoMessage({ ...entry, status: "skipped", error: "Aviso desligado" });
      return false;
    }
    const instance = await liliInstance();
    if (!instance) {
      await logAutoMessage({ ...entry, status: "failed", error: "WhatsApp da Lili desconectado" });
      return false;
    }
    await sendWithLili(instance, phone, input.message);
    logger.info(`task ${kind} notification sent`, { taskId });
    await logAutoMessage({ ...entry, status: "sent" });
    return true;
  } catch (error) {
    logger.warn(`task ${kind} notification failed`, { taskId, error: String(error) });
    await logAutoMessage({ ...entry, status: "failed", error: "Falha no envio pelo WhatsApp" });
    return false;
  }
}

export async function sendTaskReviewNotification(input: {
  creatorUserId?: string | null;
  creatorName: string;
  creatorPhone: string | null;
  taskTitle: string;
  taskId: string;
}) {
  return sendEventNotification({
    kind: "review",
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    recipientUserId: input.creatorUserId,
    recipientName: input.creatorName,
    rawPhone: input.creatorPhone,
    message: taskAutoMessageText.review(input.creatorName, input.taskTitle),
  });
}

export async function sendTaskAssignmentNotification(input: {
  recipientUserId?: string | null;
  recipientName: string;
  recipientPhone: string | null;
  taskTitle: string;
  dueDate: string;
  dueTime: string | null;
  taskId: string;
}) {
  return sendEventNotification({
    kind: "assignment",
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    recipientUserId: input.recipientUserId,
    recipientName: input.recipientName,
    rawPhone: input.recipientPhone,
    message: taskAutoMessageText.assignment(input.recipientName, input.taskTitle, input.dueDate, input.dueTime),
  });
}

export async function sendTaskReturnNotification(input: {
  recipientUserId?: string | null;
  recipientName: string;
  recipientPhone: string | null;
  taskTitle: string;
  taskId: string;
}) {
  return sendEventNotification({
    kind: "return",
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    recipientUserId: input.recipientUserId,
    recipientName: input.recipientName,
    rawPhone: input.recipientPhone,
    message: taskAutoMessageText.return(input.recipientName, input.taskTitle),
  });
}

/** Envia no máximo uma cobrança por dia para cada responsável ainda pendente. */
export async function sendOverdueTaskReminders() {
  // Desligado não marca reminded_on: ao religar, as cobranças do dia saem normalmente.
  if (!(await isEnabled("overdue"))) return { sent: 0, reason: "disabled" };
  const instance = await liliInstance();
  if (!instance) return { sent: 0, reason: "lili_not_active" };
  const claimed = await pool.query<{ task_id: string; user_id: string; title: string; due_date: string; full_name: string; whatsapp_phone: string }>(
    `WITH pending AS (
       SELECT ta.task_id, ta.user_id
       FROM task_assignees ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE t.deleted_at IS NULL AND ta.status <> 'done' AND NOT ta.reminders_paused
         AND (t.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
              OR (t.due_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
                  AND t.due_time IS NOT NULL AND t.due_time < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::time))
         AND (ta.reminded_on IS NULL OR ta.reminded_on < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)
     ), claimed AS (
       UPDATE task_assignees ta SET reminded_on = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date, updated_at = NOW()
       FROM pending p WHERE ta.task_id = p.task_id AND ta.user_id = p.user_id
       RETURNING ta.task_id, ta.user_id
     ) SELECT c.task_id, c.user_id, t.title, t.due_date::text, p.full_name, p.whatsapp_phone
       FROM claimed c JOIN tasks t ON t.id = c.task_id JOIN profiles p ON p.id = c.user_id
       WHERE COALESCE(p.whatsapp_phone, '') <> ''`,
  );
  let sent = 0;
  for (const task of claimed.rows) {
    const phone = task.whatsapp_phone.replace(/\D/g, "");
    if (!phone) continue;
    const message = taskAutoMessageText.overdue(task.full_name, task.title, task.due_date);
    const entry = { kind: "overdue" as const, taskId: task.task_id, taskTitle: task.title, recipientUserId: task.user_id, recipientName: task.full_name, message };
    try {
      await sendWithLili(instance, phone, message);
      sent += 1;
      await logAutoMessage({ ...entry, status: "sent" });
    } catch (error) {
      logger.warn("task overdue reminder failed", { taskId: task.task_id, error: String(error) });
      await logAutoMessage({ ...entry, status: "failed", error: "Falha no envio pelo WhatsApp" });
    }
  }
  if (sent) logger.info("task overdue reminders sent", { sent });
  return { sent };
}

type ScheduledReminderRow = {
  task_id: string;
  user_id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  priority: string;
  status: string;
  full_name: string;
  profile_avatar_url: string | null;
  whatsapp_phone: string | null;
  reminders_paused: boolean;
  is_overdue: boolean;
  sent_today: boolean;
  next_send_at: Date | string;
};

type HistoryRow = {
  id: string;
  kind: TaskAutoMessageKind;
  status: "sent" | "failed" | "skipped";
  task_id: string | null;
  task_title: string;
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_photo: string | null;
  message: string;
  error: string | null;
  created_at: Date | string;
};

/**
 * Prévia das cobranças de atraso: para cada responsável pendente, quando a
 * próxima mensagem sai e com qual texto. Espelha as regras de
 * sendOverdueTaskReminders (fuso de São Paulo, uma por dia).
 */
export async function getTaskAutoMessagesOverview() {
  const [settings, instance, scheduled, history] = await Promise.all([
    getTaskAutoMessageSettings(),
    liliInstance(),
    pool.query<ScheduledReminderRow>(
      `WITH clock AS (
         SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') AS now_local
       ), pending AS (
         SELECT ta.task_id, ta.user_id, t.title, t.due_date, t.due_time, t.priority, ta.status,
                p.full_name, p.profile_avatar_url, p.whatsapp_phone, ta.reminders_paused, ta.reminded_on, c.now_local,
                (t.due_date < c.now_local::date
                 OR (t.due_date = c.now_local::date AND t.due_time IS NOT NULL AND t.due_time < c.now_local::time)) AS is_overdue
         FROM task_assignees ta
         JOIN tasks t ON t.id = ta.task_id
         JOIN profiles p ON p.id = ta.user_id
         CROSS JOIN clock c
         WHERE t.deleted_at IS NULL AND t.status <> 'done' AND ta.status <> 'done'
       )
       SELECT task_id, user_id, title, due_date::text, due_time::text, priority, status,
              full_name, profile_avatar_url, whatsapp_phone, reminders_paused, is_overdue,
              (is_overdue AND reminded_on >= now_local::date) AS sent_today,
              (CASE
                 WHEN is_overdue AND (reminded_on IS NULL OR reminded_on < now_local::date) THEN now_local
                 WHEN is_overdue THEN (now_local::date + 1)::timestamp
                 WHEN due_time IS NOT NULL THEN due_date + due_time
                 ELSE (due_date + 1)::timestamp
               END AT TIME ZONE 'America/Sao_Paulo') AS next_send_at
       FROM pending
       ORDER BY next_send_at, title, full_name
       LIMIT 500`,
    ),
    pool.query<HistoryRow>(
      `SELECT l.id, l.kind, l.status, l.task_id, l.task_title, l.recipient_user_id, l.recipient_name,
              p.profile_avatar_url AS recipient_photo, l.message, l.error, l.created_at
       FROM task_auto_message_log l
       LEFT JOIN profiles p ON p.id = l.recipient_user_id
       WHERE l.created_at >= NOW() - INTERVAL '7 days'
       ORDER BY l.created_at DESC
       LIMIT 300`,
    ),
  ]);
  return {
    settings,
    check_interval_minutes: CHECK_INTERVAL_MS / 60000,
    lili: { active: Boolean(instance), label: instance ? instance.display_label || instance.instance_name : null },
    examples: {
      assignment: taskAutoMessageText.assignment("Maria", "Conferir estoque", "2026-09-20", "14:30"),
      review: taskAutoMessageText.review("Felipe", "Conferir estoque"),
      return: taskAutoMessageText.return("Maria", "Conferir estoque"),
      overdue: taskAutoMessageText.overdue("Maria", "Conferir estoque", "2026-09-15"),
    } satisfies Record<TaskAutoMessageKind, string>,
    scheduled: scheduled.rows.map((row) => ({
      task_id: row.task_id,
      user_id: row.user_id,
      title: row.title,
      due_date: row.due_date,
      due_time: row.due_time,
      priority: row.priority,
      status: row.status,
      recipient_name: row.full_name,
      recipient_photo: row.profile_avatar_url,
      has_whatsapp: Boolean(row.whatsapp_phone?.replace(/\D/g, "")),
      paused: row.reminders_paused,
      is_overdue: row.is_overdue,
      sent_today: row.sent_today,
      next_send_at: new Date(row.next_send_at).toISOString(),
      message: taskAutoMessageText.overdue(row.full_name, row.title, row.due_date),
    })),
    history: history.rows.map((row) => ({ ...row, created_at: new Date(row.created_at).toISOString() })),
  };
}

export async function setTaskReminderPaused(taskId: string, userId: string, paused: boolean) {
  const result = await pool.query(
    `UPDATE task_assignees SET reminders_paused = $3, updated_at = NOW()
     WHERE task_id = $1::uuid AND user_id = $2::uuid`,
    [taskId, userId, paused],
  );
  if (!result.rowCount) throw new HttpError(404, "Responsavel da tarefa nao encontrado");
}

export function startTaskOverdueReminderScheduler() {
  void sendOverdueTaskReminders().catch((error) => logger.warn("task overdue reminder startup failed", { error: String(error) }));
  return setInterval(() => {
    void sendOverdueTaskReminders().catch((error) => logger.warn("task overdue reminder failed", { error: String(error) }));
  }, CHECK_INTERVAL_MS);
}

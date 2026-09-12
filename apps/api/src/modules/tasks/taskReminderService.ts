import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { sendWhatsappInstanceTextMessage } from "../whatsapp/evolutionService.js";
import { sendUazapiTextMessage } from "../whatsapp/uazapiService.js";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

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

export async function sendTaskReviewNotification(input: {
  creatorName: string;
  creatorPhone: string | null;
  taskTitle: string;
  taskId: string;
}) {
  const phone = input.creatorPhone?.replace(/\D/g, "") ?? "";
  if (!phone) return false;
  const instance = await liliInstance();
  if (!instance) return false;
  const message = `Olá, ${input.creatorName}! 👋\n\nA tarefa *${input.taskTitle}* foi entregue por todos os responsáveis e está *Em revisão*.\n\nAbra o CRM XP para conferir e finalizar ou devolver para ajuste.\n\n_Lembrete automático do CRM XP pela Lili._`;
  try {
    await sendWithLili(instance, phone, message);
    logger.info("task review notification sent", { taskId: input.taskId });
    return true;
  } catch (error) {
    logger.warn("task review notification failed", { taskId: input.taskId, error: String(error) });
    return false;
  }
}

/** Envia no máximo uma cobrança por dia para cada responsável ainda pendente. */
export async function sendOverdueTaskReminders() {
  const instance = await liliInstance();
  if (!instance) return { sent: 0, reason: "lili_not_active" };
  const claimed = await pool.query<{ task_id: string; title: string; due_date: string; full_name: string; whatsapp_phone: string }>(
    `WITH pending AS (
       SELECT ta.task_id, ta.user_id
       FROM task_assignees ta
       JOIN tasks t ON t.id = ta.task_id
       WHERE t.deleted_at IS NULL AND ta.status <> 'done'
         AND (t.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
              OR (t.due_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
                  AND t.due_time IS NOT NULL AND t.due_time < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::time))
         AND (ta.reminded_on IS NULL OR ta.reminded_on < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date)
     ), claimed AS (
       UPDATE task_assignees ta SET reminded_on = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date, updated_at = NOW()
       FROM pending p WHERE ta.task_id = p.task_id AND ta.user_id = p.user_id
       RETURNING ta.task_id, ta.user_id
     ) SELECT c.task_id, t.title, t.due_date::text, p.full_name, p.whatsapp_phone
       FROM claimed c JOIN tasks t ON t.id = c.task_id JOIN profiles p ON p.id = c.user_id
       WHERE COALESCE(p.whatsapp_phone, '') <> ''`,
  );
  let sent = 0;
  for (const task of claimed.rows) {
    const phone = task.whatsapp_phone.replace(/\D/g, "");
    if (!phone) continue;
    const due = task.due_date.split("-").reverse().join("/");
    const message = `Olá, ${task.full_name}! 👋\n\nA tarefa *${task.title}* venceu em *${due}* e ainda está pendente.\n\nPor favor, atualize o andamento ou conclua quando finalizar.\n\n_Lembrete automático do CRM XP pela Lili._`;
    try {
      await sendWithLili(instance, phone, message);
      sent += 1;
    } catch (error) {
      logger.warn("task overdue reminder failed", { taskId: task.task_id, error: String(error) });
    }
  }
  if (sent) logger.info("task overdue reminders sent", { sent });
  return { sent };
}

export function startTaskOverdueReminderScheduler() {
  void sendOverdueTaskReminders().catch((error) => logger.warn("task overdue reminder startup failed", { error: String(error) }));
  return setInterval(() => {
    void sendOverdueTaskReminders().catch((error) => logger.warn("task overdue reminder failed", { error: String(error) }));
  }, CHECK_INTERVAL_MS);
}

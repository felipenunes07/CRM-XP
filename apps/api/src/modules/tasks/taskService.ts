import type { PoolClient } from "pg";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
import { sendWhatsappInstanceTextMessage } from "../whatsapp/evolutionService.js";
import { sendUazapiTextMessage } from "../whatsapp/uazapiService.js";

export const TEAM_PERSON_ID = "team";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskChecklistItem = { id: string; text: string; done: boolean };

export interface TaskMutationInput {
  action: "create" | "edit" | "move" | "status" | "delete" | "notify" | "details" | "priority" | "return";
  id?: string;
  version?: number;
  title?: string;
  notes?: string;
  person_id?: string;
  due_date?: string;
  due_time?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  checklist?: TaskChecklistItem[];
  images?: string[];
}

export async function setTaskTeamAvatar(avatarUrl: string) {
  await pool.query(
    `INSERT INTO task_board_settings (key, value)
     VALUES ('team_avatar_url', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(avatarUrl)],
  );
}

export async function setTaskPersonVisible(personId: string, visible: boolean) {
  if (personId !== TEAM_PERSON_ID) {
    const exists = await pool.query("SELECT 1 FROM profiles WHERE id = $1", [personId]);
    if (!exists.rows[0]) throw new HttpError(404, "Usuario nao encontrado");
  }
  const current = await pool.query<{ value: unknown }>("SELECT value FROM task_board_settings WHERE key = 'hidden_people'");
  const raw = current.rows[0]?.value;
  const hidden = new Set(Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : []);
  if (visible) hidden.delete(personId); else hidden.add(personId);
  await pool.query(
    `INSERT INTO task_board_settings (key, value) VALUES ('hidden_people', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify([...hidden])],
  );
}

export async function setTaskPeopleOrder(personIds: string[]) {
  if (!Array.isArray(personIds) || new Set(personIds).size !== personIds.length || personIds.some((id) => id !== TEAM_PERSON_ID && !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new HttpError(400, "Ordem de usuarios invalida");
  }
  await pool.query(
    `INSERT INTO task_board_settings (key, value) VALUES ('people_order', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(personIds)],
  );
}

interface TaskRow {
  id: string;
  title: string;
  notes: string;
  checklist: TaskChecklistItem[];
  images: string[];
  audience: "user" | "team";
  assignee_user_id: string | null;
  due_date: string;
  due_time: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_by_user_id: string;
  created_by_name?: string;
  created_by_photo?: string | null;
  assignee_has_whatsapp?: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  version: number;
}

function isAdmin(user: JwtUser) {
  return user.appRole === "admin" || user.role === "ADMIN";
}

function cleanText(value: unknown, field: string, max: number, required = true) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new HttpError(400, `${field} invalido`);
  }
  return value.trim();
}

function cleanDueDate(value: unknown) {
  const date = cleanText(value, "Prazo", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    throw new HttpError(400, "Prazo invalido");
  }
  return date;
}

function cleanDueTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const time = cleanText(value, "Horario", 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(400, "Horario invalido");
  }
  return time;
}

function cleanPriority(value: unknown): TaskPriority {
  if (value === undefined || value === null || value === "") return "normal";
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") return value;
  throw new HttpError(400, "Prioridade invalida");
}

function cleanChecklist(value: unknown): TaskChecklistItem[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new HttpError(400, "Checklist invalido");
  }
  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new HttpError(400, "Item do checklist invalido");
    const item = raw as Record<string, unknown>;
    const id = cleanText(item.id, "Item do checklist", 80);
    const text = cleanText(item.text, "Texto do checklist", 240);
    if (ids.has(id)) throw new HttpError(400, "Itens duplicados no checklist");
    ids.add(id);
    return { id, text, done: Boolean(item.done) };
  });
}
function cleanImages(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5) throw new HttpError(400, "Imagens invalidas");
  return value.map((image) => {
    if (typeof image !== "string" || !/^data:image\/(jpeg|png|gif|webp);base64,/.test(image) || image.length > 1_100_000) throw new HttpError(400, "Envie imagens JPG, PNG, GIF ou WEBP de ate 800KB");
    return image;
  });
}

function toBoardTask(row: TaskRow) {
  const dueTime = row.due_time ? String(row.due_time).slice(0, 5) : null;
  const deadline = Date.parse(`${row.due_date}T${dueTime ? `${dueTime}:00` : "23:59:59"}-03:00`);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    images: Array.isArray(row.images) ? row.images : [],
    person_id: row.audience === "team" ? TEAM_PERSON_ID : row.assignee_user_id,
    due_date: row.due_date,
    due_time: dueTime,
    deadline,
    status: row.status,
    priority: row.priority ?? "normal",
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name ?? "Usuario",
    created_by_photo: row.created_by_photo ?? null,
    can_notify: row.audience === "user" && Boolean(row.assignee_has_whatsapp),
    created_at: row.created_at,
    completed_at: row.completed_at,
    version: row.version,
  };
}

async function addAudit(
  client: PoolClient,
  user: JwtUser,
  task: Pick<TaskRow, "id" | "title">,
  action: string,
  details: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO task_audit_logs (task_id, actor_user_id, action, task_title, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [task.id, user.id, action, task.title, JSON.stringify(details)],
  );
}

async function assignment(client: PoolClient, personId: unknown) {
  const id = cleanText(personId, "Responsavel", 80);
  if (id === TEAM_PERSON_ID) {
    return { audience: "team" as const, assigneeUserId: null };
  }
  const result = await client.query<{ id: string }>(
    "SELECT id FROM profiles WHERE id = $1 AND is_active = true",
    [id],
  );
  if (!result.rows[0]) throw new HttpError(400, "Escolha um usuario ativo");
  return { audience: "user" as const, assigneeUserId: id };
}

export async function getTaskBoard(user: JwtUser, scope: "all" | "mine" = "all") {
  const admin = isAdmin(user);
  const showAll = admin && scope === "all";
  const [peopleResult, tasksResult, logsResult, settingsResult] = await Promise.all([
    pool.query<{ id: string; full_name: string; profile_avatar_url: string | null; created_at: string }>(
      `SELECT id, full_name, profile_avatar_url, created_at::text
       FROM profiles
       WHERE is_active = true
       ORDER BY full_name ASC, created_at ASC`,
    ),
    pool.query<TaskRow>(
      `SELECT t.id, t.title, t.notes, t.checklist, t.images, t.audience, t.assignee_user_id,
              t.due_date::text, t.due_time::text, t.status, t.priority, t.created_by_user_id,
              COALESCE(creator.full_name, creator.email, 'Usuario') AS created_by_name,
              creator.profile_avatar_url AS created_by_photo,
              (assignee.whatsapp_phone IS NOT NULL AND assignee.whatsapp_phone <> '') AS assignee_has_whatsapp,
              t.created_at::text, t.updated_at::text, t.completed_at::text, t.version
       FROM tasks t
       LEFT JOIN profiles creator ON creator.id = t.created_by_user_id
       LEFT JOIN profiles assignee ON assignee.id = t.assignee_user_id
       WHERE t.deleted_at IS NULL
         AND (
           $1::boolean
           OR t.audience = 'team'
           OR t.assignee_user_id = $2::uuid
           OR t.created_by_user_id = $2::uuid
         )
       ORDER BY t.due_date ASC, t.due_time ASC NULLS LAST, t.created_at ASC`,
      [showAll, user.id],
    ),
    admin
      ? pool.query<{
          id: string;
          task_id: string | null;
          actor_user_id: string;
          actor_name: string;
          action: string;
          task_title: string;
          details: Record<string, unknown>;
          created_at: string;
        }>(
          `SELECT l.id::text, l.task_id, l.actor_user_id,
                  COALESCE(p.full_name, p.email, 'Usuario') AS actor_name,
                  l.action, l.task_title, l.details, l.created_at::text
           FROM task_audit_logs l
           LEFT JOIN profiles p ON p.id = l.actor_user_id
           ORDER BY l.created_at DESC
           LIMIT 500`,
        )
      : Promise.resolve({ rows: [] }),
    pool.query<{ key: string; value: unknown }>("SELECT key, value FROM task_board_settings WHERE key IN ('team_avatar_url', 'hidden_people', 'people_order')"),
  ]);

  const setting = (key: string) => settingsResult.rows.find((row) => row.key === key)?.value;
  const storedAvatar = setting("team_avatar_url");
  const teamAvatar = typeof storedAvatar === "string"
    ? (storedAvatar.startsWith("\"") ? JSON.parse(storedAvatar) as string : storedAvatar)
    : null;
  const hiddenPeople = new Set(Array.isArray(setting("hidden_people")) ? setting("hidden_people") as string[] : []);
  const peopleOrder = Array.isArray(setting("people_order")) ? setting("people_order") as string[] : [];
  const positionOf = (id: string, fallback: number) => {
    const position = peopleOrder.indexOf(id);
    return position < 0 ? peopleOrder.length + fallback : position;
  };

  return {
    people: [
      {
        id: TEAM_PERSON_ID,
        name: "Time",
        photo: teamAvatar,
        hidden: hiddenPeople.has(TEAM_PERSON_ID),
        position: positionOf(TEAM_PERSON_ID, 0),
      },
      ...peopleResult.rows.map((person, index) => ({
        id: String(person.id),
        name: String(person.full_name),
        photo: person.profile_avatar_url,
        hidden: hiddenPeople.has(String(person.id)),
        position: positionOf(String(person.id), index + 1),
      })),
    ],
    tasks: tasksResult.rows.map(toBoardTask),
    audit_logs: logsResult.rows,
    role: admin ? "manager" : "team",
    current_user_id: user.id,
  };
}

export async function mutateTask(input: TaskMutationInput, user: JwtUser) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.action === "create") {
      const title = cleanText(input.title, "Titulo", 240);
      const notes = cleanText(input.notes ?? "", "Observacao", 10000, false);
      const checklist = cleanChecklist(input.checklist ?? []);
      const dueDate = cleanDueDate(input.due_date);
      const dueTime = cleanDueTime(input.due_time);
      const priority = cleanPriority(input.priority);
      const assigned = await assignment(client, input.person_id);
      const result = await client.query<TaskRow>(
        `INSERT INTO tasks (
           title, notes, checklist, audience, assignee_user_id, due_date, due_time, priority, created_by_user_id
         ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
         RETURNING id, title, notes, checklist, audience, assignee_user_id,
                   due_date::text, due_time::text, status, priority, created_by_user_id,
                   created_at::text, updated_at::text, completed_at::text, version`,
        [title, notes, JSON.stringify(checklist), assigned.audience, assigned.assigneeUserId, dueDate, dueTime, priority, user.id],
      );
      const task = result.rows[0];
      if (!task) throw new HttpError(500, "Nao foi possivel criar a tarefa");
      await addAudit(client, user, task, "created", {
        audience: assigned.audience,
        assignee_user_id: assigned.assigneeUserId,
        due_date: dueDate,
        due_time: dueTime,
        priority,
      });
      await client.query("COMMIT");
      return { id: task.id };
    }

    const id = cleanText(input.id, "Tarefa", 80);
    const currentResult = await client.query<TaskRow>(
        `SELECT id, title, notes, checklist, images, audience, assignee_user_id,
              due_date::text, due_time::text, status, priority, created_by_user_id,
              created_at::text, updated_at::text, completed_at::text, version
       FROM tasks WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) throw new HttpError(404, "Tarefa nao encontrada");
    if (input.version !== current.version) {
      throw new HttpError(409, "Essa tarefa mudou em outra tela. Atualize e tente novamente");
    }

    if (input.action === "priority") {
      if (!isAdmin(user)) throw new HttpError(403, "Somente administradores podem alterar a prioridade");
      const priority = cleanPriority(input.priority);
      await client.query("UPDATE tasks SET priority = $1, updated_at = NOW(), version = version + 1 WHERE id = $2", [priority, id]);
      await addAudit(client, user, current, "updated", { previous: { priority: current.priority }, current: { priority } });
      await client.query("COMMIT");
      return { id };
    }

    if (input.action === "details") {
      const ownsPrivateTask = current.audience === "user" && current.assignee_user_id === user.id;
      if (!isAdmin(user) && !ownsPrivateTask) throw new HttpError(404, "Tarefa nao encontrada");
      const notes = cleanText(input.notes ?? "", "Observacao", 10000, false);
      const checklist = cleanChecklist(input.checklist ?? []);
      const images = cleanImages(input.images ?? current.images ?? []);
      const priority = input.priority === undefined ? current.priority : cleanPriority(input.priority);
      if (!isAdmin(user) && priority !== current.priority) throw new HttpError(403, "Somente administradores podem alterar a prioridade");
      await client.query(
        `UPDATE tasks
         SET notes = $1, checklist = $2::jsonb, images = $3::jsonb, priority = $4, updated_at = NOW(), version = version + 1
         WHERE id = $5`,
        [notes, JSON.stringify(checklist), JSON.stringify(images), priority, id],
      );
      await addAudit(client, user, current, "details_updated", {
        notes_changed: notes !== current.notes,
        checklist_total: checklist.length,
        checklist_done: checklist.filter((item) => item.done).length,
        previous_priority: current.priority,
        priority,
      });
      await client.query("COMMIT");
      return { id };
    }

    if (input.action === "notify") {
      if (!isAdmin(user)) throw new HttpError(403, "Somente administradores podem enviar cobrancas");
      if (current.status === "done") throw new HttpError(400, "Essa tarefa ja foi concluida");
      if (current.audience !== "user" || !current.assignee_user_id) {
        throw new HttpError(400, "Escolha uma tarefa atribuida a uma pessoa");
      }

      const recipientResult = await client.query<{ full_name: string; whatsapp_phone: string | null }>(
        "SELECT full_name, whatsapp_phone FROM profiles WHERE id = $1 AND is_active = true",
        [current.assignee_user_id],
      );
      const recipient = recipientResult.rows[0];
      const destination = recipient?.whatsapp_phone?.replace(/\D/g, "") ?? "";
      if (!recipient || !destination) {
        throw new HttpError(400, "O responsavel nao tem WhatsApp cadastrado");
      }

      const instanceResult = await client.query<{
        id: string;
        provider: string;
        instance_name: string;
        display_label: string | null;
        evolution_base_url: string | null;
        evolution_api_key: string | null;
        uazapi_base_url: string | null;
        uazapi_token: string | null;
      }>(
        `SELECT id, provider, instance_name, display_label,
                evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
         FROM whatsapp_instances
         WHERE status = 'ACTIVE'
           AND (
             LOWER(COALESCE(display_label, '')) LIKE '%lili%'
             OR LOWER(COALESCE(assigned_user_name, '')) LIKE '%lili%'
             OR LOWER(COALESCE(instance_name, '')) LIKE '%lili%'
           )
         ORDER BY is_default DESC,
                  (LOWER(TRIM(COALESCE(display_label, ''))) = 'lili assistente') DESC,
                  updated_at DESC
         LIMIT 1`,
      );
      const instance = instanceResult.rows[0];
      if (!instance) {
        throw new HttpError(409, 'O WhatsApp principal da Lili nao foi encontrado ativo');
      }

      const due = current.due_date.split("-").reverse().join("/");
      const when = current.due_time ? `${due} às ${String(current.due_time).slice(0, 5)}` : due;
      const message =
        `Olá, ${recipient.full_name}! 👋\n\n` +
        `Passando para lembrar da sua tarefa: *${current.title}*.\n` +
        `Prazo: *${when}*.\n\n` +
        `Ela ainda está pendente. Por favor, conclua a tarefa ou dê um retorno sobre o andamento.\n\n` +
        `_Lembrete enviado pelo CRM XP através da Lili._`;

      if (instance.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
        await sendUazapiTextMessage(
          { baseUrl: instance.uazapi_base_url, token: instance.uazapi_token },
          destination,
          message,
        );
      } else if (instance.evolution_base_url && instance.evolution_api_key) {
        await sendWhatsappInstanceTextMessage(
          {
            instanceName: instance.instance_name,
            evolutionBaseUrl: instance.evolution_base_url,
            evolutionApiKey: instance.evolution_api_key,
          },
          destination,
          message,
        );
      } else {
        throw new HttpError(409, 'O WhatsApp principal da Lili esta sem credenciais validas');
      }

      await addAudit(client, user, current, "reminder_sent", {
        assignee_user_id: current.assignee_user_id,
        destination_last4: destination.slice(-4),
        instance_id: instance.id,
        instance_label: instance.display_label ?? instance.instance_name,
      });
      await client.query("COMMIT");
      return { id };
    }

    if (input.action === "status") {
      const status = input.status;
      if (!status || !["todo", "doing", "done"].includes(status)) {
        throw new HttpError(400, "Situacao invalida");
      }
      const ownsTask = current.audience === "team" || current.assignee_user_id === user.id;
      if (!isAdmin(user) && !ownsTask) throw new HttpError(404, "Tarefa nao encontrada");
      const forwardChange =
        (current.status === "todo" && (status === "doing" || status === "done")) ||
        (current.status === "doing" && status === "done");
      if (!isAdmin(user) && !forwardChange) {
        throw new HttpError(403, "Somente administradores podem reabrir ou voltar uma tarefa");
      }
      await client.query(
        `UPDATE tasks
         SET status = $1,
             completed_at = CASE WHEN $1 = 'done' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
             updated_at = NOW(), version = version + 1
         WHERE id = $2`,
        [status, id],
      );
      await addAudit(
        client,
        user,
        current,
        status === "done" ? "completed" : current.status === "done" ? "reopened" : "status_changed",
        { from: current.status, to: status },
      );
    } else if (input.action === "return") {
      if (!isAdmin(user) && current.assignee_user_id !== user.id) throw new HttpError(403, "Somente o responsável pode devolver a tarefa");
      if (current.audience !== "user" || !current.created_by_user_id || current.created_by_user_id === current.assignee_user_id) throw new HttpError(400, "Esta tarefa não pode ser devolvida");
      await client.query("UPDATE tasks SET assignee_user_id = $1, status = 'todo', completed_at = NULL, updated_at = NOW(), version = version + 1 WHERE id = $2", [current.created_by_user_id, id]);
      await addAudit(client, user, current, "returned", { returned_to: current.created_by_user_id });
    } else if (input.action === "delete") {
      if (!isAdmin(user) && current.created_by_user_id !== user.id) {
        throw new HttpError(403, "Voce so pode excluir tarefas criadas por voce");
      }
      await client.query(
        "UPDATE tasks SET deleted_at = NOW(), updated_at = NOW(), version = version + 1 WHERE id = $1",
        [id],
      );
      await addAudit(client, user, current, "deleted", {});
    } else if (input.action === "edit" || input.action === "move") {
      if (!isAdmin(user)) throw new HttpError(403, "Somente administradores podem editar tarefas");
      const assigned = await assignment(client, input.person_id);
      if (input.action === "move") {
        await client.query(
          `UPDATE tasks SET audience = $1, assignee_user_id = $2,
                  updated_at = NOW(), version = version + 1 WHERE id = $3`,
          [assigned.audience, assigned.assigneeUserId, id],
        );
        await addAudit(client, user, current, "assigned", {
          from: current.audience === "team" ? TEAM_PERSON_ID : current.assignee_user_id,
          to: input.person_id,
        });
      } else {
        const title = cleanText(input.title, "Titulo", 240);
        const notes = cleanText(input.notes ?? "", "Observacao", 10000, false);
        const dueDate = cleanDueDate(input.due_date);
        const dueTime = cleanDueTime(input.due_time);
        const priority = cleanPriority(input.priority);
        await client.query(
          `UPDATE tasks SET title = $1, notes = $2, audience = $3,
                  assignee_user_id = $4, due_date = $5, due_time = $6, priority = $7,
                  updated_at = NOW(), version = version + 1 WHERE id = $8`,
          [title, notes, assigned.audience, assigned.assigneeUserId, dueDate, dueTime, priority, id],
        );
        await addAudit(client, user, { id, title }, "updated", {
          previous: {
            title: current.title,
            audience: current.audience,
            assignee_user_id: current.assignee_user_id,
            due_date: current.due_date,
            due_time: current.due_time,
            priority: current.priority,
          },
          current: {
            title,
            audience: assigned.audience,
            assignee_user_id: assigned.assigneeUserId,
            due_date: dueDate,
            due_time: dueTime,
            priority,
          },
        });
      }
    } else {
      throw new HttpError(400, "Acao invalida");
    }

    await client.query("COMMIT");
    return { id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type TaskNotificationEvent = {
  id: string;
  author_user_id: string | null;
  author_name: string;
  author_photo?: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type TaskNotificationSource = {
  id: string;
  title: string;
  created_by_user_id: string;
  person_ids?: string[];
  person_id: string;
  audit_history: TaskNotificationEvent[];
};

export type TaskNotification = {
  id: string;
  taskId: string;
  taskTitle: string;
  authorUserId: string | null;
  authorName: string;
  authorPhoto: string | null;
  message: string;
  createdAt: string;
};

function messageFor(event: TaskNotificationEvent) {
  if (event.action === "created") return "atribuiu uma nova tarefa a você";
  if (event.action === "assigned") return "alterou os responsáveis da tarefa";
  if (event.action === "commented") return "enviou uma mensagem na tarefa";
  if (event.action === "returned") return "devolveu a tarefa para você";
  if (event.action === "completed") return "concluiu a tarefa";
  if (event.action === "reopened") return "reabriu a tarefa";
  if (event.action === "details_updated") return "atualizou descrição, anexos ou checklist";
  if (event.action === "status_changed") {
    const from = event.details.from === "doing" ? "em andamento" : event.details.from === "review" ? "em revisão" : event.details.from === "done" ? "concluída" : "a fazer";
    const to = event.details.to === "doing" ? "em andamento" : event.details.to === "review" ? "em revisão" : event.details.to === "done" ? "concluída" : "a fazer";
    return `alterou o status de ${from} para ${to}`;
  }
  return "atualizou a tarefa";
}

export function taskNotifications(tasks: TaskNotificationSource[], currentUserId: string): TaskNotification[] {
  return tasks.flatMap((task) => {
    const isAssignee = (task.person_ids?.length ? task.person_ids : [task.person_id]).includes(currentUserId);
    const isCreator = task.created_by_user_id === currentUserId;
    if (!isAssignee && !isCreator) return [];

    return task.audit_history.flatMap((event) => {
      if (event.author_user_id === currentUserId) return [];
      // A criação só é uma notificação para quem recebeu a tarefa; as demais
      // atualizações também são relevantes para quem a criou acompanhar.
      if (event.action === "created" && !isAssignee) return [];
      return [{
        id: event.id,
        taskId: task.id,
        taskTitle: task.title,
        authorUserId: event.author_user_id,
        authorName: event.author_name,
        authorPhoto: event.author_photo ?? null,
        message: `${event.author_name} ${messageFor(event)}`,
        createdAt: event.created_at,
      }];
    });
  }).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

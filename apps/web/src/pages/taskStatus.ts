import type { TaskStatus } from "./TaskStatusPicker";

export function effectiveTaskStatus(task: { status: TaskStatus; my_status?: TaskStatus | null }): TaskStatus {
  // Revisão e conclusão são decisões da tarefa inteira, mesmo quando o
  // responsável ainda tem um status individual antigo no quadro.
  if (task.status === "review" || task.status === "done") return task.status;
  return task.my_status ?? task.status;
}

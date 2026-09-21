import { describe, expect, it } from "vitest";
import { taskNotifications } from "./taskNotifications";

const task = {
  id: "task-1",
  title: "Conferir estoque",
  created_by_user_id: "camila",
  person_id: "felipe",
  person_ids: ["felipe"],
  audit_history: [
    { id: "created", author_user_id: "camila", author_name: "Camila", action: "created", details: {}, created_at: "2026-09-21T10:00:00.000Z" },
    { id: "comment", author_user_id: "camila", author_name: "Camila", action: "commented", details: {}, created_at: "2026-09-21T11:00:00.000Z" },
  ],
};

describe("taskNotifications", () => {
  it("shows new assignments and updates from other people", () => {
    const notifications = taskNotifications([task], "felipe");
    expect(notifications.map(item => item.id)).toEqual(["comment", "created"]);
    expect(notifications[1]?.message).toContain("nova tarefa");
  });

  it("does not notify someone about their own actions", () => {
    expect(taskNotifications([{ ...task, audit_history: [{ ...task.audit_history[0]!, author_user_id: "felipe" }] }], "felipe")).toEqual([]);
  });

  it("notifies the creator when the assignee sends a task to review", () => {
    const notifications = taskNotifications([{ ...task, person_id: "pedro", person_ids: ["pedro"], created_by_user_id: "felipe", audit_history: [{ id: "review", author_user_id: "pedro", author_name: "Pedro", action: "status_changed", details: { from: "doing", to: "review" }, created_at: "2026-09-21T12:00:00.000Z" }] }], "felipe");
    expect(notifications[0]?.message).toContain("em revisão");
  });
});

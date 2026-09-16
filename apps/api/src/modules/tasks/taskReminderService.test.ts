import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery, sendEvolution, sendUazapi } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  sendEvolution: vi.fn(),
  sendUazapi: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({ pool: { query: poolQuery } }));
vi.mock("../whatsapp/evolutionService.js", () => ({ sendWhatsappInstanceTextMessage: sendEvolution }));
vi.mock("../whatsapp/uazapiService.js", () => ({ sendUazapiTextMessage: sendUazapi }));

import {
  getTaskAutoMessageSettings,
  sendOverdueTaskReminders,
  sendTaskAssignmentNotification,
  setTaskReminderPaused,
} from "./taskReminderService.js";

const lili = {
  provider: "UAZAPI",
  instance_name: "lili",
  display_label: "Lili",
  evolution_base_url: null,
  evolution_api_key: null,
  uazapi_base_url: "https://uazapi.test",
  uazapi_token: "token",
};

/** Responde cada consulta pelo trecho de SQL, sem depender da ordem. */
function routeQueries(settings: Record<string, boolean> | null, extra: (sql: string) => unknown = () => ({ rows: [] })) {
  poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM task_board_settings")) return { rows: settings ? [{ value: settings }] : [] };
    if (sql.includes("FROM whatsapp_instances")) return { rows: [lili] };
    return extra(sql);
  });
}

describe("taskReminderService", () => {
  beforeEach(() => {
    poolQuery.mockReset();
    sendEvolution.mockReset();
    sendUazapi.mockReset();
  });

  it("keeps every automatic message on when nothing was saved", async () => {
    routeQueries(null);
    await expect(getTaskAutoMessageSettings()).resolves.toEqual({ assignment: true, review: true, return: true, overdue: true });
  });

  it("does not send a new-task notice when that message is turned off", async () => {
    routeQueries({ assignment: false });
    const sent = await sendTaskAssignmentNotification({
      recipientName: "Pedro", recipientPhone: "+55 11 99999-0000", taskTitle: "Conferir estoque",
      dueDate: "2026-09-20", dueTime: null, taskId: "t1",
    });
    expect(sent).toBe(false);
    expect(sendUazapi).not.toHaveBeenCalled();
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO task_auto_message_log"),
      expect.arrayContaining(["assignment", "skipped"]),
    );
  });

  it("sends a new-task notice while it is on", async () => {
    routeQueries({ assignment: true });
    await sendTaskAssignmentNotification({
      recipientName: "Pedro", recipientPhone: "+55 11 99999-0000", taskTitle: "Conferir estoque",
      dueDate: "2026-09-20", dueTime: "14:30:00", taskId: "t1",
    });
    expect(sendUazapi).toHaveBeenCalledWith(expect.anything(), "5511999990000", expect.stringContaining("Prazo: *20/09/2026 às 14:30*"));
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO task_auto_message_log"),
      expect.arrayContaining(["assignment", "sent", "t1", "Conferir estoque"]),
    );
  });

  it("skips overdue reminders without marking them as sent when turned off", async () => {
    routeQueries({ overdue: false });
    await expect(sendOverdueTaskReminders()).resolves.toEqual({ sent: 0, reason: "disabled" });
    expect(poolQuery).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE task_assignees"));
  });

  it("leaves paused assignees out of the overdue run", async () => {
    routeQueries({}, (sql) => (sql.includes("UPDATE task_assignees")
      ? { rows: [{ task_id: "t1", user_id: "u1", title: "Conferir estoque", due_date: "2026-09-10", full_name: "Pedro", whatsapp_phone: "5511999990000" }] }
      : { rows: [] }));
    await expect(sendOverdueTaskReminders()).resolves.toEqual({ sent: 1 });
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("NOT ta.reminders_paused"));
    expect(sendUazapi).toHaveBeenCalledWith(expect.anything(), "5511999990000", expect.stringContaining("venceu em *10/09/2026*"));
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO task_auto_message_log"),
      expect.arrayContaining(["overdue", "sent", "t1", "u1"]),
    );
  });

  it("reports a missing assignee when pausing", async () => {
    poolQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(setTaskReminderPaused("t1", "u1", true)).rejects.toMatchObject({ statusCode: 404 });
  });
});

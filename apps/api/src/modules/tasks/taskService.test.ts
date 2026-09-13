import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery, clientQuery, release, sendEvolution, sendUazapi } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  sendEvolution: vi.fn(),
  sendUazapi: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: {
    query: poolQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release })),
  },
}));
vi.mock("../whatsapp/evolutionService.js", () => ({ sendWhatsappInstanceTextMessage: sendEvolution }));
vi.mock("../whatsapp/uazapiService.js", () => ({ sendUazapiTextMessage: sendUazapi }));

import { getTaskBoard, mutateTask, setTaskHiddenPeople, setTaskPersonVisible } from "./taskService.js";
import type { JwtUser } from "../platform/authService.js";

const seller: JwtUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "pedro@example.com",
  name: "Pedro",
  role: "SELLER",
  appRole: "vendas",
};

const admin: JwtUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "felipe@example.com",
  name: "Felipe",
  role: "ADMIN",
  appRole: "admin",
};

const taskRow = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Conferir estoque",
  notes: "",
  checklist: [],
  audience: "user",
  assignee_user_id: seller.id,
  due_date: "2026-09-10",
  due_time: "14:30:00",
  status: "todo",
  priority: "normal",
  created_by_user_id: admin.id,
  created_by_name: "Felipe",
  assignee_has_whatsapp: true,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
  completed_at: null,
  version: 1,
};

describe("taskService", () => {
  beforeEach(() => {
    poolQuery.mockReset();
    poolQuery.mockResolvedValue({ rows: [] });
    clientQuery.mockReset();
    release.mockReset();
    sendEvolution.mockReset();
    sendUazapi.mockReset();
  });

  it("filters a regular user's board to assigned, team, and self-created tasks at the server", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ id: seller.id, full_name: "Pedro", created_at: "2026-01-01" }] })
      .mockResolvedValueOnce({ rows: [taskRow] });

    const board = await getTaskBoard(seller);

    expect(poolQuery.mock.calls[1]?.[1]).toEqual([false, seller.id]);
    expect(poolQuery.mock.calls[1]?.[0]).toContain("OR t.created_by_user_id = $2::uuid");
    expect(board.tasks).toHaveLength(1);
    expect(board.tasks[0]).toMatchObject({ created_by_user_id: admin.id, created_by_name: "Felipe" });
    expect(board.audit_logs).toEqual([]);
    expect(board.people[0]).toMatchObject({ id: "team", name: "Time" });
  });

  it("persists Time outside the board for every user", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ value: [] }] })
      .mockResolvedValueOnce({ rows: [] });

    await setTaskPersonVisible("team", false);

    expect(String(poolQuery.mock.calls[0]?.[0])).toContain("task_board_settings");
    expect(String(poolQuery.mock.calls[0]?.[0])).not.toContain("FROM profiles");
    expect(poolQuery.mock.calls[1]?.[1]).toEqual([JSON.stringify(["team"])]);
  });

  it("persists bringing Time back to the board", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });

    await setTaskHiddenPeople([]);

    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ('hidden_people', $1::jsonb)"),
      [JSON.stringify([])],
    );
  });

  it("allows a regular user to create a private task and records who assigned it", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: admin.id }] })
      .mockResolvedValueOnce({ rows: [{ ...taskRow, assignee_user_id: admin.id, created_by_user_id: seller.id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await mutateTask(
      {
        action: "create",
        title: "Privada",
        person_id: admin.id,
        due_date: "2026-09-10",
      },
      seller,
    );

    const auditCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO task_audit_logs"),
    );
    expect(auditCall?.[1]?.[1]).toBe(seller.id);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("lets an administrator switch to the private mine view", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await getTaskBoard(admin, "mine");

    expect(poolQuery.mock.calls[1]?.[1]).toEqual([false, admin.id]);
  });

  it("allows the assignee to complete a private task and records the actor", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [taskRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await mutateTask(
      { action: "status", id: taskRow.id, version: 1, status: "done" },
      seller,
    );

    const auditCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO task_audit_logs"),
    );
    expect(auditCall?.[1]).toEqual([
      taskRow.id,
      seller.id,
      "completed",
      taskRow.title,
      JSON.stringify({ from: "todo", to: "done", individual: false }),
    ]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("allows the assignee to update notes and checklist on their private task", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [taskRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await mutateTask(
      {
        action: "details",
        id: taskRow.id,
        version: 1,
        notes: "Cliente confirmou o retorno.",
        checklist: [{ id: "check-1", text: "Confirmar com o cliente", done: true }],
      },
      seller,
    );

    const updateCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("checklist = $2::jsonb"));
    expect(updateCall?.[1]?.[1]).toBe(JSON.stringify([{ id: "check-1", text: "Confirmar com o cliente", done: true }]));
    const auditCall = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO task_audit_logs"));
    expect(auditCall?.[1]?.slice(1, 4)).toEqual([seller.id, "details_updated", taskRow.title]);
  });

  it("allows a regular user to delete only a task they created", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...taskRow, created_by_user_id: seller.id }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await mutateTask({ action: "delete", id: taskRow.id, version: 1 }, seller);

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks SET deleted_at = NOW()"),
      [taskRow.id],
    );
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("blocks a different user from changing a private task", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [taskRow] })
      .mockResolvedValueOnce({ rows: [] });

    const other = { ...seller, id: "44444444-4444-4444-8444-444444444444", name: "Amanda" };
    await expect(
      mutateTask({ action: "status", id: taskRow.id, version: 1, status: "done" }, other),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("only gives administrators the all-team scope", async () => {
    await getTaskBoard(seller, "all");
    expect(poolQuery.mock.calls[1]?.[1]).toEqual([false, seller.id]);
    poolQuery.mockClear();
    await getTaskBoard(admin, "all");
    expect(poolQuery.mock.calls[1]?.[1]).toEqual([true, admin.id]);
  });

  it("does not let a non-admin creator change the assignee's private notes", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...taskRow, assignee_user_id: admin.id, created_by_user_id: seller.id }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(mutateTask({ action: "details", id: taskRow.id, version: 1, notes: "Private" }, seller))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE tasks"))).toBe(false);
  });

  it("updates only priority inline and audits the administrator", async () => {
    clientQuery.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [taskRow] });
    await mutateTask({ action: "priority", id: taskRow.id, version: 1, priority: "urgent" }, admin);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE tasks SET priority"), ["urgent", taskRow.id]);
    const audit = clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO task_audit_logs"));
    expect(audit?.[1]).toEqual([taskRow.id, admin.id, "updated", taskRow.title, JSON.stringify({ previous: { priority: "normal" }, current: { priority: "urgent" } })]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it.each(["priority", "details"] as const)("blocks a non-admin priority change through %s", async action => {
    clientQuery.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [taskRow] });
    await expect(mutateTask({ action, id: taskRow.id, version: 1, priority: "urgent", notes: "Notes" }, seller)).rejects.toMatchObject({ statusCode: 403 });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE tasks"))).toBe(false);
  });

  it("rejects a stale inline change without overwriting another edit", async () => {
    clientQuery.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [taskRow] });
    await expect(mutateTask({ action: "priority", id: taskRow.id, version: 0, priority: "high" }, admin)).rejects.toMatchObject({ statusCode: 409 });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE tasks"))).toBe(false);
  });

  it("saves notes, checklist and priority together for an administrator", async () => {
    clientQuery.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [taskRow] });
    await mutateTask({ action: "details", id: taskRow.id, version: 1, priority: "high", notes: "Acompanhar", checklist: [] }, admin);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("checklist = $2::jsonb"),
      ["Acompanhar", "[]", "[]", "high", taskRow.id],
    );
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects an invalid inline priority", async () => {
    clientQuery.mockResolvedValue({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [taskRow] });
    await expect(mutateTask({
      action: "priority", id: taskRow.id, version: 1,
      // @ts-expect-error Deliberately malformed HTTP input must be rejected at runtime.
      priority: "invalid",
    }, admin)).rejects.toMatchObject({ statusCode: 400 });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE tasks"))).toBe(false);
  });

  it("sends a manual reminder through Lili and records the administrator", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [taskRow] })
      .mockResolvedValueOnce({ rows: [{ full_name: "Pedro", whatsapp_phone: "5511999999999" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            provider: "EVOLUTION",
            instance_name: "lili",
            display_label: "Lili Assistente",
            evolution_base_url: "https://evolution.example.com",
            evolution_api_key: "secret",
            uazapi_base_url: null,
            uazapi_token: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    sendEvolution.mockResolvedValue({ key: { id: "message-1" } });

    await mutateTask({ action: "notify", id: taskRow.id, version: 1 }, admin);

    expect(sendEvolution).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: "lili" }),
      "5511999999999",
      expect.stringContaining("Conferir estoque"),
    );
    const auditCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO task_audit_logs"),
    );
    expect(auditCall?.[1]?.slice(1, 4)).toEqual([admin.id, "reminder_sent", taskRow.title]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
  });
});

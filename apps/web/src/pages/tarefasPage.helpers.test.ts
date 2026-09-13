import { describe, expect, it } from "vitest";
import { personBelongsToList, taskBelongsToList } from "./tarefasPage.helpers";

const mine = {
  manager: true,
  adminScope: "mine" as const,
  listScope: "received" as const,
  currentUserId: "admin-id",
};

describe("tarefas page list visibility", () => {
  it("shows Time in Minhas tarefas when the visible people list contains it", () => {
    expect(personBelongsToList("team", mine)).toBe(true);
    expect(personBelongsToList("admin-id", mine)).toBe(true);
    expect(personBelongsToList("other-id", mine)).toBe(false);
  });

  it("includes team tasks among tasks received by the current user", () => {
    expect(taskBelongsToList({ personIds: ["team"], createdByUserId: "other-id" }, mine)).toBe(true);
  });

  it("shows Time in Atribuidas por mim without showing tasks created by somebody else", () => {
    const created = { ...mine, listScope: "created" as const };
    expect(personBelongsToList("team", created)).toBe(true);
    expect(taskBelongsToList({ personIds: ["team"], createdByUserId: "admin-id" }, created)).toBe(true);
    expect(taskBelongsToList({ personIds: ["team"], createdByUserId: "other-id" }, created)).toBe(false);
  });
});

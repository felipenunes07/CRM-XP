import { describe, expect, it } from "vitest";
import { effectiveTaskStatus } from "./taskStatus";

describe("effectiveTaskStatus", () => {
  it("shows review even when the assigned user's status is stale", () => {
    expect(effectiveTaskStatus({ status: "review", my_status: "todo" })).toBe("review");
  });

  it("shows a task completed by a manager even when the assignment is stale", () => {
    expect(effectiveTaskStatus({ status: "done", my_status: "doing" })).toBe("done");
  });

  it("keeps individual progress while the overall task is still open", () => {
    expect(effectiveTaskStatus({ status: "doing", my_status: "done" })).toBe("done");
    expect(effectiveTaskStatus({ status: "todo", my_status: null })).toBe("todo");
  });
});

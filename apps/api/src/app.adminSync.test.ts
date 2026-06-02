import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const { enqueueOlistSyncJobMock, runPrimarySyncMock } = vi.hoisted(() => ({
  enqueueOlistSyncJobMock: vi.fn(),
  runPrimarySyncMock: vi.fn(),
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (request: any, _response: unknown, next: () => void) => {
    request.user = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
      permissions: ["settings.manage"],
    };
    next();
  },
  requirePermission:
    () =>
    (_request: unknown, _response: unknown, next: () => void) =>
      next(),
  requireRole:
    () =>
    (_request: unknown, _response: unknown, next: () => void) =>
      next(),
}));

vi.mock("./modules/platform/jobs.js", () => ({
  enqueueHistoryImportJob: vi.fn(),
  enqueueOlistSyncJob: enqueueOlistSyncJobMock,
}));

vi.mock("./modules/platform/syncService.js", () => ({
  runPrimarySync: runPrimarySyncMock,
}));

import { createApp } from "./app.js";

describe("POST /api/admin/sync", () => {
  afterEach(() => {
    enqueueOlistSyncJobMock.mockReset();
    runPrimarySyncMock.mockReset();
  });

  it("queues the primary sync without blocking the request", async () => {
    enqueueOlistSyncJobMock.mockResolvedValue({ id: "job-1" });

    const response = await request(createApp()).post("/api/admin/sync").send({ mode: "queue" });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ mode: "queue", jobId: "job-1" });
    expect(enqueueOlistSyncJobMock).toHaveBeenCalledTimes(1);
    expect(runPrimarySyncMock).not.toHaveBeenCalled();
  });

  it("still supports direct sync for explicit administrative runs", async () => {
    runPrimarySyncMock.mockResolvedValue({ ok: true });

    const response = await request(createApp()).post("/api/admin/sync").send({ mode: "direct" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ mode: "direct", result: { ok: true } });
    expect(runPrimarySyncMock).toHaveBeenCalledWith("manual-dashboard");
    expect(enqueueOlistSyncJobMock).not.toHaveBeenCalled();
  });
});

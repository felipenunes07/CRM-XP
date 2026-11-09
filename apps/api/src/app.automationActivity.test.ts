import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: { id: "test", email: "test@example.invalid", name: "Teste", role: "ADMIN", permissions: ["automations.view"] },
  get: vi.fn(), approve: vi.fn(), reject: vi.fn(), run: vi.fn(),
}));
vi.mock("./modules/crm/automationActivityService.js", () => ({ getAutomationActivity: state.get }));
vi.mock("./modules/crm/automationService.js", async original => ({ ...await original<object>(), approveMessageAutomationRun: state.approve, rejectMessageAutomationRun: state.reject, runMessageAutomationNow: state.run }));
vi.mock("./modules/platform/authMiddleware.js", async original => ({
  ...await original<object>(), requireAuth: (req: any, _res: unknown, next: () => void) => { req.user = state.user; next(); },
}));
import { createApp } from "./app.js";
describe("automation activity access and filters", () => {
  beforeEach(() => { vi.clearAllMocks(); state.user.permissions = ["automations.view"]; state.get.mockResolvedValue({ items: [], total: 0 }); });
  it("lets viewers read delivery results without preparing or sending anything", async () => {
    const response = await request(createApp()).get("/api/automations/activity?date=2026-11-09&status=SENT&kind=REACTIVATION&search=CL1542&limit=25&offset=25");
    expect(response.status).toBe(200);
    expect(state.get).toHaveBeenCalledWith({ date: "2026-11-09", status: "SENT", kind: "REACTIVATION", search: "CL1542", limit: 25, offset: 25 });
    expect(state.run).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
  });
  it("rejects readers without automations access", async () => {
    state.user.permissions = [];
    expect((await request(createApp()).get("/api/automations/activity?date=2026-11-09")).status).toBe(403);
    expect(state.get).not.toHaveBeenCalled();
  });
  it.each(["date=2026-02-30", "date=invalid", "date=2026-11-09&status=ENQUEUED", "date=2026-11-09&limit=101", "date=2026-11-09&offset=-1", "date=2026-11-09&runId=bad"])("validates query %s", async query => {
    expect((await request(createApp()).get(`/api/automations/activity?${query}`)).status).toBe(400);
    expect(state.get).not.toHaveBeenCalled();
  });
  it.each(["/api/automations/runs/test/approve", "/api/automations/runs/test/reject", "/api/automations/test/run-now"])("requires manage permission for %s even for an admin", async path => {
    expect((await request(createApp()).post(path).send({})).status).toBe(403);
    expect(state.run).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled(); expect(state.reject).not.toHaveBeenCalled();
  });
});

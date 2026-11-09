import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: { id: "test", email: "test@example.invalid", name: "Teste", role: "ADMIN", permissions: ["automations.view", "automations.manage"] },
  get: vi.fn(), save: vi.fn(),
}));
vi.mock("./modules/whatsapp/prospectRemarketingSettings.js", () => ({ getProspectRemarketingSettings: state.get, saveProspectRemarketingSettings: state.save }));
vi.mock("./modules/platform/authMiddleware.js", async original => ({
  ...await original<object>(), requireAuth: (req: any, _res: unknown, next: () => void) => { req.user = state.user; next(); },
}));
import { createApp } from "./app.js";
describe("prospect remarketing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.user.role = "ADMIN"; state.user.permissions = ["automations.view", "automations.manage"];
    state.get.mockResolvedValue({ enabled: true }); state.save.mockResolvedValue({ enabled: false });
  });
  it("reads without changing settings", async () => {
    expect((await request(createApp()).get("/api/automations/prospect-followup")).body).toEqual({ enabled: true });
    expect(state.save).not.toHaveBeenCalled();
  });
  it("saves the submitted configuration", async () => {
    expect((await request(createApp()).put("/api/automations/prospect-followup").send({ enabled: false })).status).toBe(200);
    expect(state.save).toHaveBeenCalledWith({ enabled: false });
  });
  it("respects explicit manage denial for admins", async () => {
    state.user.permissions = ["automations.view"];
    expect((await request(createApp()).put("/api/automations/prospect-followup").send({})).status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("requires a management role even with manage permission", async () => {
    state.user.role = "SALES";
    expect((await request(createApp()).put("/api/automations/prospect-followup").send({})).status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });
  it("protects settings without automations access", async () => {
    state.user.permissions = [];
    expect((await request(createApp()).get("/api/automations/prospect-followup")).status).toBe(403);
    expect(state.get).not.toHaveBeenCalled();
  });
});

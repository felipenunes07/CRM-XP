import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../db/client.js", () => ({ pool: { query: state.query } }));
vi.mock("../../lib/env.js", () => ({ env: { WHATSAPP_PROSPECT_FOLLOWUP_ENABLED: true } }));
import { getProspectRemarketingSettings, saveProspectRemarketingSettings } from "./prospectRemarketingSettings.js";
import { DEFAULT_PROSPECT_MESSAGE } from "./prospectFollowupCore.js";

const input = { enabled: true, first: { daysAfterCreation: 2, message: DEFAULT_PROSPECT_MESSAGE }, second: null };
describe("prospect remarketing settings", () => {
  beforeEach(() => { state.query.mockReset().mockResolvedValue({ rows: [] }); });
  it("returns the existing automation unchanged without writing defaults", async () => {
    expect(await getProspectRemarketingSettings()).toEqual({ ...input, updatedAt: null });
    expect(state.query).toHaveBeenCalledOnce();
    expect(state.query.mock.calls[0]?.[0]).toMatch(/^SELECT/);
  });
  it("persists only settings and reads back both stages", async () => {
    const value = { ...input, second: { enabled: true, daysAfterFirst: 4, message: "Olá {cliente}, vamos separar seu pedido?" } };
    const updatedAt = "2026-11-09T15:00:00.000Z";
    state.query.mockResolvedValueOnce({ rows: [{ updated_at: updatedAt }] }).mockResolvedValueOnce({ rows: [{ cursor_value: JSON.stringify(value), updated_at: updatedAt }] });
    expect(await saveProspectRemarketingSettings(value)).toEqual({ ...value, updatedAt });
    expect(await getProspectRemarketingSettings()).toEqual({ ...value, updatedAt });
    expect(state.query.mock.calls[0]?.[1]).toEqual(["prospect_group_followup_settings", JSON.stringify(value)]);
  });
  it.each([
    { ...input, first: { ...input.first, daysAfterCreation: 0 } },
    { ...input, first: { ...input.first, daysAfterCreation: 1.5 } },
    { ...input, first: { ...input.first, daysAfterCreation: 366 } },
    { ...input, first: { ...input.first, message: "Sem marcação" } },
    { ...input, first: { ...input.first, message: "{cliente}" + "x".repeat(4000) } },
    { ...input, second: { enabled: true, daysAfterFirst: 2, message: "" } },
    { ...input, second: { enabled: true, daysAfterFirst: 2, message: "Sem marcação" } },
    { ...input, second: { enabled: false, daysAfterFirst: -1, message: "" } },
  ])("rejects invalid settings before any database write", async value => {
    await expect(saveProspectRemarketingSettings(value)).rejects.toMatchObject({ statusCode: 400 });
    expect(state.query).not.toHaveBeenCalled();
  });
  it("allows saving an unfinished second message while it is paused", async () => {
    state.query.mockResolvedValue({ rows: [{ updated_at: new Date() }] });
    await expect(saveProspectRemarketingSettings({ ...input, second: { enabled: false, daysAfterFirst: 3, message: "" } })).resolves.toMatchObject({ second: { enabled: false } });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn(), ensure: vi.fn() }));
vi.mock("../../db/client.js", () => ({ pool: { query: state.query } }));
vi.mock("./automationService.js", () => ({ ensureAutomationTables: state.ensure }));
import { AUTOMATION_ACTIVITY_SQL, getAutomationActivity } from "./automationActivityService.js";
describe("automation activity query", () => {
  beforeEach(() => { vi.clearAllMocks(); state.query.mockResolvedValue({ rows: [{ summary: { sent: 2, waiting: 1, failed: 0, notSent: 0, awaitingApproval: 0 }, total: 3, items: [] }] }); });
  it("uses read-only SQL with bound filters and includes totals on empty pages", async () => {
    const result = await getAutomationActivity({ date: "2026-11-09", search: " CL1542 ", offset: 25 });
    expect(result).toMatchObject({ date: "2026-11-09", total: 3, summary: { sent: 2 } });
    expect(state.ensure).toHaveBeenCalledOnce();
    expect(state.query).toHaveBeenCalledWith(AUTOMATION_ACTIVITY_SQL, ["2026-11-09", "ALL", "CL1542", null, "ALL", 25, 25]);
  });
  it("passes explicit run, kind, pagination and status independently", async () => {
    await getAutomationActivity({ date: "2026-11-09", kind: "PROSPECT", status: "FAILED", search: "'_%", runId: "run", limit: 10, offset: 40 });
    expect(state.query).toHaveBeenCalledWith(AUTOMATION_ACTIVITY_SQL, ["2026-11-09", "PROSPECT", "'_%", "run", "FAILED", 10, 40]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), clientQuery: vi.fn(), release: vi.fn(), send: vi.fn(), performance: vi.fn(),
  env: {
    WHATSAPP_ATTENDANCE_REPORT_ENABLED: true,
    WHATSAPP_ATTENDANCE_REPORT_GROUP_JID: "120363024604307554@g.us",
    WHATSAPP_ATTENDANCE_REPORT_INSTANCE_ID: "Lili",
    WHATSAPP_REACTIVATION_REPORT_ENABLED: true,
  },
}));
vi.mock("../../db/client.js", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../../lib/env.js", () => ({ env: mocks.env }));
vi.mock("../../lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../crm/offboardingAlertService.js", () => ({ sendToGroup: mocks.send }));
vi.mock("./whatsappCampaignService.js", () => ({ getWhatsappCampaignPerformance: mocks.performance }));
vi.mock("./whatsappMonitorService.js", () => ({ getWhatsappGroupsCreatedOnDate: vi.fn().mockResolvedValue([]), getWhatsappDailySummaryReport: vi.fn().mockResolvedValue({
  date: "2026-11-07", newCustomersCount: 0, recoveredCustomersCount: 0, totalMessagesSent: 0, totalMessagesReceived: 0, agents: [],
}) }));

import { runScheduledAttendanceReport } from "./whatsappAttendanceReportService.js";
import { formatReactivationGroupReport, getReactivationReportCustomers, runScheduledReactivationReport } from "./whatsappReactivationReportService.js";

const recipient = (overrides = {}) => ({
  id: "recipient-1", campaign_id: "campaign-30", customer_id: "customer-1", customer_code: "CL1175",
  customer_display_name: "Jonathan", source_name: "Grupo Jonathan", jid: "group-1@g.us", status: "SENT", stage: 30,
  ...overrides,
});

describe("daily Lili reactivation report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.WHATSAPP_REACTIVATION_REPORT_ENABLED = true;
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.performance.mockResolvedValue({ recipients: [] });
    mocks.send.mockResolvedValue({ id: "message-1" });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
    const cursors = new Map<string, string>();
    mocks.clientQuery.mockImplementation(async (sql: string, params: string[] = []) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.startsWith("SELECT cursor_value")) return { rows: cursors.has(params[0]!) ? [{ cursor_value: cursors.get(params[0]!) }] : [] };
      if (sql.includes("INSERT INTO sync_cursors") || sql.startsWith("UPDATE sync_cursors")) cursors.set(params[0]!, params[1]!);
      return { rows: [] };
    });
  });

  it("shows the inactivity stage on every failure and excludes failures from the sent totals", () => {
    const message = formatReactivationGroupReport("2026-11-07", [
      { key: "1", stage: 30, code: "CL1175", name: "Jonathan", status: "SENT", responded: false },
      { key: "2", stage: 30, code: "CL1507", name: "Lucas Freitas", status: "SENT", responded: true },
      { key: "3", stage: 30, code: "CL1542", name: "Sergio Melo Cell", status: "FAILED", responded: false },
      { key: "4", stage: 60, code: "CL2000", name: "Cliente 60", status: "FAILED", responded: false },
      { key: "5", stage: 90, code: "CL3000", name: "Cliente 90", status: "FAILED", responded: false },
    ]);
    expect(message).toContain("_07/11/2026_");
    expect(message).toContain("30 dias sem comprar — 2 clientes");
    expect(message).toContain("CL1175 — Jonathan\n  ⏳ Aguardando resposta");
    expect(message).toContain("CL1507 — Lucas Freitas\n  💬 Respondeu");
    expect(message).toContain("60 dias sem comprar*\nNenhum envio hoje.");
    expect(message).toContain("90 dias sem comprar*\nNenhum envio hoje.");
    expect(message).toContain("Clientes com mensagem enviada: 2");
    expect(message).toContain("Clientes que responderam: 1");
    expect(message).toContain("Aguardando resposta: 1");
    expect(message).toContain("*Falha no envio — 30 dias sem comprar:*\n• CL1542 — Sergio Melo Cell");
    expect(message).toContain("*Falha no envio — 60 dias sem comprar:*\n• CL2000 — Cliente 60");
    expect(message).toContain("*Falha no envio — 90 dias sem comprar:*\n• CL3000 — Cliente 90");
  });

  it("deduplicates customer groups, recognizes a response from any group, and keeps a successful retry", async () => {
    mocks.query.mockResolvedValue({ rows: [
      recipient({ id: "failed", status: "FAILED" }),
      recipient(),
      recipient({ id: "recipient-2", jid: "group-2@g.us" }),
    ] });
    mocks.performance.mockResolvedValue({ recipients: [
      { recipientId: "recipient-2", responded: true, firstResponseAt: "2026-11-07T12:14:00Z" },
    ] });
    const clients = await getReactivationReportCustomers("2026-11-07", new Date("2026-11-07T15:45:00Z"));
    expect(clients).toEqual([{ key: "customer-1", stage: 30, code: "CL1175", name: "Jonathan", status: "SENT", responded: true }]);
    expect(mocks.performance).toHaveBeenCalledOnce();
    expect(mocks.performance).toHaveBeenCalledWith("campaign-30");
  });

  it("does not attribute responses after the report cutoff", async () => {
    mocks.query.mockResolvedValue({ rows: [recipient()] });
    mocks.performance.mockResolvedValue({ recipients: [
      { recipientId: "recipient-1", responded: true, firstResponseAt: "2026-11-07T16:00:00Z" },
    ] });
    expect(await getReactivationReportCustomers("2026-11-07", new Date("2026-11-07T15:45:00Z")))
      .toMatchObject([{ responded: false }]);
    mocks.performance.mockResolvedValue({ recipients: [
      { recipientId: "recipient-1", responded: true, firstResponseAt: "2026-11-08T15:00:00Z" },
    ] });
    expect(await getReactivationReportCustomers("2026-11-07", new Date("2026-11-09T15:45:00Z")))
      .toMatchObject([{ responded: false }]);
  });

  it("reports a day without sends and does not load campaign performance unnecessarily", async () => {
    expect(await getReactivationReportCustomers("2026-11-07")).toEqual([]);
    expect(mocks.performance).not.toHaveBeenCalled();
    const message = formatReactivationGroupReport("2026-11-07", []);
    expect(message.match(/Nenhum envio hoje\./g)).toHaveLength(3);
    expect(message).toContain("Clientes com mensagem enviada: 0");
    expect(message).not.toContain("Falha no envio");
  });

  it.each([
    ["2026-11-06T19:44:59Z", false],
    ["2026-11-06T19:45:00Z", true],
    ["2026-11-06T19:59:59Z", true],
    ["2026-11-06T20:00:00Z", false],
    ["2026-11-07T15:44:59Z", false],
    ["2026-11-07T15:45:00Z", true],
    ["2026-11-07T16:00:00Z", false],
    ["2026-11-07T19:45:00Z", false],
    ["2026-11-08T15:44:59Z", false],
    ["2026-11-08T15:45:00Z", true],
    ["2026-11-08T15:59:59Z", true],
    ["2026-11-08T16:00:00Z", false],
    ["2026-11-08T19:45:00Z", false],
    ["2026-11-09T19:45:00Z", true],
  ])("applies the 16:45/12:45 Brasilia schedule at %s", async (date, sent) => {
    expect((await runScheduledReactivationReport(new Date(date))).sent).toBe(sent);
    expect(mocks.send).toHaveBeenCalledTimes(sent ? 1 : 0);
  });

  it("keeps the two daily messages independent and does not duplicate the new summary", async () => {
    const now = new Date("2026-11-07T15:55:00Z");
    expect(await runScheduledReactivationReport(now)).toMatchObject({ sent: true });
    expect(await runScheduledReactivationReport(now)).toMatchObject({ reason: "already_claimed" });
    expect(await runScheduledAttendanceReport(now)).toMatchObject({ sent: true });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0]?.[1]).toContain("Resumo da Automação — Lili");
    expect(mocks.send.mock.calls[1]?.[1]).toContain("Relatório de Atendimento XP");
  });

  it("does not send while the second summary is disabled", async () => {
    mocks.env.WHATSAPP_REACTIVATION_REPORT_ENABLED = false;
    expect(await runScheduledReactivationReport(new Date("2026-11-07T15:45:00Z"))).toMatchObject({ reason: "not_due" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("sends the Sunday reactivation summary once while keeping the attendance report off", async () => {
    expect(await runScheduledReactivationReport(new Date("2026-11-08T15:45:00Z"))).toMatchObject({ sent: true, date: "2026-11-08" });
    expect(await runScheduledReactivationReport(new Date("2026-11-08T15:46:00Z"))).toMatchObject({ reason: "already_claimed" });
    expect(await runScheduledAttendanceReport(new Date("2026-11-08T15:55:00Z"))).toMatchObject({ reason: "not_due" });
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});

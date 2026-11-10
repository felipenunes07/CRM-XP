import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), clientQuery: vi.fn(), release: vi.fn(), send: vi.fn(), summary: vi.fn(),
  env: {
    WHATSAPP_ATTENDANCE_REPORT_ENABLED: true,
    WHATSAPP_ATTENDANCE_REPORT_GROUP_JID: "120363024604307554@g.us",
    WHATSAPP_ATTENDANCE_REPORT_INSTANCE_ID: "Lili",
  },
}));
vi.mock("../../db/client.js", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../../lib/env.js", () => ({ env: mocks.env }));
vi.mock("../../lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("../crm/offboardingAlertService.js", () => ({ sendToGroup: mocks.send }));
vi.mock("./whatsappMonitorService.js", () => ({ getWhatsappDailySummaryReport: mocks.summary, getWhatsappGroupsCreatedOnDate: vi.fn().mockResolvedValue([]) }));

import { formatAttendanceGroupReport, getAttendanceReportSchedule, getLostAttendanceCustomers, previewAttendanceGroupReport, runScheduledAttendanceReport } from "./whatsappAttendanceReportService.js";

const summary = {
  date: "2026-11-06", newCustomersCount: 0, recoveredCustomersCount: 0,
  totalMessagesSent: 437, totalMessagesReceived: 472,
  agents: [
    { agentName: "Thais", sentMessages: 221, groupChatsCount: 6, initiatedCount: 20 },
    { agentName: "Ragnar", sentMessages: 63, groupChatsCount: 37, initiatedCount: 37 },
    { agentName: "Amanda", sentMessages: 54, groupChatsCount: 8, initiatedCount: 17 },
    { agentName: "Suelen", sentMessages: 53, groupChatsCount: 16, initiatedCount: 22 },
    { agentName: "tamires", sentMessages: 46, groupChatsCount: 1, initiatedCount: 7 },
    { agentName: "lili", sentMessages: 0, groupChatsCount: 0, initiatedCount: 0 },
  ],
};

describe("attendance group report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.WHATSAPP_ATTENDANCE_REPORT_ENABLED = true;
    mocks.env.WHATSAPP_ATTENDANCE_REPORT_GROUP_JID = "120363024604307554@g.us";
    mocks.query.mockResolvedValue({ rows: [{ id: "lost-1", customer_code: "CL001", display_name: "Cliente Um" }, { id: "lost-2", customer_code: "CL002", display_name: "Cliente Dois" }, { id: "lost-3", customer_code: null, display_name: "Cliente Sem Código" }] });
    mocks.summary.mockResolvedValue(summary);
    mocks.send.mockResolvedValue({ id: "message-1" });
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
    const cursors = new Map<string, string>();
    mocks.clientQuery.mockImplementation(async (sql: string, params: string[] = []) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.startsWith("SELECT cursor_value")) {
        return { rows: cursors.has(params[0]!) ? [{ cursor_value: cursors.get(params[0]!) }] : [] };
      }
      if (sql.includes("INSERT INTO sync_cursors") || sql.startsWith("UPDATE sync_cursors")) {
        cursors.set(params[0]!, params[1]!);
      }
      return { rows: [] };
    });
  });

  it.each([
    ["2026-11-06T19:54:59Z", false], // Friday, 16:54 Brasilia
    ["2026-11-06T19:55:00Z", true],
    ["2026-11-06T20:09:59Z", true],
    ["2026-11-06T20:10:00Z", false],
    ["2026-11-07T15:54:59Z", false], // Saturday, 12:54 Brasilia
    ["2026-11-07T15:55:00Z", true],
    ["2026-11-07T19:55:00Z", false],
    ["2026-11-08T15:55:00Z", false], // Sunday
    ["2026-11-08T19:55:00Z", false],
    ["2026-11-09T19:55:00Z", true], // Monday
    ["2026-11-09T01:00:00Z", false], // Still Sunday in Brasilia
  ])("checks the Brasilia schedule at %s", (date, due) => {
    expect(getAttendanceReportSchedule(new Date(date)).due).toBe(due);
  });

  it("matches the approved message without exposing private attendance or changing the source", () => {
    const original = structuredClone(summary);
    const message = formatAttendanceGroupReport(summary, 3);
    expect(message).toBe(`📅 *Relatório de Atendimento XP*
_06/11/2026_

📱 *Clientes Novos no Dia:* 0
👥 *Grupos Criados no Dia:* 0
🔄 *Clientes Recuperados no Dia:* 0
📉 *Clientes Perdidos no Dia:* 3

💬 *Resumo de Mensagens:*
📱 Mensagens Enviadas: 437
🧾 Mensagens Recebidas: 472

🌟 *Vendedora Mais Ativa:* Thaís (221 mensagens enviadas)

🏆 *Ranking de Vendedoras e Atendimentos:*

🥇 *Thaís*
💬 Mensagens Enviadas: 221
👥 Grupos Atendidos: 6
✨ Conversas Iniciadas: 20

🥈 *Amanda*
💬 Mensagens Enviadas: 54
👥 Grupos Atendidos: 8
✨ Conversas Iniciadas: 17

🥉 *Suellen*
💬 Mensagens Enviadas: 53
👥 Grupos Atendidos: 16
✨ Conversas Iniciadas: 22

❤️ *Tamires*
💬 Mensagens Enviadas: 46
👥 Grupos Atendidos: 1
✨ Conversas Iniciadas: 7`);
    expect(summary).toEqual(original);
  });

  it("recognizes accents and XP prefixes and keeps all four sellers on a quiet day", () => {
    const message = formatAttendanceGroupReport({ ...summary, agents: [
      { agentName: " XP THAÍS ", sentMessages: 10, groupChatsCount: 2, initiatedCount: 1 },
    ] }, 0);
    expect(message).toContain("Thaís (10 mensagens enviadas)");
    expect(message).toContain("*Suellen*\n💬 Mensagens Enviadas: 0");
    expect(message).toContain("*Amanda*\n💬 Mensagens Enviadas: 0");
    expect(message).toContain("*Tamires*\n💬 Mensagens Enviadas: 0");
  });

  it("lists new customer names, sellers and purchase amounts directly below the count", async () => {
    mocks.summary.mockResolvedValueOnce({
      ...summary, newCustomersCount: 2,
      newCustomersList: [
        { customer_code: "CL2001", display_name: "Cliente Novo", last_attendant: "Amanda", total_amount: "2065.50" },
        { customer_code: null, display_name: "Outro Cliente", last_attendant: "Thais", total_amount: "620.00" },
      ],
    });
    const report = await previewAttendanceGroupReport("2026-11-10");
    expect(report.text).toContain("📱 *Clientes Novos no Dia:* 2\n- CL2001 - Cliente Novo | Amanda | R$ 2.065,50\n- Outro Cliente | Thais | R$ 620,00\n👥 *Grupos Criados no Dia:*");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("restores the original recovered-customer details directly below the daily count", () => {
    const message = formatAttendanceGroupReport({
      ...summary,
      recoveredCustomersCount: 1,
      recoveredCustomersList: [{ customer_code: "CL577", display_name: "Tulio Tem", last_attendant: "Thais", total_amount: "970.00", days_inactive: 226 }],
    }, 0);
    expect(message).toContain("🔄 *Clientes Recuperados no Dia:* 1\n- CL577 - Tulio Tem | Thais | R$ 970,00 | 226 dias sem comprar\n📉 *Clientes Perdidos no Dia:* 0");
  });

  it("lists newly created groups before a customer has made a first purchase", () => {
    const message = formatAttendanceGroupReport({ ...summary, date: "2026-11-09", createdGroups: [
      { jid: "120363414626474487@g.us", name: "Cliente Janfone Celulares", createdAt: "2026-11-09T13:01:46Z" },
    ] }, 0);
    expect(message).toContain("📱 *Clientes Novos no Dia:* 0\n👥 *Grupos Criados no Dia:* 1\n- Cliente Janfone Celulares | Criado às 10:01\n");
  });

  it("lists the exact lost customers once and derives the count from that same list", async () => {
    const report = await previewAttendanceGroupReport("2026-11-09");
    expect(report.lostCustomersCount).toBe(3);
    expect(report.lostCustomers).toHaveLength(3);
    expect(report.text).toContain("📉 *Clientes Perdidos no Dia:* 3\n- CL001 - Cliente Um | 90 dias sem comprar\n- CL002 - Cliente Dois | 90 dias sem comprar\n- Cliente Sem Código | 90 dias sem comprar\n\n💬");
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("returns no names on a day without newly lost customers", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getLostAttendanceCustomers("2026-11-09")).toEqual([]);
    expect(formatAttendanceGroupReport(summary, 0, [])).toContain("📉 *Clientes Perdidos no Dia:* 0\n\n💬");
  });

  it("sends once per day even after another scheduler starts", async () => {
    const now = new Date("2026-11-07T15:55:00Z");
    expect(await runScheduledAttendanceReport(now)).toEqual({ sent: true, date: "2026-11-07" });
    expect(await runScheduledAttendanceReport(now)).toMatchObject({ sent: false, reason: "already_claimed" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(mocks.env.WHATSAPP_ATTENDANCE_REPORT_GROUP_JID, expect.stringContaining("Clientes Perdidos no Dia:* 3"), "Lili");
    expect(mocks.release).toHaveBeenCalledTimes(2);
  });

  it("does not send when disabled, outside schedule, or on Sunday", async () => {
    await runScheduledAttendanceReport(new Date("2026-11-08T19:55:00Z"));
    await runScheduledAttendanceReport(new Date("2026-11-07T15:54:00Z"));
    mocks.env.WHATSAPP_ATTENDANCE_REPORT_ENABLED = false;
    await runScheduledAttendanceReport(new Date("2026-11-07T15:55:00Z"));
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not race the other process holding the daily lock", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [{ locked: false }] });
    expect(await runScheduledAttendanceReport(new Date("2026-11-07T15:55:00Z"))).toMatchObject({ reason: "running" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("leaves report-query failures retryable without claiming or sending", async () => {
    mocks.summary.mockRejectedValueOnce(new Error("database unavailable"));
    const now = new Date("2026-11-07T15:55:00Z");
    await expect(runScheduledAttendanceReport(now)).rejects.toThrow("database unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await runScheduledAttendanceReport(now)).toMatchObject({ sent: true });
  });

  it("records a provider failure without falsely marking success or risking a duplicate after a timeout", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider timeout"));
    const now = new Date("2026-11-07T15:55:00Z");
    await expect(runScheduledAttendanceReport(now)).rejects.toThrow("provider timeout");
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("UPDATE sync_cursors"), [
      expect.any(String), expect.stringContaining('"status":"failed"'),
    ]);
    expect(await runScheduledAttendanceReport(now)).toMatchObject({ reason: "already_claimed" });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledTimes(2);
  });

  it("rejects individual-chat destinations", async () => {
    mocks.env.WHATSAPP_ATTENDANCE_REPORT_GROUP_JID = "5511999999999@s.whatsapp.net";
    await expect(runScheduledAttendanceReport(new Date("2026-11-07T15:55:00Z"))).rejects.toThrow("Invalid daily report group JID");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

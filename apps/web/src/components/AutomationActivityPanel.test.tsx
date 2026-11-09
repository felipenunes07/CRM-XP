import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutomationActivityPanel } from "./AutomationActivityPanel";
import { ACTIVITY_STATUS, activityDate, activityMessageLabel, isCustomAutomation } from "./automationActivityPresentation";

describe("delivery history presentation", () => {
  afterEach(() => vi.useRealTimers());
  it("never labels a waiting destination as sent", () => {
    expect(ACTIVITY_STATUS.SENT.label).toBe("Enviada");
    for (const status of ["PENDING", "SENDING", "PAUSED", "PENDING_APPROVAL"] as const) {
      expect(ACTIVITY_STATUS[status].tone).not.toBe("sent");
      expect(activityMessageLabel({ status })).toBe("Mensagem preparada");
    }
  });
  it("uses the Brasilia calendar even after midnight UTC", () => {
    expect(activityDate(new Date("2026-11-10T02:59:59Z"))).toBe("2026-11-09");
    expect(activityDate(new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-10");
  });
  it("keeps Lili rules out of the custom automation area", () => {
    expect(isCustomAutomation({ flowDefinition: { reactivationPreset: "lili-inactivity-v1" } })).toBe(false);
    expect(isCustomAutomation({ flowDefinition: {} })).toBe(true);
  });
  it("renders real customer identifiers, the rule, outcome, and a message action", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
    const client = new QueryClient();
    client.setQueryData(["automation-activity", "2026-11-09", "ALL", "ALL", "", undefined, 0], {
      summary: { sent: 1, waiting: 0, failed: 0, notSent: 0, awaitingApproval: 0 }, total: 1,
      items: [{ id: "test", customerId: "customer", customerCode: "CL1234", customerName: "Loja Exemplo", groupName: "CL1234 — Loja Exemplo XP", groupJid: "example@g.us", ruleName: "60 dias sem comprar", kind: "REACTIVATION", status: "SENT", eventAt: "2026-11-09T12:01:00Z", message: "Olá!" }],
    });
    const html = renderToStaticMarkup(<MemoryRouter><QueryClientProvider client={client}><AutomationActivityPanel token={null} runs={[]} canManage={false} resolving={false} onApprove={() => {}} onReject={() => {}} focusRunId={null} /></QueryClientProvider></MemoryRouter>);
    for (const text of ["Loja Exemplo", "CL1234", "60 dias sem comprar", "Enviada", "09:01", "Ver mensagem", "Entrar na fila ainda não significa"]) expect(html).toContain(text);
    expect(html).not.toContain("Aprovar e colocar na fila");
    client.clear();
  });
});

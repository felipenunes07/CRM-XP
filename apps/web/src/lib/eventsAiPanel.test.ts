import { describe, expect, it } from "vitest";
import { buildAiBatchDisplay } from "./eventsAiPanel";

describe("events AI panel display", () => {
  it("explains a successful manual batch in manager-friendly copy", () => {
    const display = buildAiBatchDisplay({
      enabled: true,
      provider: "auto",
      model: "gpt-oss-120b,gemini-2.5-flash-lite",
      businessHours: { timezone: "America/Sao_Paulo", startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] },
      dailyUsage: { requestCount: 2, tokenCount: 12000, lastRunAt: "2026-06-21T11:49:00.000Z" },
      canRunNow: false,
      blockedReason: "outside_business_hours",
      nextEligibleAt: null,
      canRunManually: true,
      manualBlockedReason: null,
      manualNextEligibleAt: null,
      latestBatch: {
        status: "SUCCEEDED",
        reason: "ok",
        runSource: "manual",
        provider: "cerebras",
        model: "gpt-oss-120b",
        eventCount: 33,
        finishedAt: "2026-06-21T11:49:00.000Z",
        errorMessage: null,
        summary: { resumoExecutivo: "Clientes pediram reposicao de telas." },
      },
    });

    expect(display.sourceLabel).toBe("Manual");
    expect(display.statusLabel).toBe("Concluido");
    expect(display.headline).toContain("33 eventos");
    expect(display.details).toContain("Cerebras");
    expect(display.actionHint).toBe("Pode rodar manualmente agora.");
  });

  it("makes skipped or failed runs visible instead of looking unchanged", () => {
    const display = buildAiBatchDisplay({
      enabled: true,
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      businessHours: { timezone: "America/Sao_Paulo", startHour: 8, endHour: 18, days: [1, 2, 3, 4, 5] },
      dailyUsage: { requestCount: 0, tokenCount: 0, lastRunAt: null },
      canRunNow: true,
      blockedReason: null,
      nextEligibleAt: null,
      canRunManually: true,
      manualBlockedReason: null,
      manualNextEligibleAt: null,
      latestBatch: {
        status: "SKIPPED",
        reason: "no_events",
        runSource: "automatic",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        eventCount: 0,
        finishedAt: "2026-06-21T11:49:00.000Z",
        errorMessage: null,
        summary: null,
      },
    });

    expect(display.sourceLabel).toBe("Automatico");
    expect(display.statusLabel).toBe("Ignorado");
    expect(display.headline).toBe("A IA rodou, mas nao havia eventos relevantes no lote.");
  });
});

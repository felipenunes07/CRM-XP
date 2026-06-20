import { describe, expect, it } from "vitest";
import type { MessageEvent } from "@olist-crm/shared";
import { buildEventsIntelligence, detectEventTopics } from "./eventsInsights.js";

function event(overrides: Partial<MessageEvent> & { id: string; content: string }): MessageEvent {
  return {
    id: overrides.id,
    dealId: overrides.dealId ?? `deal-${overrides.id}`,
    messageId: overrides.messageId ?? `message-${overrides.id}`,
    eventType: overrides.eventType ?? "NEGATIVE_FEEDBACK",
    severity: overrides.severity ?? "MODERATE",
    label: overrides.label ?? "Feedback",
    content: overrides.content,
    metadata: overrides.metadata ?? {},
    detectedAt: overrides.detectedAt ?? "2026-06-19T12:00:00.000Z",
    resolvedAt: overrides.resolvedAt ?? null,
    resolutionNote: overrides.resolutionNote ?? null,
    resolvedBy: overrides.resolvedBy ?? null,
    conversationContext: overrides.conversationContext ?? {
      contactName: "Cliente teste",
      contactPhone: "",
      agentName: "Amanda",
      instanceName: "XP 01",
      isGroup: false,
    },
  };
}

describe("events intelligence aggregation", () => {
  it("detects operational topics from message content", () => {
    expect(detectEventTopics(event({
      id: "1",
      content: "Muita gente reclamando que esta faltando estoque de tela iPhone 11",
    })).map((topic) => topic.key)).toContain("stock_shortage");

    expect(detectEventTopics(event({
      id: "2",
      content: "A tela veio com defeito e o display nao funciona",
    })).map((topic) => topic.key)).toContain("screen_quality");

    expect(detectEventTopics(event({
      id: "3",
      content: "Show de bola, atendimento perfeito",
      eventType: "PRAISE",
      severity: "LOW",
    })).map((topic) => topic.key)).toContain("praise");
  });

  it("builds a manager-ready summary with themes, source split, and alerts", () => {
    const result = buildEventsIntelligence([
      event({
        id: "1",
        content: "Esta faltando estoque de tela iPhone 11",
        eventType: "COMPLAINT",
        severity: "HIGH",
        conversationContext: {
          contactName: "Grupo Assistencias",
          contactPhone: "",
          agentName: "Amanda",
          instanceName: "XP 01",
          isGroup: true,
        },
      }),
      event({
        id: "2",
        content: "A tela veio com defeito",
        eventType: "COMPLAINT",
        severity: "CRITICAL",
      }),
      event({
        id: "3",
        content: "Atendimento perfeito, obrigado",
        eventType: "PRAISE",
        severity: "LOW",
        resolvedAt: "2026-06-19T13:00:00.000Z",
      }),
    ], {
      generatedAt: "2026-06-19T14:00:00.000Z",
      period: { from: "2026-06-19", to: "2026-06-19" },
      aiBatch: null,
    });

    expect(result.summary.totalEvents).toBe(3);
    expect(result.summary.criticalOpen).toBe(1);
    expect(result.summary.negativeSignals).toBe(2);
    expect(result.summary.positiveSignals).toBe(1);
    expect(result.sourceSplit.groups).toBe(1);
    expect(result.sourceSplit.private).toBe(2);
    expect(result.topThemes.at(0)).toMatchObject({ key: "stock_shortage" });
    expect(result.criticalAlerts.at(0)).toMatchObject({ eventId: "2" });
    expect(result.executiveSummary).toContain("3 eventos");
  });
});

import { describe, expect, it } from "vitest";
import type { ConversationInsight, EventsOverviewResponse } from "@olist-crm/shared";
import { buildRadarWhatsappMessage } from "./radarWhatsappService.js";

function insight(overrides: Partial<ConversationInsight> = {}): ConversationInsight {
  return {
    id: "1",
    conversationKey: "chat-1",
    dealId: null,
    remoteJid: "5511999999999@s.whatsapp.net",
    isGroup: false,
    chatName: "Cliente Teste",
    agentName: "Ana",
    windowDate: "2026-07-17",
    firstMessageAt: null,
    lastMessageAt: null,
    messageCount: 5,
    customerMessageCount: 3,
    analyzedAt: "2026-07-17T12:00:00.000Z",
    provider: "test",
    model: "test",
    summary: "Cliente relatou atraso.",
    sentimentScore: -0.8,
    sentimentLabel: "negativo",
    attentionLevel: "critical",
    attentionReason: "Pedido atrasado e cliente sem retorno.",
    flags: { reclamacao: true, sem_resposta: true },
    topics: ["atraso"],
    highlights: [],
    actionItems: ["Retornar ao cliente hoje"],
    acknowledgedAt: null,
    acknowledgedBy: null,
    ackNote: null,
    ...overrides,
  };
}

function overview(radar: ConversationInsight[]): EventsOverviewResponse {
  return {
    generatedAt: "2026-07-17T12:00:00.000Z",
    period: { from: "2026-07-17", to: "2026-07-17" },
    briefing: null,
    status: {} as EventsOverviewResponse["status"],
    stats: {
      conversations: 10,
      byAttention: { none: 4, low: 2, medium: 1, high: 2, critical: 1 },
      complaints: 3,
      churnRisks: 1,
      unanswered: 2,
      opportunities: 0,
      praises: 0,
      groups: 4,
      privates: 6,
      averageSentiment: -0.2,
      openRadar: radar.length,
    },
    capture: {} as EventsOverviewResponse["capture"],
    runs: [],
    radar,
    topics: [{ topic: "atraso", count: 3, negativeCount: 2 }],
    agents: [],
  };
}

describe("buildRadarWhatsappMessage", () => {
  it("formats the operational summary and next action for WhatsApp", () => {
    const item = insight();
    const message = buildRadarWhatsappMessage(overview([item]), [item]);

    expect(message).toContain("*RADAR — INTELIGÊNCIA DO WHATSAPP*");
    expect(message).toContain("17/07/2026");
    expect(message).toContain("1 ponto aberto");
    expect(message).toContain("*Cliente Teste* — CRÍTICO");
    expect(message).toContain("👤 Responsável: Ana");
    expect(message).toContain("➜ Próximo passo: Retornar ao cliente hoje");
    expect(message).toContain("*Temas em atenção:* atraso (2)");
  });

  it("shows a calm state when there are no open radar items", () => {
    const message = buildRadarWhatsappMessage(overview([]), []);
    expect(message).toContain("Nenhum problema prioritário em aberto");
  });
});

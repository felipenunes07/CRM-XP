import { describe, expect, it } from "vitest";
import { calculateSentimentScore, detectEventType } from "./eventsService.js";
import type { WhatsappMessageRisk } from "@olist-crm/shared";

const noRisk: WhatsappMessageRisk | null = null;

describe("message event classification", () => {
  it("does not classify routine business messages as negative feedback", () => {
    expect(detectEventType("Tem simm", noRisk)).toBe("NEUTRAL");
    expect(detectEventType("A caixa vem 300", noRisk)).toBe("NEUTRAL");
    expect(detectEventType("Consigo fazer por 42.00", noRisk)).toBe("NEUTRAL");
    expect(detectEventType("Precos top pra vc", noRisk)).toBe("NEUTRAL");
    expect(detectEventType("Rs", noRisk)).toBe("NEUTRAL");
  });

  it("uses word boundaries so short casual tokens do not match inside commercial words", () => {
    expect(detectEventType("Valor por atacado", noRisk)).toBe("SALES_OPPORTUNITY");
  });

  it("recognizes commercial intent instead of negative feedback", () => {
    expect(detectEventType("Frete pra 35630306", noRisk)).toBe("SALES_OPPORTUNITY");
    expect(detectEventType("chegou reposicao desses modelos iPhone", noRisk)).toBe("SALES_OPPORTUNITY");
    expect(detectEventType("A caixa fechada da iPhone 11 fica por quanto cada?", noRisk)).toBe("SALES_OPPORTUNITY");
    expect(detectEventType("Tem catalogo de pecas atacado", noRisk)).toBe("SALES_OPPORTUNITY");
    expect(detectEventType("Bom dia linda, como estas? iPhone 11 ta tendo quais? 13c nada ne?", noRisk)).toBe("SALES_OPPORTUNITY");
  });

  it("keeps greetings and casual warmth out of risk queues", () => {
    expect(detectEventType("Bom dia", noRisk)).toBe("GREETING");
    expect(detectEventType("Boooooom dia meu amigoooo lindo", noRisk)).toBe("GREETING");
    expect(detectEventType("Show de bola meu querido", noRisk)).toBe("PRAISE");
  });

  it("requires explicit dissatisfaction to classify negative events", () => {
    expect(detectEventType("O produto veio com problema e quero cancelar", noRisk)).toBe("COMPLAINT");
    expect(detectEventType("Estou chateado com a demora do pedido", noRisk)).toBe("NEGATIVE_FEEDBACK");
  });

  it("does not let price lists distort sentiment", () => {
    const priceList = "*Reposicao Iphones* IP-11 LCD | PRETO R$ 48,00 IP-13 LCD | PRETO R$ 65,00 IP-15 PRO MAX LCD | PRETO R$ 81,00";

    expect(detectEventType(priceList, noRisk)).toBe("NEUTRAL");
    expect(calculateSentimentScore(priceList)).toBe(0);
  });
});

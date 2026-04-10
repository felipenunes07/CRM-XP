import { describe, expect, it } from "vitest";
import {
  buildProspectingTextQuery,
  buildWhatsappUrl,
  calculateProspectScore,
  normalizeProspectPhone,
} from "./prospectingCore.js";

describe("prospectingCore", () => {
  it("builds a text query with optional city", () => {
    expect(buildProspectingTextQuery("assistencia tecnica iphone", "SP", "Campinas")).toBe(
      "assistencia tecnica iphone em Campinas, SP, Brasil",
    );
    expect(buildProspectingTextQuery("loja de celular", "RJ")).toBe("loja de celular em RJ, Brasil");
  });

  it("normalizes brazilian phones for whatsapp", () => {
    expect(normalizeProspectPhone("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizeProspectPhone("+55 21 98888-7777")).toBe("5521988887777");
    expect(buildWhatsappUrl("(11) 99999-8888")).toBe("https://wa.me/5511999998888");
  });

  it("prioritizes leads with stronger commercial signals", () => {
    const lowSignal = calculateProspectScore({
      keyword: "assistencia tecnica celular",
      state: "SP",
      city: "Campinas",
      displayName: "Centro Comercial XP",
      primaryCategory: "Loja",
      isWorked: false,
    });

    const highSignal = calculateProspectScore({
      keyword: "assistencia tecnica celular",
      state: "SP",
      city: "Campinas",
      displayName: "Assistencia Tecnica Celular Campinas",
      primaryCategory: "Assistencia tecnica",
      phone: "(19) 99999-1111",
      websiteUrl: "https://example.com",
      rating: 4.8,
      reviewCount: 184,
      isWorked: false,
    });

    expect(highSignal).toBeGreaterThan(lowSignal);
    expect(highSignal).toBeGreaterThan(70);
  });
});

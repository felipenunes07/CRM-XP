import { describe, expect, it, vi } from "vitest";
import {
  classifyWhatsappGroup,
  computeRecentBlock,
  extractWhatsappSourceCode,
  normalizeWhatsappJid,
  normalizeWhatsappMatchName,
  randomDelaySeconds,
} from "./whatsappCore.js";

describe("whatsappCore", () => {
  describe("normalizeWhatsappJid", () => {
    it("keeps existing group jid values", () => {
      expect(normalizeWhatsappJid("120363371542185615@g.us")).toBe("120363371542185615@g.us");
    });

    it("normalizes plain numeric ids into group jids", () => {
      expect(normalizeWhatsappJid("120363371542185615")).toBe("120363371542185615@g.us");
    });
  });

  describe("extractWhatsappSourceCode", () => {
    it("extracts CL, KH and LJ codes from the group name", () => {
      expect(extractWhatsappSourceCode("CL1049 - MINAS CELL / XP EXPOR TELAS")).toBe("CL1049");
      expect(extractWhatsappSourceCode("KH22 - Parceiro XP")).toBe("KH22");
      expect(extractWhatsappSourceCode("LJ027 - Davi Ma / XP EXPOR")).toBe("LJ027");
    });

    it("returns null when there is no recognizable customer code", () => {
      expect(extractWhatsappSourceCode("Cliente WR SMARTPHONES")).toBeNull();
    });
  });

  describe("normalizeWhatsappMatchName", () => {
    it("removes prefixes, accents and xp suffixes for name matching", () => {
      expect(normalizeWhatsappMatchName("Cliente Ágil Cell / XP Expor Telas")).toBe("agil cell");
    });
  });

  describe("classifyWhatsappGroup", () => {
    it("classifies CL, KH and LJ groups as customers with orders", () => {
      expect(classifyWhatsappGroup("CL1049 - MINAS CELL / XP EXPOR TELAS")).toBe("WITH_ORDER");
      expect(classifyWhatsappGroup("KH22 - Parceiro XP")).toBe("WITH_ORDER");
      expect(classifyWhatsappGroup("LJ027 - Davi Ma / XP EXPOR")).toBe("WITH_ORDER");
    });

    it("classifies Cliente groups as never bought from the company", () => {
      expect(classifyWhatsappGroup("Cliente WR SMARTPHONES")).toBe("NO_ORDER_EXCEL");
    });

    it("classifies all remaining groups as OTHER", () => {
      expect(classifyWhatsappGroup("Grupo Interno Comercial")).toBe("OTHER");
    });
  });

  describe("computeRecentBlock", () => {
    it("blocks contacts still inside the anti-spam window", () => {
      const result = computeRecentBlock("2026-04-10T12:00:00.000Z", 7, new Date("2026-04-13T12:00:00.000Z"));

      expect(result.isBlocked).toBe(true);
      expect(result.recentBlockUntil).toBe("2026-04-17T12:00:00.000Z");
    });

    it("releases contacts outside the anti-spam window", () => {
      const result = computeRecentBlock("2026-04-01T12:00:00.000Z", 7, new Date("2026-04-13T12:00:00.000Z"));

      expect(result.isBlocked).toBe(false);
      expect(result.recentBlockUntil).toBe("2026-04-08T12:00:00.000Z");
    });
  });

  describe("randomDelaySeconds", () => {
    it("respects the configured delay bounds", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      expect(randomDelaySeconds(183, 304)).toBeGreaterThanOrEqual(183);
      expect(randomDelaySeconds(183, 304)).toBeLessThanOrEqual(304);

      vi.restoreAllMocks();
    });
  });
});

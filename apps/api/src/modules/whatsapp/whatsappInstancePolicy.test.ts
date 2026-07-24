import { describe, expect, it } from "vitest";
import { isWhatsappMessageIngestionExcludedInstance } from "./whatsappInstancePolicy.js";

describe("WhatsApp instance ingestion policy", () => {
  it("excludes Lili by instance name or display label", () => {
    expect(isWhatsappMessageIngestionExcludedInstance({ instanceName: "Lili" })).toBe(true);
    expect(
      isWhatsappMessageIngestionExcludedInstance({
        instanceName: "radar-sender",
        displayLabel: " LILI ASSISTENTE ",
      }),
    ).toBe(true);
  });

  it("keeps the operational sales instances enabled", () => {
    expect(
      isWhatsappMessageIngestionExcludedInstance({
        instanceName: "Amanda",
        displayLabel: "Amanda",
      }),
    ).toBe(false);
  });
});

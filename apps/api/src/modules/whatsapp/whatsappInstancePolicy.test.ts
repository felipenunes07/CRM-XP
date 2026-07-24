import { describe, expect, it } from "vitest";
import { isWhatsappMessageIngestionExcludedInstance } from "./whatsappInstancePolicy.js";

describe("WhatsApp instance ingestion policy", () => {
  it("excludes instances explicitly configured as send-only", () => {
    expect(isWhatsappMessageIngestionExcludedInstance({ messagesEnabled: false })).toBe(true);
  });

  it("keeps enabled and legacy instances feeding Messages", () => {
    expect(isWhatsappMessageIngestionExcludedInstance({ messagesEnabled: true })).toBe(false);
    expect(isWhatsappMessageIngestionExcludedInstance({})).toBe(false);
  });
});

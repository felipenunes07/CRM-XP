import { describe, expect, it } from "vitest";
import { formatPrecisePercent, setFormattingLocale } from "./format";

describe("formatPrecisePercent", () => {
  it("keeps decimals for small non-zero exchange rates", () => {
    setFormattingLocale("pt-BR");

    expect(formatPrecisePercent(0.00128)).toBe("0,13%");
    expect(formatPrecisePercent(0)).toBe("0,0%");
  });
});

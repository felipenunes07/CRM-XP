import { describe, expect, it } from "vitest";
import { toOlistDate, toOlistDateTime } from "./olistClient.js";

describe("Olist date filters", () => {
  it("keeps a date-only filter on the requested Brazilian calendar day", () => {
    expect(toOlistDate("2026-08-18")).toBe("18/08/2026");
  });

  it("converts timestamp filters to America/Sao_Paulo", () => {
    expect(toOlistDateTime("2026-08-18T13:30:45.000Z")).toBe("18/08/2026 10:30:45");
  });
});

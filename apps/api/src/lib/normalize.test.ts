import { describe, expect, it } from "vitest";
import { safeNumber } from "./normalize.js";

describe("safeNumber", () => {
  it("keeps dot decimals as decimals", () => {
    expect(safeNumber("33.00")).toBe(33);
    expect(safeNumber("17650.2")).toBe(17650.2);
  });

  it("parses brazilian formatted numbers", () => {
    expect(safeNumber("1.234,56")).toBe(1234.56);
    expect(safeNumber("12,5")).toBe(12.5);
  });

  it("treats thousand separators correctly when only dots are present", () => {
    expect(safeNumber("1.234")).toBe(1234);
    expect(safeNumber("12.345")).toBe(12345);
  });
});

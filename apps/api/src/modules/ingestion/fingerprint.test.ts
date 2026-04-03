import { describe, expect, it } from "vitest";
import { buildSaleLineFingerprint } from "./fingerprint.js";

describe("buildSaleLineFingerprint", () => {
  it("generates the same fingerprint for overlapping rows across files", () => {
    const input = {
      saleDate: "2025-01-02",
      customerCode: "CL879",
      orderNumber: "2025/26109",
      sku: "0306-1",
      quantity: 1,
      lineTotal: 55,
    };

    expect(buildSaleLineFingerprint(input)).toBe(buildSaleLineFingerprint({ ...input }));
  });

  it("changes fingerprint when commercial identity changes", () => {
    const original = buildSaleLineFingerprint({
      saleDate: "2025-01-02",
      customerCode: "CL879",
      orderNumber: "2025/26109",
      sku: "0306-1",
      quantity: 1,
      lineTotal: 55,
    });

    const changed = buildSaleLineFingerprint({
      saleDate: "2025-01-02",
      customerCode: "CL879",
      orderNumber: "2025/26109",
      sku: "0306-1",
      quantity: 2,
      lineTotal: 110,
    });

    expect(changed).not.toBe(original);
  });
});

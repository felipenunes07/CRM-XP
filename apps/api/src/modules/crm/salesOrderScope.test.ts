import { describe, expect, it } from "vitest";
import { buildShippedSalesOnlySql } from "./salesOrderScope.js";

describe("buildShippedSalesOnlySql", () => {
  it("accepts only shipped Olist orders", () => {
    const sql = buildShippedSalesOnlySql();

    expect(sql).toContain("source_system <> 'olist_v2'");
    expect(sql).toContain("LOWER(COALESCE(status, '')) = 'enviado'");
  });

  it("qualifies columns when the query uses a table alias", () => {
    const sql = buildShippedSalesOnlySql("o");

    expect(sql).toContain("o.source_system <> 'olist_v2'");
    expect(sql).toContain("LOWER(COALESCE(o.status, '')) = 'enviado'");
  });
});

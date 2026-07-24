import { describe, expect, it } from "vitest";
import { migrations } from "./migrations.js";

describe("performance migrations", () => {
  it("keeps indexes for dashboard, reports and WhatsApp monitor read paths", () => {
    const sql = migrations.join("\n");

    expect(sql).toContain("idx_orders_customer_order_date");
    expect(sql).toContain("idx_deal_activities_type_created_at");
    expect(sql).toContain("idx_deal_activities_deal_type_created_at");
    expect(sql).toContain("idx_deal_activities_whatsapp_message_id");
    expect(sql).toContain("idx_whatsapp_incoming_remote_instance_created");
    expect(sql).toContain("idx_whatsapp_incoming_message_created");
  });

  it("keeps indexed customer defect product aggregates", () => {
    const sql = migrations.join("\n");

    expect(sql).toContain("customer_defect_snapshot_product_rows");
    expect(sql).toContain("idx_customer_defect_products_snapshot_year");
  });

  it("indexes the customer credit dossier read path by snapshot, customer and date", () => {
    const sql = migrations.join("\n");

    expect(sql).toContain("idx_customer_credit_rows_snapshot_customer");
    expect(sql).toContain("idx_customer_credit_orders_snapshot_customer_date");
    expect(sql).toContain("idx_customer_credit_payments_snapshot_customer_date");
  });

  it("keeps manual credit overrides independent from spreadsheet snapshots", () => {
    const migrationSql = migrations.join("\n");

    expect(migrationSql).toContain("customer_credit_overrides");
    expect(migrationSql).toContain("credit_limit");
    expect(migrationSql).toContain("payment_term");
  });

  it("persists whether each WhatsApp instance feeds the Messages module", () => {
    const migrationSql = migrations.join("\n");

    expect(migrationSql).toContain("messages_enabled BOOLEAN NOT NULL DEFAULT TRUE");
    expect(migrationSql).toContain("SET messages_enabled = FALSE");
    expect(migrationSql).toContain("lili assistente");
  });
});

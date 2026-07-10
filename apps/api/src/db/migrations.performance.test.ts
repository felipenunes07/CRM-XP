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

  it("keeps indexed customer defect product aggregates in the latest append-only migration", () => {
    const latestMigration = migrations[migrations.length - 1] ?? "";

    expect(latestMigration).toContain("customer_defect_snapshot_product_rows");
    expect(latestMigration).toContain("idx_customer_defect_products_snapshot_year");
  });
});

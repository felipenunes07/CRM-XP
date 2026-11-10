import assert from "node:assert/strict";
import { pool, redis, whatsappMonitorPool } from "../db/client.js";
import { countLostAttendanceCustomers, getLostAttendanceCustomers, previewAttendanceGroupReport } from "../modules/whatsapp/whatsappAttendanceReportService.js";
import { getWhatsappDailySummaryReport } from "../modules/whatsapp/whatsappMonitorService.js";

try {
  if (process.argv.includes("--self-test")) {
    // One isolated connection keeps the temporary fixture away from real orders.
    pool.options.max = 1;
    await pool.query("BEGIN");
    try {
      await pool.query("CREATE TEMP TABLE orders (customer_id text, order_date date, total_amount numeric, item_count int, last_attendant text) ON COMMIT DROP");
      await pool.query("CREATE TEMP TABLE customers (id text, customer_code text, display_name text) ON COMMIT DROP");
      await pool.query(`
        INSERT INTO orders (customer_id, order_date) VALUES
          ('notYet89', '2026-11-07'::date - 89),
          ('exactly90', '2026-11-07'::date - 90),
          ('exactly90', '2026-11-07'::date - 90),
          ('already91', '2026-11-07'::date - 91),
          ('alreadyLost', '2026-11-07'::date - 92),
          ('recoveredToday', '2026-11-07'::date - 90),
          ('recoveredToday', '2026-11-07'::date),
          ('futureOrder', '2026-11-07'::date - 90),
          ('futureOrder', '2026-11-07'::date + 1),
          ('recentOrder', '2026-11-07'::date - 90),
          ('recentOrder', '2026-11-07'::date - 1)
      `);
      await pool.query("INSERT INTO customers SELECT DISTINCT customer_id, 'CL-' || customer_id, customer_id FROM orders");
      assert.equal(await countLostAttendanceCustomers("2026-11-07"), 2);
      assert.equal(await countLostAttendanceCustomers("2026-11-08"), 1);
      assert.equal(await countLostAttendanceCustomers("2026-11-09"), 0);
      assert.deepEqual((await getLostAttendanceCustomers("2026-11-07")).map(customer => customer.customerCode), ["CL-exactly90", "CL-futureOrder"]);
      console.log("PASS: exactly 90 days (not 89 or 91+), no cumulative count, deduplication, recovered and future orders (Postgres temporary fixture)");
      await pool.query("INSERT INTO customers VALUES ('firstDay', 'CL-NEW', 'Cliente Novo')");
      await pool.query(`INSERT INTO orders VALUES
        ('firstDay', DATE '2026-11-07', 150.50, 2, 'Amanda'),
        ('firstDay', DATE '2026-11-07', 49.50, 1, 'Thais')`);
      const originalMonitorQuery = whatsappMonitorPool.query;
      try {
        // Exercise the real new-customer SQL against the temporary fixture; message sources stay empty.
        whatsappMonitorPool.query = (async (query: string, params?: unknown[]) => query.includes("STRING_AGG")
          ? pool.query(query, params) : { rows: [] }) as typeof whatsappMonitorPool.query;
        const summary = await getWhatsappDailySummaryReport({ id: "self-test", name: "Teste", email: "test@localhost", role: "ADMIN" }, "2026-11-07");
        assert.equal(summary.newCustomersCount, 1);
        assert.equal(summary.newCustomersList.length, 1);
        assert.equal(summary.newCustomersList[0].customer_code, "CL-NEW");
        assert.equal(Number(summary.newCustomersList[0].total_amount), 200);
        assert.equal(summary.newCustomersList[0].item_count, 3);
        assert.equal(summary.newCustomersList[0].last_attendant, "Amanda, Thais");
        console.log("PASS: one new customer with two first-day orders, summed amounts/items and both sellers (Postgres temporary fixture)");
      } finally { whatsappMonitorPool.query = originalMonitorQuery; }
    } finally {
      await pool.query("ROLLBACK");
    }
  } else {
    const date = process.argv[2] || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const report = await previewAttendanceGroupReport(date);
    assert.ok(!report.text.includes("Particular"));
    assert.ok(!report.text.includes("*Ragnar*"));
    assert.ok(!report.text.includes("*Lili*"));
    for (const name of ["Thaís", "Suellen", "Amanda", "Tamires"]) assert.ok(report.text.includes(`*${name}*`));
    console.log(report.text);
  }
} finally {
  await Promise.all([pool.end(), whatsappMonitorPool.end(), redis.quit()]);
}

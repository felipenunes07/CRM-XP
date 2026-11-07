import assert from "node:assert/strict";
import { pool, redis, whatsappMonitorPool } from "../db/client.js";
import { countLostAttendanceCustomers, previewAttendanceGroupReport } from "../modules/whatsapp/whatsappAttendanceReportService.js";

try {
  if (process.argv.includes("--self-test")) {
    // One isolated connection keeps the temporary fixture away from real orders.
    pool.options.max = 1;
    await pool.query("BEGIN");
    try {
      await pool.query("CREATE TEMP TABLE orders (customer_id text, order_date date) ON COMMIT DROP");
      await pool.query(`
        INSERT INTO orders VALUES
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
      assert.equal(await countLostAttendanceCustomers("2026-11-07"), 2);
      assert.equal(await countLostAttendanceCustomers("2026-11-08"), 1);
      assert.equal(await countLostAttendanceCustomers("2026-11-09"), 0);
      console.log("PASS: exactly 90 days (not 89 or 91+), no cumulative count, deduplication, recovered and future orders (Postgres temporary fixture)");
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

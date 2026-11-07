import assert from "node:assert/strict";
import { pool, redis, whatsappMonitorPool } from "../db/client.js";
import { previewReactivationGroupReport } from "../modules/whatsapp/whatsappReactivationReportService.js";

try {
  const date = process.argv[2] || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const report = await previewReactivationGroupReport(date);
  assert.equal(new Set(report.customers.map((customer) => `${customer.stage}:${customer.key}`)).size, report.customers.length);
  for (const customer of report.customers.filter((customer) => customer.status === "FAILED")) {
    assert.ok(report.text.includes(`Falha no envio — ${customer.stage} dias sem comprar:`));
  }
  console.log(report.text);
} finally {
  await Promise.all([pool.end(), whatsappMonitorPool.end(), redis.quit()]);
}

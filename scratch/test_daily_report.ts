import { pool } from "../apps/api/src/db/client.js";
import { getWhatsappDailySummaryReport } from "../apps/api/src/modules/whatsapp/whatsappMonitorService.js";

async function run() {
  try {
    const user = {
      id: "7cc629b6-39f7-4f43-bebc-a44fd03678a3",
      name: "Admin",
      role: "ADMIN",
      email: "admin@admin.com"
    };

    console.log("Running getWhatsappDailySummaryReport for 2026-05-07...");
    const report = await getWhatsappDailySummaryReport(user as any, "2026-05-07");
    
    console.log("\n=== CONSOLIDATED REPORT AGENTS ===");
    console.log(JSON.stringify(report.agents.map((a: any) => ({
      agentName: a.agentName,
      agentId: a.agentId,
      sentMessages: a.sentMessages,
      privateChatsCount: a.privateChatsCount,
      groupChatsCount: a.groupChatsCount,
      screensSold: a.screensSold
    })), null, 2));

  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

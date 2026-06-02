import { pool } from "../apps/api/src/db/client.ts";
import { getWhatsappAgentActivityReport } from "../apps/api/src/modules/whatsapp/whatsappMonitorService.ts";

async function run() {
  console.log("Testing getWhatsappAgentActivityReport for 30 days...");
  try {
    const user = {
      id: "7cc629b6-39f7-4f43-bebc-a44fd03678a3",
      name: "Admin",
      role: "ADMIN",
      email: "admin@admin.com"
    };

    const report = await getWhatsappAgentActivityReport(user as any, 30);
    
    console.log("\n=== REPORT SUMMARY ===");
    console.log("Period:", report.period);
    console.log("Summary:", report.summary);
    console.log("Number of agents in report:", report.agents.length);
    console.log("Number of daily points:", report.dailySeries.length);
    console.log("Number of hourly cells:", report.hourlyCells.length);

    if (report.hourlyCells.length > 0) {
      console.log("\nFirst 3 hourly cells:");
      console.table(report.hourlyCells.slice(0, 3).map(c => ({
        agentName: c.agentName,
        date: c.date,
        hour: c.hour,
        attendedConversations: c.attendedConversations,
        sentMessages: c.sentMessages,
        receivedMessages: c.receivedMessages
      })));
    } else {
      console.log("\nWARNING: No hourly cells found in report!");
    }

  } catch(e) {
    console.error("Failed to fetch report:", e);
  } finally {
    await pool.end();
  }
}

run();

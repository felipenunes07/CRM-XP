import { listWhatsappMonitorConversations } from "../apps/api/src/modules/whatsapp/whatsappMonitorService.js";
import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== TESTING CONVERSATIONS QUERY ===");
    
    // Admin user profile from JWT
    const dummyUser = {
      id: "493c96ed-3b1e-424a-aa84-0ac7c45dbd68", // matching Felipe's ID from request logs
      name: "Admin",
      role: "ADMIN" as const,
      email: "fereservas@gmail.com",
    };

    const result = await listWhatsappMonitorConversations(dummyUser, { limit: 25 });
    console.log("SUCCESS! Query ran successfully without errors.");
    console.log(`Retrieved ${result.conversations.length} conversations.`);
    if (result.conversations.length > 0) {
      console.log("First conversation JID:", result.conversations[0].remoteJid);
      console.log("First conversation active instance fallback name:", (result.conversations[0] as any).instanceName);
    }
  } catch (error) {
    console.error("FAILED to run conversations query:", error);
  } finally {
    await pool.end();
  }
}

run();

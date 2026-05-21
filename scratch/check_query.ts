import { pool } from "../apps/api/src/db/client.js";
import { listWhatsappMonitorConversations } from "../apps/api/src/modules/whatsapp/whatsappMonitorService.js";

async function main() {
  const user = { id: '00000000-0000-0000-0000-000000000000', role: 'ADMIN', name: 'Admin', email: 'admin@test.com' } as any;

  const res = await listWhatsappMonitorConversations(user, { instanceId: '683b8034-eca4-4996-8f56-deaec7e6bb86' });
  console.log("With instanceId:", res.conversations.length);

  const res2 = await listWhatsappMonitorConversations(user, {});
  console.log("Without instanceId:", res2.conversations.length);

  process.exit(0);
}
main();

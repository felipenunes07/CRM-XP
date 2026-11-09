import { pool,redis,whatsappMonitorPool } from "../db/client.js";
import { previewProspectFollowups } from "../modules/whatsapp/prospectFollowupService.js";
try {
  console.log(JSON.stringify(await previewProspectFollowups(process.argv[2]),null,2));
} finally {
  await Promise.all([pool.end(),redis.quit(),whatsappMonitorPool.end()]);
}

import { pool, redis } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { getWhatsappMonitorConversation } from "../modules/whatsapp/whatsappMonitorService.js";
import { recordMonitorMessage } from "../modules/whatsapp/whatsappMonitorMessages.js";
import type { JwtUser } from "../modules/platform/authService.js";

async function main() {
  // Force old read path during backfill to avoid reading from the incomplete flat table
  process.env.WHATSAPP_FAST_READ = "off";

  logger.info("Starting whatsapp monitor messages backfill...");

  const dealsResult = await pool.query(
    "SELECT id, title, whatsapp_jid FROM deals WHERE whatsapp_jid IS NOT NULL"
  );
  const deals = dealsResult.rows;
  logger.info(`Found ${deals.length} deals to process.`);

  const adminUser: JwtUser = {
    id: "00000000-0000-0000-0000-000000000000",
    name: "System Backfill",
    email: "backfill@system.local",
    role: "ADMIN",
  };

  let totalProcessed = 0;
  let totalSaved = 0;

  for (const deal of deals) {
    logger.info(`Processing deal "${deal.title}" (${deal.id})...`);
    let beforeCursor: string | undefined = undefined;
    let dealMessagesCount = 0;

    while (true) {
      const detail = await getWhatsappMonitorConversation(deal.id, adminUser, {
        limit: 100,
        before: beforeCursor,
      });

      if (!detail.messages || detail.messages.length === 0) {
        break;
      }

      for (const msg of detail.messages) {
        // Flat message needs Evolution's message_id
        const providerMessageId =
          typeof msg.metadata.messageId === "string"
            ? msg.metadata.messageId
            : typeof msg.metadata.providerMessageId === "string"
              ? msg.metadata.providerMessageId
              : msg.id; // Fallback to normal msg.id if not found

        // Determine source ('activity' vs 'incoming') by checking if msg.id exists in deal_activities
        const activityCheck = await pool.query(
          "SELECT 1 FROM deal_activities WHERE id = $1 LIMIT 1",
          [msg.id]
        );
        const source = activityCheck.rowCount && activityCheck.rowCount > 0 ? "activity" : "incoming";

        await recordMonitorMessage({
          dealId: deal.id,
          messageId: providerMessageId,
          remoteJid: msg.remoteJid,
          instanceName: detail.instanceName,
          fromMe: msg.direction === "OUTBOUND",
          senderName: msg.senderName,
          senderJid: msg.senderJid,
          senderPicUrl: msg.senderProfilePictureUrl,
          content: msg.content,
          mediaJson: msg.metadata,
          source,
          createdAt: msg.createdAt,
        });
        dealMessagesCount++;
        totalSaved++;
      }

      if (!detail.pageInfo.hasPreviousPage || !detail.pageInfo.previousCursor) {
        break;
      }
      beforeCursor = detail.pageInfo.previousCursor;
    }

    logger.info(`Saved ${dealMessagesCount} messages for deal "${deal.title}"`);
    totalProcessed++;
  }

  logger.info(`Backfill completed. Processed ${totalProcessed} deals, saved ${totalSaved} messages.`);
}

main()
  .catch((err) => {
    logger.error("Backfill failed", { error: err.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });

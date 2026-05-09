import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { resolveWhatsappMessageMetadata } from "./evolutionMetadataService.js";
import {
  extractEvolutionMessageContext,
  formatWhatsappJidPhone,
  type EvolutionMessageLike,
} from "./whatsappMonitorCore.js";

/**
 * Handles MESSAGES_UPSERT events from Evolution API webhook.
 * Stores incoming messages and links them to deals when a matching JID is found.
 */

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: EvolutionMessageLike | EvolutionMessageLike[];
}

async function getWhatsappInstanceDetails(instanceName: string | null) {
  if (!instanceName) {
    return null;
  }

  const result = await pool.query(
    "SELECT id, assigned_user_id, assigned_user_name FROM whatsapp_instances WHERE LOWER(instance_name) = LOWER($1) LIMIT 1",
    [instanceName],
  );

  return result.rows[0] ? {
    id: String(result.rows[0].id),
    assignedUserId: result.rows[0].assigned_user_id ? String(result.rows[0].assigned_user_id) : null,
    assignedUserName: result.rows[0].assigned_user_name ? String(result.rows[0].assigned_user_name) : null,
  } : null;
}

function conversationTitle(input: {
  remoteJid: string;
  isGroup: boolean;
  chatDisplayName: string | null;
  senderName: string | null;
}) {
  if (input.chatDisplayName) {
    return input.chatDisplayName;
  }

  if (!input.isGroup && input.senderName) {
    return input.senderName;
  }

  return formatWhatsappJidPhone(input.remoteJid);
}

function buildActivityMetadata(input: {
  remoteJid: string;
  messageId: string;
  instanceName: string | null;
  isGroup: boolean;
  senderJid: string | null;
  senderName: string | null;
  senderProfilePictureUrl: string | null;
  chatDisplayName: string | null;
  chatProfilePictureUrl: string | null;
  autoCreated?: boolean;
}) {
  return {
    remoteJid: input.remoteJid,
    messageId: input.messageId,
    instance: input.instanceName,
    isGroup: input.isGroup,
    senderJid: input.senderJid,
    senderName: input.senderName,
    senderProfilePictureUrl: input.senderProfilePictureUrl,
    chatDisplayName: input.chatDisplayName,
    chatProfilePictureUrl: input.chatProfilePictureUrl,
    ...(input.autoCreated ? { autoCreated: true } : {}),
  };
}

async function insertDealActivity(input: {
  dealId: string;
  activityType: "WHATSAPP_SENT" | "WHATSAPP_RECEIVED";
  actorName: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}) {
  await pool.query(
    `
    INSERT INTO deal_activities (deal_id, activity_type, actor_name, content, metadata, created_at)
    SELECT $1, $2, $3, $4, $5::jsonb, $6
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE metadata ->> 'messageId' = $7
        AND deal_id = $1
    )
    `,
    [
      input.dealId,
      input.activityType,
      input.actorName,
      input.content,
      JSON.stringify(input.metadata),
      input.createdAt,
      String(input.metadata.messageId ?? ""),
    ],
  );
}

export async function handleEvolutionWebhook(payload: EvolutionWebhookPayload) {
  const event = payload.event ?? "";
  const instance = payload.instance ?? "unknown";

  if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") {
    logger.info("evolution webhook ignored event", { event, instance });
    return { processed: false, event };
  }

  const messages = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  let processedCount = 0;

  logger.info("evolution webhook processing messages", {
    instance,
    event,
    count: messages.length,
  });

  for (const msg of messages) {
    const context = extractEvolutionMessageContext(msg, payload.instance);
    const remoteJid = context.remoteJid;
    const messageId = context.messageId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const text = context.text;

    if (!remoteJid) {
      logger.warn("evolution webhook skipped message: missing remoteJid", { instance, messageId });
      continue;
    }

    if (!text) {
      logger.info("evolution webhook skipped message: no text content (likely media without caption)", {
        instance,
        remoteJid,
        messageId,
      });
      continue;
    }

    const enriched = await resolveWhatsappMessageMetadata(context);
    const senderName = enriched.senderName ?? context.senderName;
    const chatDisplayName = enriched.chatDisplayName ?? context.chatDisplayName;
    const chatProfilePictureUrl = enriched.chatProfilePictureUrl ?? context.chatProfilePictureUrl;
    const senderProfilePictureUrl = enriched.senderProfilePictureUrl ?? context.senderProfilePictureUrl;
    const instanceName = context.instanceName ?? "";
    const activityType = context.fromMe ? "WHATSAPP_SENT" : "WHATSAPP_RECEIVED";
    const actorName = context.fromMe
      ? chatDisplayName ?? "WhatsApp corporativo"
      : senderName ?? (context.isGroup ? "Membro do grupo" : "WhatsApp");
    const metadata = buildActivityMetadata({
      remoteJid,
      messageId,
      instanceName,
      isGroup: context.isGroup,
      senderJid: context.senderJid,
      senderName,
      senderProfilePictureUrl,
      chatDisplayName,
      chatProfilePictureUrl,
    });

    logger.info("evolution webhook incoming message", {
      remoteJid,
      senderName,
      textPreview: text.slice(0, 80),
      messageId,
      fromMe: context.fromMe,
    });

    await pool.query(
      `
      INSERT INTO whatsapp_incoming_messages (
        remote_jid, sender_name, message_text, message_id,
        instance_name, raw_payload, participant_jid, participant_name,
        sender_profile_picture_url, chat_display_name, chat_profile_picture_url,
        from_me, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (message_id) DO NOTHING
      `,
      [
        remoteJid,
        senderName,
        text,
        messageId,
        instanceName,
        JSON.stringify(msg),
        context.senderJid,
        senderName,
        senderProfilePictureUrl,
        chatDisplayName,
        chatProfilePictureUrl,
        context.fromMe,
        context.createdAt,
      ],
    );

    const dealMatch = await pool.query(
      `
      SELECT d.id, d.whatsapp_instance_id FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      WHERE d.whatsapp_jid = $1
        AND ps.is_won = false AND ps.is_lost = false
      ORDER BY d.last_activity_at DESC
      LIMIT 1
      `,
      [remoteJid],
    );

    if (dealMatch.rows[0]) {
      const dealId = String(dealMatch.rows[0].id);

      await insertDealActivity({
        dealId,
        activityType,
        actorName,
        content: text,
        metadata,
        createdAt: context.createdAt,
      });

      // Backfill whatsapp_instance_id if missing on the deal
      if (!dealMatch.rows[0].whatsapp_instance_id && instanceName) {
        const instanceDetails = await getWhatsappInstanceDetails(instanceName);
        if (instanceDetails) {
          await pool.query(
            "UPDATE deals SET whatsapp_instance_id = $1, last_activity_at = NOW() WHERE id = $2",
            [instanceDetails.id, dealId],
          );
          logger.info("evolution webhook backfilled instance on deal", { dealId, instanceId: instanceDetails.id });
        } else {
          await pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]);
        }
      } else {
        await pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]);
      }
      logger.info("evolution webhook linked message to deal", { dealId, remoteJid });
    } else {
      const stageMatch = await pool.query("SELECT id FROM pipeline_stages ORDER BY sort_order ASC LIMIT 1");
      if (stageMatch.rows[0]) {
        const stageId = stageMatch.rows[0].id;
        const dealTitle = conversationTitle({
          remoteJid,
          isGroup: context.isGroup,
          chatDisplayName,
          senderName,
        });
        const instanceDetails = await getWhatsappInstanceDetails(instanceName);
        const autoMetadata = { ...metadata, autoCreated: true };

        const newDeal = await pool.query(
          `
          INSERT INTO deals (
            title, customer_display_name, stage_id, whatsapp_instance_id,
            whatsapp_jid, expected_value, priority, last_activity_at,
            assigned_to, assigned_to_name
          )
          VALUES ($1, $2, $3, $4, $5, 0, 'MEDIUM', $6, $7, $8)
          RETURNING id
          `,
          [
            dealTitle, dealTitle, stageId, 
            instanceDetails?.id ?? null, 
            remoteJid, context.createdAt,
            instanceDetails?.assignedUserId ?? null,
            instanceDetails?.assignedUserName ?? null
          ],
        );
        const dealId = newDeal.rows[0].id;

        await insertDealActivity({
          dealId,
          activityType,
          actorName,
          content: text,
          metadata: autoMetadata,
          createdAt: context.createdAt,
        });
        logger.info("evolution webhook auto-created deal", { dealId, remoteJid });
      }
    }

    processedCount++;
  }

  return { processed: true, processedCount };
}

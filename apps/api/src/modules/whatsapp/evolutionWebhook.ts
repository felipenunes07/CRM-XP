import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { resolveWhatsappMessageMetadata } from "./evolutionMetadataService.js";
import {
  extractEvolutionMessageContext,
  formatWhatsappPhoneJid,
  formatWhatsappJidPhone,
  isMonitorableWhatsappJid,
  type EvolutionMessageLike,
} from "./whatsappMonitorCore.js";
import { detectWhatsappMessageRisk } from "./whatsappMonitorCore.js";
import { createEventFromMessage } from "../events/eventsService.js";
import { WhatsappMonitorMessage } from "@olist-crm/shared";

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
    `
    SELECT id, display_label, phone_number, assigned_user_id, assigned_user_name
    FROM whatsapp_instances
    WHERE LOWER(instance_name) = LOWER($1)
    LIMIT 1
    `,
    [instanceName],
  );

  return result.rows[0] ? {
    id: String(result.rows[0].id),
    displayLabel: result.rows[0].display_label ? String(result.rows[0].display_label) : null,
    phoneNumber: result.rows[0].phone_number ? String(result.rows[0].phone_number) : null,
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
  instanceId?: string | null;
  capturedFromWhatsapp?: boolean;
  outboundSource?: string | null;
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
    ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    ...(input.capturedFromWhatsapp ? { capturedFromWhatsapp: true } : {}),
    ...(input.outboundSource ? { outboundSource: input.outboundSource } : {}),
    ...(input.autoCreated ? { autoCreated: true } : {}),
  };
}

async function insertDealActivity(input: {
  dealId: string;
  activityType: "WHATSAPP_SENT" | "WHATSAPP_RECEIVED";
  actorUserId?: string | null;
  actorName: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}) {
  await pool.query(
    `
    INSERT INTO deal_activities (deal_id, activity_type, actor_user_id, actor_name, content, metadata, created_at)
    SELECT $1, $2, $3, $4, $5, $6::jsonb, $7
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE metadata ->> 'messageId' = $8
        AND deal_id = $1
    )
    `,
    [
      input.dealId,
      input.activityType,
      input.actorUserId ?? null,
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
    const { remoteJid, messageId, text, fromMe } = context;

    if (!remoteJid || !messageId) {
      logger.info("evolution webhook skipped message: missing remoteJid or messageId", {
        instance,
        remoteJid,
        messageId,
        fromMe,
      });
      continue;
    }

    logger.info("evolution webhook processing message", {
      instance,
      remoteJid,
      messageId,
      fromMe,
      hasText: !!text,
    });

    if (!isMonitorableWhatsappJid(remoteJid)) {
      logger.info("evolution webhook skipped message: non-chat broadcast jid", {
        instance,
        remoteJid,
        messageId,
      });
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
    const instanceDetails = await getWhatsappInstanceDetails(instanceName);
    const instanceOwnerJid = formatWhatsappPhoneJid(instanceDetails?.phoneNumber);
    
    // Fallback: if senderJid matches instance owner JID, it's definitely fromMe
    const isFromMe = Boolean(context.fromMe || (instanceOwnerJid && context.senderJid === instanceOwnerJid));
    
    const activityType = isFromMe ? "WHATSAPP_SENT" : "WHATSAPP_RECEIVED";
    const actorUserId = isFromMe ? instanceDetails?.assignedUserId ?? null : null;
    const actorName = isFromMe
      ? instanceDetails?.assignedUserName ?? instanceDetails?.displayLabel ?? "WhatsApp corporativo"
      : senderName ?? (context.isGroup ? "Membro do grupo" : "WhatsApp");
    const activitySenderJid = isFromMe ? instanceOwnerJid ?? context.senderJid : context.senderJid;
    const activitySenderName = isFromMe
      ? instanceDetails?.assignedUserName ?? instanceDetails?.displayLabel ?? senderName
      : senderName;
    const metadata = buildActivityMetadata({
      remoteJid: String(remoteJid),
      messageId: String(messageId),
      instanceName,
      isGroup: context.isGroup,
      senderJid: activitySenderJid,
      senderName: activitySenderName,
      senderProfilePictureUrl,
      chatDisplayName,
      chatProfilePictureUrl,
      instanceId: instanceDetails?.id ?? null,
      capturedFromWhatsapp: isFromMe,
      outboundSource: isFromMe ? "whatsapp_device" : null,
    });

    logger.info("evolution webhook incoming message", {
      remoteJid,
      isGroup: context.isGroup,
      senderName: activitySenderName,
      senderJid: activitySenderJid,
      chatDisplayName,
      hasSenderProfilePictureUrl: Boolean(senderProfilePictureUrl),
      textPreview: text.slice(0, 80),
      messageId,
      fromMe: context.fromMe,
      actorUserId,
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
        activitySenderJid,
        activitySenderName,
        senderProfilePictureUrl,
        chatDisplayName,
        chatProfilePictureUrl,
        isFromMe,
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
        actorUserId,
        actorName,
        content: text,
        metadata,
        createdAt: context.createdAt,
      });

      // Messaging Intelligence: Detect and create event
      const monitorMessage: WhatsappMonitorMessage = {
        id: String(messageId),
        dealId,
        direction: activityType === "WHATSAPP_SENT" ? "OUTBOUND" : "INBOUND",
        senderName: activitySenderName,
        senderJid: activitySenderJid,
        senderProfilePictureUrl,
        content: text,
        createdAt: context.createdAt,
        remoteJid,
        isGroup: context.isGroup,
        metadata,
        risk: detectWhatsappMessageRisk(text),
      };

      createEventFromMessage(monitorMessage, dealId).catch((err) => {
        logger.warn("failed to create message event from webhook", {
          dealId,
          messageId,
          error: err.message,
        });
      });

      // Backfill whatsapp_instance_id if missing on the deal
      if (!dealMatch.rows[0].whatsapp_instance_id && instanceName) {
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
          remoteJid: String(remoteJid),
          isGroup: context.isGroup,
          chatDisplayName,
          senderName: isFromMe ? null : activitySenderName,
        });
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
          actorUserId,
          actorName,
          content: text,
          metadata: autoMetadata,
          createdAt: context.createdAt,
        });

        // Messaging Intelligence: Detect and create event for new deal
        const monitorMessage: WhatsappMonitorMessage = {
          id: String(messageId),
          dealId,
          direction: activityType === "WHATSAPP_SENT" ? "OUTBOUND" : "INBOUND",
          senderName: activitySenderName,
          senderJid: activitySenderJid,
          senderProfilePictureUrl,
          content: text,
          createdAt: context.createdAt,
          remoteJid,
          isGroup: context.isGroup,
          metadata: autoMetadata,
          risk: detectWhatsappMessageRisk(text),
        };

        createEventFromMessage(monitorMessage, dealId).catch((err) => {
          logger.warn("failed to create message event for new deal from webhook", {
            dealId,
            messageId,
            error: err.message,
          });
        });
        logger.info("evolution webhook auto-created deal", { dealId, remoteJid });
      }
    }

    processedCount++;
  }

  return { processed: true, processedCount };
}

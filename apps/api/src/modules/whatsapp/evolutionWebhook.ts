import { pool, redis } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { resolveWhatsappMessageMetadata } from "./evolutionMetadataService.js";
import {
  extractEvolutionMessageContext,
  extractEvolutionMessageContact,
  extractEvolutionMessageMedia,
  formatWhatsappPhoneJid,
  formatWhatsappJidPhone,
  isMonitorableWhatsappJid,
  areWhatsappJidsEqual,
  extractEvolutionFromMeFlag,
  type EvolutionMessageContact,
  type EvolutionMessageMedia,
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
  data?: EvolutionMessageLike | EvolutionMessageLike[] | Record<string, unknown>;
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
  fromMe: boolean;
  outboundSource?: string | null;
  autoCreated?: boolean;
  media?: EvolutionMessageMedia | null;
  contact?: EvolutionMessageContact | null;
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
    fromMe: input.fromMe,
    isOutbound: input.fromMe,
    capturedFromWhatsapp: input.fromMe,
    ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    ...(input.outboundSource ? { outboundSource: input.outboundSource } : {}),
    ...(input.autoCreated ? { autoCreated: true } : {}),
    ...(input.media ? input.media : {}),
    ...(input.contact ? { contact: input.contact } : {}),
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
    WITH inserted AS (
    INSERT INTO deal_activities (deal_id, activity_type, actor_user_id, actor_name, content, metadata, created_at)
    SELECT $1, $2, $3, $4, $5, $6::jsonb, $7
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE metadata ->> 'messageId' = $8
        AND deal_id = $1
    )
    RETURNING id
    )
    UPDATE deal_activities
    SET
      activity_type = $2,
      actor_user_id = COALESCE(deal_activities.actor_user_id, $3),
      actor_name = COALESCE(deal_activities.actor_name, $4),
      content = $5,
      metadata = COALESCE(deal_activities.metadata, '{}'::jsonb) || $6::jsonb,
      created_at = $7
    WHERE deal_id = $1
      AND metadata ->> 'messageId' = $8
      AND NOT EXISTS (SELECT 1 FROM inserted)
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

const ACCEPTED_EVENTS = new Set([
  "messages.upsert",
  "MESSAGES_UPSERT",
  "send.message",
  "SEND_MESSAGE",
]);

function normalizeWebhookMessages(payload: EvolutionWebhookPayload): EvolutionMessageLike[] {
  const event = (payload.event ?? "").toUpperCase();
  const data = payload.data;

  if (!data) return [];

  // SEND_MESSAGE payloads from Evolution API v2 may wrap the message differently:
  // { event: "SEND_MESSAGE", data: { key: {...}, message: {...}, ... } }
  // or { event: "SEND_MESSAGE", data: [{ key: {...}, message: {...}, ... }] }
  if (event === "SEND_MESSAGE" && data && typeof data === "object" && !Array.isArray(data)) {
    // Check if data itself looks like a single message (has key or message property)
    const record = data as Record<string, unknown>;
    if (record.key || record.message || record.remoteJid) {
      return [record as EvolutionMessageLike];
    }
    // Maybe wrapped in a nested structure
    if (record.data && typeof record.data === "object") {
      const inner = record.data;
      if (Array.isArray(inner)) {
        return inner;
      }
      return [inner as EvolutionMessageLike];
    }
  }

  if (Array.isArray(data)) return data as EvolutionMessageLike[];
  return [data as EvolutionMessageLike];
}

export async function handleEvolutionWebhook(payload: EvolutionWebhookPayload) {
  const event = payload.event ?? "";
  const instance = payload.instance ?? "unknown";

  // Log ALL incoming webhook events for debugging (truncated payload)
  const rawPayloadStr = JSON.stringify(payload);
  logger.info("evolution webhook raw event received", {
    event,
    instance,
    payloadSize: rawPayloadStr.length,
    payloadPreview: rawPayloadStr.slice(0, 500),
  });

  if (!ACCEPTED_EVENTS.has(event)) {
    logger.info("evolution webhook ignored event", { event, instance });
    return { processed: false, event };
  }

  const isSendMessageEvent = event === "send.message" || event === "SEND_MESSAGE";
  const messages = normalizeWebhookMessages(payload);
  let processedCount = 0;

  logger.info("evolution webhook processing messages", {
    instance,
    event,
    isSendMessageEvent,
    count: messages.length,
  });

  for (const msg of messages) {
    try {
      const context = extractEvolutionMessageContext(msg, payload.instance);
      
      // Adjust createdAt to have millisecond precision based on loop processing to preserve exact order
      const baseDate = new Date(context.createdAt);
      if (baseDate.getMilliseconds() === 0) {
        const serverMs = Date.now() % 1000;
        baseDate.setMilliseconds(serverMs + processedCount);
        context.createdAt = baseDate.toISOString();
      }

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

      // Deduplicate webhook events by messageId in the last 60 seconds using Redis
      const redisKey = `webhook:msg:${messageId}`;
      const isDuplicate = await redis.get(redisKey);
      if (isDuplicate) {
        logger.info("evolution webhook skipped duplicate message", {
          instance,
          remoteJid,
          messageId,
        });
        continue;
      }
      await redis.set(redisKey, "1", "EX", 60);

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

      // Try to resolve content for messages without extracted text (e.g., media-only messages)
      let messageContent = text;
      if (!messageContent) {
        const msgMedia = extractEvolutionMessageMedia(msg);
        const msgContact = extractEvolutionMessageContact(msg);
        messageContent = msgMedia
          ? (msgMedia.caption || msgMedia.fileName || (
              msgMedia.mediaType === "image" ? "[Imagem]" :
              msgMedia.mediaType === "video" ? "[Vídeo]" :
              msgMedia.mediaType === "audio" ? "[Áudio]" :
              msgMedia.mediaType === "sticker" ? "[Sticker]" :
              "[Documento]"
            ))
          : msgContact
            ? "[Contato]"
            : null;

        if (!messageContent) {
          logger.info("evolution webhook skipped message: no text and no media content", {
            instance,
            remoteJid,
            messageId,
          });
          continue;
        }
      }

      const enriched = await resolveWhatsappMessageMetadata(context);
      const media = extractEvolutionMessageMedia(msg);
      const contact = extractEvolutionMessageContact(msg);
      const senderName = enriched.senderName ?? context.senderName;
      const chatDisplayName = enriched.chatDisplayName ?? context.chatDisplayName;
      const chatProfilePictureUrl = enriched.chatProfilePictureUrl ?? context.chatProfilePictureUrl;
      const senderProfilePictureUrl = enriched.senderProfilePictureUrl ?? context.senderProfilePictureUrl;
      const instanceName = context.instanceName ?? "";
      const instanceDetails = await getWhatsappInstanceDetails(instanceName);
      const instanceOwnerJid = formatWhatsappPhoneJid(instanceDetails?.phoneNumber);
      const explicitFromMe = extractEvolutionFromMeFlag(msg);
      
      const cleanSenderName = (senderName || "").trim().toLowerCase();
      const cleanAgentName = (instanceDetails?.assignedUserName || instanceDetails?.displayLabel || instanceName || "").trim().toLowerCase();
      const isAgentSender = Boolean(
        cleanAgentName && (
          cleanSenderName === cleanAgentName ||
          (cleanSenderName.includes("xp") && cleanSenderName.includes(cleanAgentName)) ||
          (cleanAgentName.includes("xp") && cleanAgentName.includes(cleanSenderName)) ||
          cleanSenderName === `xp ${cleanAgentName}` ||
          cleanSenderName === `${cleanAgentName} xp` ||
          cleanSenderName === `xp - ${cleanAgentName}` ||
          cleanSenderName === `${cleanAgentName} - xp`
        )
      );
      
      const rawMsg = msg as Record<string, unknown>;
      const msgKey = (rawMsg.key && typeof rawMsg.key === "object") ? (rawMsg.key as Record<string, unknown>) : {};
      const payloadParticipantJid = typeof msgKey.participant === "string" 
        ? msgKey.participant 
        : typeof rawMsg.participant === "string" 
          ? rawMsg.participant 
          : typeof rawMsg.senderJid === "string" 
            ? rawMsg.senderJid 
            : null;

      const isAgentJid = Boolean(
        instanceOwnerJid && 
        payloadParticipantJid && 
        areWhatsappJidsEqual(payloadParticipantJid, instanceOwnerJid)
      );
      
      const fallbackFromMe = Boolean(
        isSendMessageEvent ||
        (context.isGroup && (
          isAgentSender ||
          isAgentJid ||
          Boolean(instanceOwnerJid && context.senderJid && areWhatsappJidsEqual(context.senderJid, instanceOwnerJid))
        ))
      );
      const isFromMe = explicitFromMe ?? fallbackFromMe;
      
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
        fromMe: isFromMe,
        outboundSource: isFromMe ? "whatsapp_device" : null,
        media,
        contact,
      });

      logger.info("evolution webhook incoming message", {
        remoteJid,
        isGroup: context.isGroup,
        senderName: activitySenderName,
        senderJid: activitySenderJid,
        chatDisplayName,
        hasSenderProfilePictureUrl: Boolean(senderProfilePictureUrl),
        textPreview: messageContent.slice(0, 80),
        mediaType: media?.mediaType ?? null,
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
        ON CONFLICT (message_id) DO UPDATE SET
          sender_name = COALESCE(EXCLUDED.sender_name, whatsapp_incoming_messages.sender_name),
          raw_payload = EXCLUDED.raw_payload,
          participant_jid = COALESCE(EXCLUDED.participant_jid, whatsapp_incoming_messages.participant_jid),
          participant_name = COALESCE(EXCLUDED.participant_name, whatsapp_incoming_messages.participant_name),
          sender_profile_picture_url = COALESCE(EXCLUDED.sender_profile_picture_url, whatsapp_incoming_messages.sender_profile_picture_url),
          chat_display_name = COALESCE(EXCLUDED.chat_display_name, whatsapp_incoming_messages.chat_display_name),
          chat_profile_picture_url = COALESCE(EXCLUDED.chat_profile_picture_url, whatsapp_incoming_messages.chat_profile_picture_url),
          from_me = EXCLUDED.from_me
        `,
        [
          remoteJid,
          senderName,
          messageContent,
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
        WITH existing_message_deal AS (
          SELECT d.id, d.whatsapp_instance_id, d.last_activity_at
          FROM deal_activities da
          JOIN deals d ON d.id = da.deal_id
          WHERE da.metadata ->> 'messageId' = $1
             OR da.metadata ->> 'providerMessageId' = $1
          ORDER BY da.created_at DESC, da.id DESC
          LIMIT 1
        ),
        remote_jid_deal AS (
          SELECT d.id, d.whatsapp_instance_id, d.last_activity_at
          FROM deals d
          JOIN pipeline_stages ps ON ps.id = d.stage_id
          WHERE ps.is_won = false AND ps.is_lost = false
            AND (
              d.whatsapp_jid = $2
              OR (
                $2 NOT LIKE '%@g.us'
                AND d.whatsapp_jid NOT LIKE '%@g.us'
                AND (
                  regexp_replace(d.whatsapp_jid, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
                  OR (
                    length(regexp_replace(d.whatsapp_jid, '\\D', '', 'g')) >= 10
                    AND length(regexp_replace($2, '\\D', '', 'g')) >= 10
                    AND (
                      CASE
                        WHEN (length(regexp_replace(d.whatsapp_jid, '\\D', '', 'g')) = 13 AND substring(regexp_replace(d.whatsapp_jid, '\\D', '', 'g') from 5 for 1) = '9') THEN
                          substring(regexp_replace(d.whatsapp_jid, '\\D', '', 'g') from 3 for 2) || right(regexp_replace(d.whatsapp_jid, '\\D', '', 'g'), 8)
                        WHEN (length(regexp_replace(d.whatsapp_jid, '\\D', '', 'g')) = 11 AND substring(regexp_replace(d.whatsapp_jid, '\\D', '', 'g') from 3 for 1) = '9') THEN
                          substring(regexp_replace(d.whatsapp_jid, '\\D', '', 'g') from 1 for 2) || right(regexp_replace(d.whatsapp_jid, '\\D', '', 'g'), 8)
                        ELSE
                          right(regexp_replace(d.whatsapp_jid, '\\D', '', 'g'), 10)
                      END
                    ) = (
                      CASE
                        WHEN (length(regexp_replace($2, '\\D', '', 'g')) = 13 AND substring(regexp_replace($2, '\\D', '', 'g') from 5 for 1) = '9') THEN
                          substring(regexp_replace($2, '\\D', '', 'g') from 3 for 2) || right(regexp_replace($2, '\\D', '', 'g'), 8)
                        WHEN (length(regexp_replace($2, '\\D', '', 'g')) = 11 AND substring(regexp_replace($2, '\\D', '', 'g') from 3 for 1) = '9') THEN
                          substring(regexp_replace($2, '\\D', '', 'g') from 1 for 2) || right(regexp_replace($2, '\\D', '', 'g'), 8)
                        ELSE
                          right(regexp_replace($2, '\\D', '', 'g'), 10)
                      END
                    )
                  )
                )
              )
            )
            AND (
              d.whatsapp_instance_id = $3::uuid
              OR (
                d.whatsapp_instance_id IS NULL
                AND (
                  d.assigned_to = $4::uuid
                  OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($5)
                )
              )
            )
          ORDER BY
            CASE WHEN d.whatsapp_instance_id = $3::uuid THEN 0 ELSE 1 END ASC,
            d.last_activity_at DESC
          LIMIT 1
        )
        SELECT id, whatsapp_instance_id
        FROM (
          SELECT id, whatsapp_instance_id, last_activity_at, 0 AS match_priority
          FROM existing_message_deal
          UNION ALL
          SELECT id, whatsapp_instance_id, last_activity_at, 1 AS match_priority
          FROM remote_jid_deal
        ) matched_deals
        ORDER BY match_priority ASC, last_activity_at DESC NULLS LAST
        LIMIT 1
        `,
        [
          messageId,
          remoteJid,
          instanceDetails?.id ?? null,
          instanceDetails?.assignedUserId ?? null,
          instanceDetails?.assignedUserName ?? "",
        ],
      );

      if (dealMatch.rows[0]) {
        const dealId = String(dealMatch.rows[0].id);

        await insertDealActivity({
          dealId,
          activityType,
          actorUserId,
          actorName,
          content: messageContent,
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
          content: messageContent,
          createdAt: context.createdAt,
          remoteJid,
          isGroup: context.isGroup,
          metadata,
          risk: detectWhatsappMessageRisk(messageContent),
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
            content: messageContent,
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
            content: messageContent,
            createdAt: context.createdAt,
            remoteJid,
            isGroup: context.isGroup,
            metadata: autoMetadata,
            risk: detectWhatsappMessageRisk(messageContent),
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
    } catch (err: any) {
      logger.error("Error processing single evolution webhook message", {
        messageId: msg?.key?.id || "unknown",
        instance,
        error: err.message || err,
        stack: err.stack,
      });
      // Continue loop instead of throwing and crashing the entire webhook payload batch
    }
  }

  return { processed: true, processedCount };
}

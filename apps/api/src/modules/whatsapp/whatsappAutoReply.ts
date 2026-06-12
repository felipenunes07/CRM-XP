import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { sendUazapiTextMessage } from "./uazapiService.js";
import { sendWhatsappInstanceTextMessage, sendWhatsappTextMessage } from "./evolutionService.js";
import { applyWhatsappMessagePlaceholders } from "./whatsappCore.js";
import { WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS } from "./whatsappCampaignService.js";

/**
 * Resposta automática de campanha: quando um cliente responde a um disparo
 * (texto, mídia ou clique em botão/enquete do menu interativo — tudo chega como
 * mensagem inbound no webhook), envia uma única vez a mensagem programada na
 * campanha (`auto_reply_text`), com placeholders como {nome} preenchidos.
 *
 * O envio único por destinatário é garantido pelo claim atômico de
 * `auto_reply_sent_at` (UPDATE ... WHERE auto_reply_sent_at IS NULL).
 */

interface AutoReplyClaim {
  recipientId: string;
  campaignId: string;
  groupId: string;
  customerId: string | null;
  jid: string;
  customerDisplayName: string | null;
  sourceName: string;
  autoReplyText: string;
  createdByUserId: string;
  createdByName: string;
  whatsappInstanceId: string | null;
}

async function claimAutoReplyRecipient(remoteJid: string): Promise<AutoReplyClaim | null> {
  const result = await pool.query(
    `
      WITH candidate AS (
        SELECT r.id
        FROM whatsapp_campaign_recipients r
        JOIN whatsapp_campaigns wc ON wc.id = r.campaign_id
        WHERE r.status = 'SENT'
          AND r.sent_at IS NOT NULL
          AND r.sent_at >= NOW() - ($2::int * INTERVAL '1 day')
          AND r.auto_reply_sent_at IS NULL
          AND COALESCE(TRIM(wc.auto_reply_text), '') <> ''
          AND wc.status <> 'CANCELLED'
          AND (
            LOWER(r.jid) = LOWER($1)
            OR (
              r.jid NOT LIKE '%@g.us'
              AND $1 NOT LIKE '%@g.us'
              AND length(regexp_replace(r.jid, '\\D', '', 'g')) >= 10
              AND length(regexp_replace($1, '\\D', '', 'g')) >= 10
              AND right(regexp_replace(r.jid, '\\D', '', 'g'), 10) = right(regexp_replace($1, '\\D', '', 'g'), 10)
            )
          )
        ORDER BY r.sent_at DESC
        LIMIT 1
      )
      UPDATE whatsapp_campaign_recipients r
      SET auto_reply_sent_at = NOW(), updated_at = NOW()
      FROM candidate
      JOIN whatsapp_campaign_recipients cr ON cr.id = candidate.id
      JOIN whatsapp_campaigns wc ON wc.id = cr.campaign_id
      WHERE r.id = candidate.id
        AND r.auto_reply_sent_at IS NULL
      RETURNING
        r.id,
        r.campaign_id,
        r.group_id,
        r.customer_id,
        r.jid,
        r.customer_display_name,
        r.source_name,
        wc.auto_reply_text,
        wc.created_by_user_id,
        wc.created_by_name,
        wc.whatsapp_instance_id
    `,
    [remoteJid, WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    recipientId: String(row.id),
    campaignId: String(row.campaign_id),
    groupId: String(row.group_id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    jid: String(row.jid),
    customerDisplayName: row.customer_display_name ? String(row.customer_display_name) : null,
    sourceName: String(row.source_name ?? ""),
    autoReplyText: String(row.auto_reply_text ?? ""),
    createdByUserId: String(row.created_by_user_id ?? ""),
    createdByName: String(row.created_by_name ?? ""),
    whatsappInstanceId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
  };
}

async function releaseAutoReplyClaim(recipientId: string) {
  await pool.query(
    `UPDATE whatsapp_campaign_recipients SET auto_reply_sent_at = NULL, updated_at = NOW() WHERE id = $1`,
    [recipientId],
  );
}

async function sendAutoReplyMessage(claim: AutoReplyClaim, messageText: string) {
  if (claim.whatsappInstanceId) {
    const instanceResult = await pool.query(
      `
        SELECT provider, instance_name, evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
        FROM whatsapp_instances
        WHERE id = $1 AND status = 'ACTIVE'
      `,
      [claim.whatsappInstanceId],
    );

    const instance = instanceResult.rows[0];
    if (instance?.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
      return sendUazapiTextMessage(
        { baseUrl: String(instance.uazapi_base_url), token: String(instance.uazapi_token) },
        claim.jid,
        messageText,
      );
    }

    if (instance?.instance_name && instance.evolution_base_url && instance.evolution_api_key) {
      return sendWhatsappInstanceTextMessage(
        {
          instanceName: String(instance.instance_name),
          evolutionBaseUrl: String(instance.evolution_base_url),
          evolutionApiKey: String(instance.evolution_api_key),
        },
        claim.jid,
        messageText,
      );
    }
  }

  return sendWhatsappTextMessage(claim.jid, messageText);
}

export async function processCampaignAutoReply(remoteJid: string) {
  const normalizedJid = String(remoteJid ?? "").trim();
  if (!normalizedJid) {
    return { sent: false };
  }

  const claim = await claimAutoReplyRecipient(normalizedJid);
  if (!claim) {
    return { sent: false };
  }

  const messageText = applyWhatsappMessagePlaceholders(claim.autoReplyText, {
    nome: claim.customerDisplayName ?? claim.sourceName,
  }).trim();

  if (!messageText) {
    return { sent: false };
  }

  try {
    const payload = await sendAutoReplyMessage(claim, messageText);

    await pool.query(
      `
        INSERT INTO message_logs (
          customer_id, template_id, destination, message, status,
          whatsapp_group_id, campaign_id, provider_payload,
          sent_by_user_id, sent_by_name
        )
        VALUES ($1, NULL, $2, $3, 'SENT', $4, $5, $6::jsonb, $7, $8)
      `,
      [
        claim.customerId,
        claim.jid,
        messageText,
        claim.groupId,
        claim.campaignId,
        JSON.stringify(payload ?? {}),
        claim.createdByUserId,
        `${claim.createdByName} (resposta automática)`,
      ],
    );

    logger.info("whatsapp campaign auto-reply sent", {
      campaignId: claim.campaignId,
      recipientId: claim.recipientId,
      jid: claim.jid,
    });

    return { sent: true, campaignId: claim.campaignId, recipientId: claim.recipientId };
  } catch (error) {
    // Libera o claim para tentar de novo na próxima resposta do cliente.
    await releaseAutoReplyClaim(claim.recipientId).catch(() => undefined);
    logger.error("whatsapp campaign auto-reply failed", {
      campaignId: claim.campaignId,
      recipientId: claim.recipientId,
      jid: claim.jid,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, failed: true };
  }
}

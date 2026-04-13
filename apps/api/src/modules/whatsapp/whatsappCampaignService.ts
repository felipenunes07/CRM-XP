import type { PoolClient } from "pg";
import type {
  WhatsappCampaignDetail,
  WhatsappCampaignListItem,
  WhatsappCampaignProgress,
  WhatsappCampaignRecipient,
  WhatsappCampaignRecipientStatus,
  WhatsappCampaignStatus,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
import { getWhatsappGroupsByIds } from "./whatsappGroupService.js";
import { computeRecentBlock, randomDelaySeconds } from "./whatsappCore.js";

export interface CreateWhatsappCampaignInput {
  name: string;
  templateId?: string | null;
  savedSegmentId?: string | null;
  messageText: string;
  filtersSnapshot?: Record<string, unknown>;
  groupIds: string[];
  overrideRecentBlock?: boolean;
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
}

export interface EnqueuedRecipientJob {
  recipientId: string;
  campaignId: string;
  delayMs: number;
}

export interface CreateWhatsappCampaignResult {
  campaignId: string;
  enqueuedJobs: EnqueuedRecipientJob[];
}

interface CampaignProgressRow {
  total_recipients: number;
  pending_count: number;
  blocked_recent_count: number;
  sending_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  next_scheduled_at: string | null;
  estimated_finish_at: string | null;
}

interface DispatchRecipientContext {
  recipientId: string;
  campaignId: string;
  groupId: string;
  customerId: string | null;
  templateId: string | null;
  jid: string;
  messageText: string;
  sourceName: string;
  sourceCode: string | null;
  createdByUserId: string;
  createdByName: string;
}

function mapProgress(row: Partial<CampaignProgressRow>): WhatsappCampaignProgress {
  const totalRecipients = Number(row.total_recipients ?? 0);
  const pendingCount = Number(row.pending_count ?? 0);
  const blockedRecentCount = Number(row.blocked_recent_count ?? 0);
  const sendingCount = Number(row.sending_count ?? 0);
  const sentCount = Number(row.sent_count ?? 0);
  const failedCount = Number(row.failed_count ?? 0);
  const skippedCount = Number(row.skipped_count ?? 0);
  const completedCount = blockedRecentCount + sentCount + failedCount + skippedCount;
  const remainingCount = pendingCount + sendingCount;

  return {
    totalRecipients,
    pendingCount,
    blockedRecentCount,
    sendingCount,
    sentCount,
    failedCount,
    skippedCount,
    completedCount,
    remainingCount,
    completionRatio: totalRecipients > 0 ? completedCount / totalRecipients : 1,
    nextScheduledAt: row.next_scheduled_at ? new Date(String(row.next_scheduled_at)).toISOString() : null,
    estimatedFinishAt: row.estimated_finish_at ? new Date(String(row.estimated_finish_at)).toISOString() : null,
  };
}

function mapCampaignRow(row: Record<string, unknown>): WhatsappCampaignListItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    status: String(row.status) as WhatsappCampaignStatus,
    templateId: row.template_id ? String(row.template_id) : null,
    templateTitle: row.template_title ? String(row.template_title) : null,
    savedSegmentId: row.saved_segment_id ? String(row.saved_segment_id) : null,
    savedSegmentName: row.saved_segment_name ? String(row.saved_segment_name) : null,
    messageText: String(row.message_text ?? ""),
    minDelaySeconds: Number(row.min_delay_seconds ?? 0),
    maxDelaySeconds: Number(row.max_delay_seconds ?? 0),
    overrideRecentBlock: Boolean(row.override_recent_block),
    createdByUserId: String(row.created_by_user_id ?? ""),
    createdByName: String(row.created_by_name ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(String(row.cancelled_at)).toISOString() : null,
    filtersSnapshot:
      row.filters_snapshot && typeof row.filters_snapshot === "object"
        ? (row.filters_snapshot as Record<string, unknown>)
        : {},
    progress: mapProgress(row as Partial<CampaignProgressRow>),
  };
}

function mapRecipientRow(row: Record<string, unknown>): WhatsappCampaignRecipient {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    groupId: String(row.group_id),
    jid: String(row.jid ?? ""),
    sourceName: String(row.source_name ?? ""),
    sourceCode: row.source_code ? String(row.source_code) : null,
    classification: String(row.classification) as WhatsappCampaignRecipient["classification"],
    mappingStatus: String(row.mapping_status) as WhatsappCampaignRecipient["mappingStatus"],
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: row.customer_code ? String(row.customer_code) : null,
    customerDisplayName: row.customer_display_name ? String(row.customer_display_name) : null,
    status: String(row.status) as WhatsappCampaignRecipientStatus,
    scheduledFor: row.scheduled_for ? new Date(String(row.scheduled_for)).toISOString() : null,
    lastAttemptAt: row.last_attempt_at ? new Date(String(row.last_attempt_at)).toISOString() : null,
    sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
    failedAt: row.failed_at ? new Date(String(row.failed_at)).toISOString() : null,
    skippedAt: row.skipped_at ? new Date(String(row.skipped_at)).toISOString() : null,
    lastError: row.last_error ? String(row.last_error) : null,
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
    providerStatus: row.provider_status ? String(row.provider_status) : null,
    responsePayload:
      row.response_payload && typeof row.response_payload === "object"
        ? (row.response_payload as Record<string, unknown>)
        : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function queryCampaignRows(limit?: number, campaignId?: string) {
  const params: unknown[] = [];
  const where = campaignId
    ? (() => {
        params.push(campaignId);
        return `WHERE wc.id = $${params.length}`;
      })()
    : "";
  const limitSql =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? (() => {
          params.push(Math.floor(limit));
          return `LIMIT $${params.length}`;
        })()
      : "";

  return pool.query(
    `
      WITH recipient_progress AS (
        SELECT
          campaign_id,
          COUNT(*)::int AS total_recipients,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
          COUNT(*) FILTER (WHERE status = 'BLOCKED_RECENT')::int AS blocked_recent_count,
          COUNT(*) FILTER (WHERE status = 'SENDING')::int AS sending_count,
          COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent_count,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
          COUNT(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped_count,
          MIN(scheduled_for) FILTER (WHERE status = 'PENDING') AS next_scheduled_at,
          MAX(scheduled_for) FILTER (WHERE status IN ('PENDING', 'SENDING')) AS estimated_finish_at
        FROM whatsapp_campaign_recipients
        GROUP BY campaign_id
      )
      SELECT
        wc.*,
        COALESCE(rp.total_recipients, 0) AS total_recipients,
        COALESCE(rp.pending_count, 0) AS pending_count,
        COALESCE(rp.blocked_recent_count, 0) AS blocked_recent_count,
        COALESCE(rp.sending_count, 0) AS sending_count,
        COALESCE(rp.sent_count, 0) AS sent_count,
        COALESCE(rp.failed_count, 0) AS failed_count,
        COALESCE(rp.skipped_count, 0) AS skipped_count,
        rp.next_scheduled_at,
        rp.estimated_finish_at
      FROM whatsapp_campaigns wc
      LEFT JOIN recipient_progress rp ON rp.campaign_id = wc.id
      ${where}
      ORDER BY wc.created_at DESC
      ${limitSql}
    `,
    params,
  );
}

export async function createWhatsappCampaign(
  input: CreateWhatsappCampaignInput,
  user: JwtUser,
): Promise<CreateWhatsappCampaignResult> {
  const trimmedName = input.name.trim();
  const trimmedMessage = input.messageText.trim();
  const uniqueGroupIds = [...new Set(input.groupIds)];
  const minDelaySeconds = input.minDelaySeconds ?? env.WHATSAPP_MIN_DELAY_SECONDS;
  const maxDelaySeconds = input.maxDelaySeconds ?? env.WHATSAPP_MAX_DELAY_SECONDS;

  if (!trimmedName) {
    throw new HttpError(400, "Defina um nome para a campanha.");
  }

  if (!trimmedMessage) {
    throw new HttpError(400, "A mensagem final nao pode ficar vazia.");
  }

  if (!uniqueGroupIds.length) {
    throw new HttpError(400, "Selecione pelo menos um grupo para disparo.");
  }

  if (minDelaySeconds > maxDelaySeconds) {
    throw new HttpError(400, "O intervalo minimo nao pode ser maior do que o maximo.");
  }

  const [groups, templateResult, savedSegmentResult] = await Promise.all([
    getWhatsappGroupsByIds(uniqueGroupIds),
    input.templateId ? pool.query("SELECT id, title FROM message_templates WHERE id = $1", [input.templateId]) : null,
    input.savedSegmentId ? pool.query("SELECT id, name FROM saved_segments WHERE id = $1", [input.savedSegmentId]) : null,
  ]);

  if (groups.length !== uniqueGroupIds.length) {
    throw new HttpError(400, "Um ou mais grupos selecionados nao foram encontrados.");
  }

  const orderedGroups = uniqueGroupIds
    .map((groupId) => groups.find((group) => group.id === groupId) ?? null)
    .filter((group): group is NonNullable<(typeof groups)[number]> => Boolean(group));

  if (input.templateId && !templateResult?.rows[0]) {
    throw new HttpError(404, "Template nao encontrado.");
  }

  if (input.savedSegmentId && !savedSegmentResult?.rows[0]) {
    throw new HttpError(404, "Publico salvo nao encontrado.");
  }

  const campaignClient = await pool.connect();
  const enqueuedJobs: EnqueuedRecipientJob[] = [];

  try {
    await campaignClient.query("BEGIN");

    const campaignInsert = await campaignClient.query(
      `
        INSERT INTO whatsapp_campaigns (
          name,
          status,
          template_id,
          template_title,
          saved_segment_id,
          saved_segment_name,
          message_text,
          filters_snapshot,
          min_delay_seconds,
          max_delay_seconds,
          override_recent_block,
          created_by_user_id,
          created_by_name
        )
        VALUES ($1, 'QUEUED', $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
        RETURNING id, created_at
      `,
      [
        trimmedName,
        input.templateId ?? null,
        templateResult?.rows[0]?.title ? String(templateResult.rows[0].title) : null,
        input.savedSegmentId ?? null,
        savedSegmentResult?.rows[0]?.name ? String(savedSegmentResult.rows[0].name) : null,
        trimmedMessage,
        JSON.stringify(input.filtersSnapshot ?? {}),
        minDelaySeconds,
        maxDelaySeconds,
        Boolean(input.overrideRecentBlock),
        user.id,
        user.name,
      ],
    );

    const campaignRow = campaignInsert.rows[0];
    const campaignId = String(campaignRow.id);
    const createdAt = new Date(String(campaignRow.created_at));

    let activeRecipientIndex = 0;
    let cumulativeDelaySeconds = 0;

    for (const group of orderedGroups) {
      const recentBlock = computeRecentBlock(group.lastContactAt, env.WHATSAPP_RECENT_CONTACT_BLOCK_DAYS);
      const blockedByRecentContact = !input.overrideRecentBlock && recentBlock.isBlocked;
      const status = blockedByRecentContact ? "BLOCKED_RECENT" : "PENDING";
      let scheduledFor: string | null = null;
      let delayMs = 0;

      if (!blockedByRecentContact) {
        if (activeRecipientIndex > 0) {
          cumulativeDelaySeconds += randomDelaySeconds(minDelaySeconds, maxDelaySeconds);
        }

        const scheduledDate = new Date(createdAt.getTime() + cumulativeDelaySeconds * 1000);
        scheduledFor = scheduledDate.toISOString();
        delayMs = Math.max(0, scheduledDate.getTime() - Date.now());
        activeRecipientIndex += 1;
      }

      const recipientInsert = await campaignClient.query(
        `
          INSERT INTO whatsapp_campaign_recipients (
            campaign_id,
            group_id,
            customer_id,
            jid,
            source_name,
            source_code,
            classification,
            mapping_status,
            customer_code,
            customer_display_name,
            status,
            scheduled_for
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)
          RETURNING id
        `,
        [
          campaignId,
          group.id,
          group.customerId,
          group.jid,
          group.sourceName,
          group.sourceCode,
          group.classification,
          group.mappingStatus,
          group.customerCode,
          group.customerDisplayName,
          status,
          scheduledFor,
        ],
      );

      if (status === "PENDING") {
        enqueuedJobs.push({
          recipientId: String(recipientInsert.rows[0].id),
          campaignId,
          delayMs,
        });
      }
    }

    if (!enqueuedJobs.length) {
      await campaignClient.query(
        `
          UPDATE whatsapp_campaigns
          SET status = 'COMPLETED', finished_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [campaignId],
      );
    }

    await campaignClient.query("COMMIT");

    return {
      campaignId,
      enqueuedJobs,
    };
  } catch (error) {
    await campaignClient.query("ROLLBACK");
    throw error;
  } finally {
    campaignClient.release();
  }
}

export async function listWhatsappCampaigns(limit = 20): Promise<WhatsappCampaignListItem[]> {
  const result = await queryCampaignRows(limit);
  return result.rows.map((row) => mapCampaignRow(row));
}

export async function getWhatsappCampaignDetail(
  campaignId: string,
  limit = 100,
  offset = 0,
): Promise<WhatsappCampaignDetail | null> {
  const [campaignResult, recipientsResult, totalRecipientsResult] = await Promise.all([
    queryCampaignRows(undefined, campaignId),
    pool.query(
      `
        SELECT *
        FROM whatsapp_campaign_recipients
        WHERE campaign_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
      `,
      [campaignId, limit, offset],
    ),
    pool.query("SELECT COUNT(*)::int AS total FROM whatsapp_campaign_recipients WHERE campaign_id = $1", [campaignId]),
  ]);

  const campaignRow = campaignResult.rows[0];
  if (!campaignRow) {
    return null;
  }

  const totalRecipients = Number(totalRecipientsResult.rows[0]?.total ?? 0);
  const base = mapCampaignRow(campaignRow);

  return {
    ...base,
    recipients: recipientsResult.rows.map((row) => mapRecipientRow(row)),
    recipientsPage: {
      total: totalRecipients,
      offset,
      limit,
      hasMore: offset + recipientsResult.rows.length < totalRecipients,
    },
  };
}

export async function cancelWhatsappCampaign(campaignId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const campaignResult = await client.query(
      `
        UPDATE whatsapp_campaigns
        SET
          status = 'CANCELLED',
          cancelled_at = COALESCE(cancelled_at, NOW()),
          finished_at = CASE
            WHEN EXISTS (
              SELECT 1
              FROM whatsapp_campaign_recipients
              WHERE campaign_id = $1
                AND status = 'SENDING'
            ) THEN finished_at
            ELSE COALESCE(finished_at, NOW())
          END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [campaignId],
    );

    if (!campaignResult.rows[0]) {
      throw new HttpError(404, "Campanha nao encontrada.");
    }

    await client.query(
      `
        UPDATE whatsapp_campaign_recipients
        SET
          status = 'SKIPPED',
          skipped_at = NOW(),
          updated_at = NOW()
        WHERE campaign_id = $1
          AND status = 'PENDING'
      `,
      [campaignId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await refreshWhatsappCampaignStatus(campaignId);
  return getWhatsappCampaignDetail(campaignId, 100, 0);
}

export async function claimRecipientForDispatch(recipientId: string): Promise<DispatchRecipientContext | null> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT
          r.id,
          r.campaign_id,
          r.group_id,
          r.customer_id,
          r.jid,
          r.source_name,
          r.source_code,
          r.status AS recipient_status,
          wc.status AS campaign_status,
          wc.message_text,
          wc.template_id,
          wc.created_by_user_id,
          wc.created_by_name
        FROM whatsapp_campaign_recipients r
        JOIN whatsapp_campaigns wc ON wc.id = r.campaign_id
        WHERE r.id = $1
        FOR UPDATE
      `,
      [recipientId],
    );

    const row = result.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    if (String(row.campaign_status) === "CANCELLED") {
      if (String(row.recipient_status) === "PENDING") {
        await client.query(
          `
            UPDATE whatsapp_campaign_recipients
            SET status = 'SKIPPED', skipped_at = NOW(), updated_at = NOW()
            WHERE id = $1
          `,
          [recipientId],
        );
      }

      await client.query("COMMIT");
      await refreshWhatsappCampaignStatus(String(row.campaign_id));
      return null;
    }

    if (String(row.recipient_status) !== "PENDING") {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
        UPDATE whatsapp_campaigns
        SET
          status = CASE WHEN status = 'QUEUED' THEN 'IN_PROGRESS' ELSE status END,
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
      `,
      [row.campaign_id],
    );

    await client.query(
      `
        UPDATE whatsapp_campaign_recipients
        SET
          status = 'SENDING',
          last_attempt_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [recipientId],
    );

    await client.query("COMMIT");

    return {
      recipientId: String(row.id),
      campaignId: String(row.campaign_id),
      groupId: String(row.group_id),
      customerId: row.customer_id ? String(row.customer_id) : null,
      templateId: row.template_id ? String(row.template_id) : null,
      jid: String(row.jid),
      messageText: String(row.message_text),
      sourceName: String(row.source_name ?? ""),
      sourceCode: row.source_code ? String(row.source_code) : null,
      createdByUserId: String(row.created_by_user_id ?? ""),
      createdByName: String(row.created_by_name ?? ""),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertMessageLog(client: PoolClient, input: {
  campaignId: string;
  groupId: string;
  customerId: string | null;
  templateId: string | null;
  destination: string;
  message: string;
  status: string;
  providerPayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  sentByUserId: string;
  sentByName: string;
}) {
  await client.query(
    `
      INSERT INTO message_logs (
        customer_id,
        template_id,
        destination,
        message,
        status,
        whatsapp_group_id,
        campaign_id,
        provider_payload,
        error_message,
        sent_by_user_id,
        sent_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
    `,
    [
      input.customerId,
      input.templateId,
      input.destination,
      input.message,
      input.status,
      input.groupId,
      input.campaignId,
      input.providerPayload ? JSON.stringify(input.providerPayload) : null,
      input.errorMessage ?? null,
      input.sentByUserId,
      input.sentByName,
    ],
  );
}

export async function markRecipientSent(
  context: DispatchRecipientContext,
  responsePayload: Record<string, unknown> | null,
  providerMessageId: string | null,
  providerStatus: string | null,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        UPDATE whatsapp_campaign_recipients
        SET
          status = 'SENT',
          sent_at = NOW(),
          provider_message_id = $2,
          provider_status = $3,
          response_payload = $4::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      [context.recipientId, providerMessageId, providerStatus, JSON.stringify(responsePayload ?? {})],
    );

    await client.query(
      `
        UPDATE whatsapp_groups
        SET
          last_contact_at = NOW(),
          last_campaign_id = $2,
          last_message_preview = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [context.groupId, context.campaignId, context.messageText],
    );

    if (context.customerId) {
      await client.query(
        `
          UPDATE customers
          SET
            last_contact_at = NOW(),
            last_message_preview = $2,
            last_contact_campaign_id = $3,
            updated_at = NOW()
          WHERE id = $1
        `,
        [context.customerId, context.messageText, context.campaignId],
      );
    }

    await insertMessageLog(client, {
      campaignId: context.campaignId,
      groupId: context.groupId,
      customerId: context.customerId,
      templateId: context.templateId,
      destination: context.jid,
      message: context.messageText,
      status: "SENT",
      providerPayload: responsePayload,
      sentByUserId: context.createdByUserId,
      sentByName: context.createdByName,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await refreshWhatsappCampaignStatus(context.campaignId);
}

export async function markRecipientFailed(
  context: DispatchRecipientContext,
  errorMessage: string,
  responsePayload: Record<string, unknown> | null = null,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        UPDATE whatsapp_campaign_recipients
        SET
          status = 'FAILED',
          failed_at = NOW(),
          last_error = $2,
          provider_status = 'FAILED',
          response_payload = $3::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      [context.recipientId, errorMessage, JSON.stringify(responsePayload ?? {})],
    );

    await insertMessageLog(client, {
      campaignId: context.campaignId,
      groupId: context.groupId,
      customerId: context.customerId,
      templateId: context.templateId,
      destination: context.jid,
      message: context.messageText,
      status: "FAILED",
      providerPayload: responsePayload,
      errorMessage,
      sentByUserId: context.createdByUserId,
      sentByName: context.createdByName,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await refreshWhatsappCampaignStatus(context.campaignId);
}

export async function refreshWhatsappCampaignStatus(campaignId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const campaignResult = await client.query(
      `
        SELECT id, status, cancelled_at, started_at, finished_at
        FROM whatsapp_campaigns
        WHERE id = $1
        FOR UPDATE
      `,
      [campaignId],
    );

    const campaign = campaignResult.rows[0];
    if (!campaign) {
      await client.query("ROLLBACK");
      return null;
    }

    const progressResult = await client.query(
      `
        SELECT
          COUNT(*)::int AS total_recipients,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
          COUNT(*) FILTER (WHERE status = 'SENDING')::int AS sending_count,
          COUNT(*) FILTER (WHERE status = 'BLOCKED_RECENT')::int AS blocked_recent_count,
          COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent_count,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
          COUNT(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped_count
        FROM whatsapp_campaign_recipients
        WHERE campaign_id = $1
      `,
      [campaignId],
    );

    const row = progressResult.rows[0] ?? {};
    const pendingCount = Number(row.pending_count ?? 0);
    const sendingCount = Number(row.sending_count ?? 0);
    const processedCount =
      Number(row.blocked_recent_count ?? 0) +
      Number(row.sent_count ?? 0) +
      Number(row.failed_count ?? 0) +
      Number(row.skipped_count ?? 0);
    const totalRecipients = Number(row.total_recipients ?? 0);

    let nextStatus: WhatsappCampaignStatus;
    let finishedAtSql = "finished_at";

    if (campaign.cancelled_at) {
      nextStatus = "CANCELLED";
      if (pendingCount === 0 && sendingCount === 0) {
        finishedAtSql = "COALESCE(finished_at, NOW())";
      }
    } else if (pendingCount === 0 && sendingCount === 0 && totalRecipients > 0) {
      nextStatus = "COMPLETED";
      finishedAtSql = "COALESCE(finished_at, NOW())";
    } else if (processedCount > 0 || sendingCount > 0) {
      nextStatus = "IN_PROGRESS";
    } else {
      nextStatus = "QUEUED";
    }

    await client.query(
      `
        UPDATE whatsapp_campaigns
        SET
          status = $2,
          started_at = CASE
            WHEN $2 = 'IN_PROGRESS' THEN COALESCE(started_at, NOW())
            ELSE started_at
          END,
          finished_at = ${finishedAtSql},
          updated_at = NOW()
        WHERE id = $1
      `,
      [campaignId, nextStatus],
    );

    await client.query("COMMIT");
    return nextStatus;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

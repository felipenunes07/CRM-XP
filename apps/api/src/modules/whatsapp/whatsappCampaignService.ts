import type { PoolClient } from "pg";
import type {
  WhatsappCampaignAttributedMessage,
  CarouselSlide,
  WhatsappCampaignDetail,
  WhatsappCampaignListItem,
  WhatsappCampaignMessageType,
  WhatsappCampaignPerformance,
  WhatsappCampaignPerformanceDiagnosis,
  WhatsappCampaignRecipientPerformance,
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

export const WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS = 7;

export interface CreateWhatsappCampaignInput {
  name: string;
  templateId?: string | null;
  savedSegmentId?: string | null;
  whatsappInstanceId?: string | null;
  messageText: string;
  messageType?: WhatsappCampaignMessageType;
  carouselData?: CarouselSlide[] | null;
  videoUrl?: string | null;
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

export interface ListDueWhatsappCampaignRecipientJobsOptions {
  campaignId?: string;
  limit?: number;
  now?: Date;
}

export interface RecoverWhatsappCampaignDispatchFailuresOptions {
  campaignId?: string;
  limit?: number;
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

interface CampaignPerformanceRecipientRow {
  recipient_id: string;
  first_response_at: string | null;
  response_count: number;
  first_order_at: string | null;
  orders_count: number;
  pieces: number;
  revenue: number;
}

interface DispatchRecipientContext {
  recipientId: string;
  campaignId: string;
  groupId: string;
  customerId: string | null;
  templateId: string | null;
  jid: string;
  messageText: string;
  messageType: WhatsappCampaignMessageType;
  carouselData: CarouselSlide[] | null;
  videoUrl: string | null;
  sourceName: string;
  sourceCode: string | null;
  createdByUserId: string;
  createdByName: string;
  evolutionInstance: {
    instanceName: string;
    evolutionBaseUrl: string;
    evolutionApiKey: string;
  } | null;
  uazapiInstance: {
    baseUrl: string;
    token: string;
  } | null;
}

function toIsoStringOrNull(value: unknown) {
  return value ? new Date(String(value)).toISOString() : null;
}

function numericValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

export function normalizeWhatsappCampaignMessageText(input: {
  messageText: string;
  messageType?: WhatsappCampaignMessageType;
}) {
  const trimmedMessage = input.messageText.trim();
  const messageType = input.messageType ?? "TEXT";

  if (!trimmedMessage && messageType !== "VIDEO") {
    throw new HttpError(400, "A mensagem final nao pode ficar vazia.");
  }

  return trimmedMessage;
}

export function isWithinWhatsappCampaignAttributionWindow(
  sentAt: string | Date | null | undefined,
  eventAt: string | Date | null | undefined,
  windowDays = WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS,
) {
  if (!sentAt || !eventAt) {
    return false;
  }

  const sentMs = new Date(sentAt).getTime();
  const eventMs = new Date(eventAt).getTime();

  if (!Number.isFinite(sentMs) || !Number.isFinite(eventMs)) {
    return false;
  }

  return eventMs >= sentMs && eventMs < sentMs + windowDays * 24 * 60 * 60 * 1000;
}

export function shouldCurrentCampaignKeepAttribution(input: {
  currentSentAt: string | Date | null | undefined;
  eventAt: string | Date | null | undefined;
  newerSentAt?: string | Date | null;
  windowDays?: number;
}) {
  if (!isWithinWhatsappCampaignAttributionWindow(input.currentSentAt, input.eventAt, input.windowDays)) {
    return false;
  }

  if (!input.newerSentAt) {
    return true;
  }

  const currentSentMs = new Date(input.currentSentAt as string | Date).getTime();
  const eventMs = new Date(input.eventAt as string | Date).getTime();
  const newerSentMs = new Date(input.newerSentAt).getTime();

  if (!Number.isFinite(currentSentMs) || !Number.isFinite(eventMs) || !Number.isFinite(newerSentMs)) {
    return true;
  }

  return !(newerSentMs > currentSentMs && newerSentMs <= eventMs);
}

export interface WhatsappCampaignAttributionIdentity {
  customerId?: string | null;
  customerCode?: string | null;
  jid?: string | null;
}

export interface WhatsappCampaignAttributionRecipient extends WhatsappCampaignAttributionIdentity {
  id: string;
  sentAt: string | Date | null;
}

export interface WhatsappCampaignAttributionEvent extends WhatsappCampaignAttributionIdentity {
  eventAt: string | Date | null;
}

function normalizedDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function whatsappCampaignIdentityMatches(
  left: WhatsappCampaignAttributionIdentity,
  right: WhatsappCampaignAttributionIdentity,
) {
  if (left.customerId && right.customerId && left.customerId === right.customerId) {
    return true;
  }

  if (left.customerCode && right.customerCode && left.customerCode.toLowerCase() === right.customerCode.toLowerCase()) {
    return true;
  }

  if (left.jid && right.jid) {
    if (left.jid.toLowerCase() === right.jid.toLowerCase()) {
      return true;
    }

    const leftDigits = normalizedDigits(left.jid);
    const rightDigits = normalizedDigits(right.jid);
    return Boolean(leftDigits && leftDigits === rightDigits);
  }

  return false;
}

export function pickMostRecentWhatsappCampaignAttribution(
  recipients: WhatsappCampaignAttributionRecipient[],
  event: WhatsappCampaignAttributionEvent,
  windowDays = WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS,
) {
  return recipients
    .filter((recipient) =>
      whatsappCampaignIdentityMatches(recipient, event) &&
      isWithinWhatsappCampaignAttributionWindow(recipient.sentAt, event.eventAt, windowDays),
    )
    .sort((left, right) => new Date(right.sentAt as string | Date).getTime() - new Date(left.sentAt as string | Date).getTime())[0] ?? null;
}

export function buildWhatsappCampaignDiagnosis(input: {
  sentRecipients: number;
  blockedRecipients: number;
  failedRecipients: number;
  responseRate: number;
  purchaseRate: number;
  purchasedRecipients: number;
}): WhatsappCampaignPerformanceDiagnosis {
  const attemptedRecipients = input.sentRecipients + input.failedRecipients + input.blockedRecipients;
  const deliveryIssueRate = attemptedRecipients > 0
    ? (input.failedRecipients + input.blockedRecipients) / attemptedRecipients
    : 0;

  if (attemptedRecipients === 0) {
    return {
      tone: "neutral",
      title: "Campanha sem envios concluídos",
      description: "Ainda não há volume de envio suficiente para avaliar resposta ou venda.",
    };
  }

  if (deliveryIssueRate >= 0.25) {
    return {
      tone: "danger",
      title: "Base ou bloqueio limitaram a campanha",
      description: "Uma parte relevante do público ficou bloqueada ou falhou antes de chegar ao atendimento.",
    };
  }

  if (input.responseRate >= 0.2 && input.purchaseRate >= 0.08 && input.purchasedRecipients > 0) {
    return {
      tone: "success",
      title: "Campanha performou bem",
      description: "O público respondeu e uma parte relevante converteu em compra dentro da janela de atribuição.",
    };
  }

  if (input.responseRate >= 0.2 && input.purchaseRate < 0.08) {
    return {
      tone: "warning",
      title: "Boa resposta, baixa conversão",
      description: "A mensagem gerou conversa, mas oferta, preço, estoque ou follow-up podem ter travado a compra.",
    };
  }

  if (input.sentRecipients >= 10 && input.responseRate < 0.08) {
    return {
      tone: "warning",
      title: "Público ou mensagem não engajaram",
      description: "O disparo chegou ao público, mas poucas pessoas responderam dentro da janela de acompanhamento.",
    };
  }

  return {
    tone: "neutral",
    title: "Performance em observação",
    description: "A campanha tem poucos sinais conclusivos; acompanhe respostas e compras nos próximos dias.",
  };
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
    messageType: (String(row.message_type ?? "TEXT")) as WhatsappCampaignMessageType,
    carouselData: row.carousel_data && Array.isArray(row.carousel_data) ? (row.carousel_data as CarouselSlide[]) : null,
    videoUrl: row.video_url ? String(row.video_url) : null,
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
    responded: Boolean(row.responded),
    firstResponseAt: toIsoStringOrNull(row.first_response_at),
    responseCount: numericValue(row.response_count),
    purchased: Boolean(row.purchased),
    firstOrderAt: toIsoStringOrNull(row.first_order_at),
    ordersCount: numericValue(row.orders_count),
    pieces: numericValue(row.pieces),
    revenue: numericValue(row.revenue),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function blankRecipientPerformance(recipientId: string): WhatsappCampaignRecipientPerformance {
  return {
    recipientId,
    responded: false,
    firstResponseAt: null,
    responseCount: 0,
    purchased: false,
    firstOrderAt: null,
    ordersCount: 0,
    pieces: 0,
    revenue: 0,
  };
}

function mapRecipientPerformance(row: CampaignPerformanceRecipientRow): WhatsappCampaignRecipientPerformance {
  const responseCount = numericValue(row.response_count);
  const ordersCount = numericValue(row.orders_count);

  return {
    recipientId: String(row.recipient_id),
    responded: responseCount > 0,
    firstResponseAt: toIsoStringOrNull(row.first_response_at),
    responseCount,
    purchased: ordersCount > 0,
    firstOrderAt: toIsoStringOrNull(row.first_order_at),
    ordersCount,
    pieces: numericValue(row.pieces),
    revenue: numericValue(row.revenue),
  };
}

function mergeRecipientPerformance(
  recipient: WhatsappCampaignRecipient,
  performance: WhatsappCampaignRecipientPerformance,
): WhatsappCampaignRecipient {
  return {
    ...recipient,
    responded: performance.responded,
    firstResponseAt: performance.firstResponseAt,
    responseCount: performance.responseCount,
    purchased: performance.purchased,
    firstOrderAt: performance.firstOrderAt,
    ordersCount: performance.ordersCount,
    pieces: performance.pieces,
    revenue: performance.revenue,
  };
}

function mapAttributedMessage(row: Record<string, unknown>): WhatsappCampaignAttributedMessage {
  return {
    id: String(row.id),
    recipientId: row.recipient_id ? String(row.recipient_id) : null,
    campaignId: String(row.campaign_id),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: row.customer_code ? String(row.customer_code) : null,
    customerDisplayName: row.customer_display_name ? String(row.customer_display_name) : null,
    jid: row.jid ? String(row.jid) : null,
    direction: String(row.direction) as WhatsappCampaignAttributedMessage["direction"],
    source: String(row.source) as WhatsappCampaignAttributedMessage["source"],
    senderName: row.sender_name ? String(row.sender_name) : null,
    content: String(row.content ?? ""),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

const eventIdentityMatchSql = (eventAlias: string, recipientAlias: string) => `
  (
    (${eventAlias}.customer_id IS NOT NULL AND ${recipientAlias}.customer_id IS NOT NULL AND ${eventAlias}.customer_id = ${recipientAlias}.customer_id)
    OR (${eventAlias}.customer_code IS NOT NULL AND ${recipientAlias}.customer_code IS NOT NULL AND LOWER(${eventAlias}.customer_code) = LOWER(${recipientAlias}.customer_code))
    OR (${eventAlias}.event_jid IS NOT NULL AND ${recipientAlias}.jid IS NOT NULL AND LOWER(${eventAlias}.event_jid) = LOWER(${recipientAlias}.jid))
  )
`;

const orderIdentityMatchSql = (orderAlias: string, recipientAlias: string) => `
  (
    (${orderAlias}.customer_id IS NOT NULL AND ${recipientAlias}.customer_id IS NOT NULL AND ${orderAlias}.customer_id = ${recipientAlias}.customer_id)
    OR (${orderAlias}.customer_code IS NOT NULL AND ${recipientAlias}.customer_code IS NOT NULL AND LOWER(${orderAlias}.customer_code) = LOWER(${recipientAlias}.customer_code))
  )
`;

async function getWhatsappCampaignPerformance(campaignId: string, excludePerformance = false): Promise<WhatsappCampaignPerformance> {
  const recipientsResult = await pool.query(
    `
      SELECT id, status
      FROM whatsapp_campaign_recipients
      WHERE campaign_id = $1
    `,
    [campaignId],
  );

  const recipientStatusRows = recipientsResult.rows.map((row) => ({
    id: String(row.id),
    status: String(row.status) as WhatsappCampaignRecipientStatus,
  }));

  const sentRecipients = recipientStatusRows.filter((row) => row.status === "SENT").length;

  if (sentRecipients === 0 || excludePerformance) {
    const recipientPerformance = new Map<string, WhatsappCampaignRecipientPerformance>();
    for (const recipient of recipientStatusRows) {
      recipientPerformance.set(recipient.id, blankRecipientPerformance(recipient.id));
    }
    const blockedRecipients = recipientStatusRows.filter((row) => row.status === "BLOCKED_RECENT").length;
    const failedRecipients = recipientStatusRows.filter((row) => row.status === "FAILED").length;
    const skippedRecipients = recipientStatusRows.filter((row) => row.status === "SKIPPED").length;
    const performanceRecipients = Array.from(recipientPerformance.values());

    return {
      attributionWindowDays: WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS,
      totalRecipients: recipientStatusRows.length,
      eligibleRecipients: 0,
      sentRecipients: 0,
      blockedRecipients,
      failedRecipients,
      skippedRecipients,
      respondedRecipients: 0,
      notRespondedRecipients: 0,
      purchasedRecipients: 0,
      responseRate: 0,
      purchaseRate: 0,
      orderCount: 0,
      pieces: 0,
      revenue: 0,
      sentMessages: 0,
      receivedMessages: 0,
      diagnosis: buildWhatsappCampaignDiagnosis({
        sentRecipients: 0,
        blockedRecipients,
        failedRecipients,
        responseRate: 0,
        purchaseRate: 0,
        purchasedRecipients: 0,
      }),
      recipients: performanceRecipients,
      messages: [],
    };
  }

  const [inboundResult, purchaseResult, outboundResult] = await Promise.all([
    pool.query(
      `
        WITH campaign_recipients AS (
          SELECT
            id,
            campaign_id,
            customer_id,
            customer_code,
            customer_display_name,
            jid,
            sent_at
          FROM whatsapp_campaign_recipients
          WHERE campaign_id = $1
            AND status = 'SENT'
            AND sent_at IS NOT NULL
        ),
        campaign_scope AS (
          SELECT
            MIN(sent_at) AS first_sent_at,
            MAX(sent_at) + ($2::int * INTERVAL '1 day') AS last_window_at
          FROM campaign_recipients
        ),
        inbound_candidates AS (
          SELECT
            COALESCE(NULLIF(da.metadata ->> 'messageId', ''), da.id::text) AS event_key,
            da.id::text AS id,
            da.created_at,
            COALESCE(NULLIF(da.content, ''), '[Mensagem sem texto]') AS content,
            da.actor_name AS sender_name,
            COALESCE(NULLIF(da.metadata ->> 'remoteJid', ''), d.whatsapp_jid) AS event_jid,
            d.customer_id,
            d.customer_code,
            0 AS source_priority,
            'deal_activities' AS source
          FROM deal_activities da
          JOIN deals d ON d.id = da.deal_id
          CROSS JOIN campaign_scope cs
          WHERE da.activity_type = 'WHATSAPP_RECEIVED'
            AND cs.first_sent_at IS NOT NULL
            AND da.created_at >= cs.first_sent_at
            AND da.created_at < cs.last_window_at

          UNION ALL

          SELECT
            wim.message_id AS event_key,
            wim.id::text AS id,
            wim.created_at,
            COALESCE(NULLIF(wim.message_text, ''), '[Mensagem sem texto]') AS content,
            COALESCE(NULLIF(wim.participant_name, ''), NULLIF(wim.sender_name, '')) AS sender_name,
            wim.remote_jid AS event_jid,
            NULL::uuid AS customer_id,
            NULL::text AS customer_code,
            1 AS source_priority,
            'whatsapp_incoming_messages' AS source
          FROM whatsapp_incoming_messages wim
          CROSS JOIN campaign_scope cs
          WHERE COALESCE(wim.from_me, false) = false
            AND cs.first_sent_at IS NOT NULL
            AND wim.created_at >= cs.first_sent_at
            AND wim.created_at < cs.last_window_at
        ),
        inbound_events AS (
          SELECT DISTINCT ON (event_key)
            event_key,
            id,
            created_at,
            content,
            sender_name,
            event_jid,
            customer_id,
            customer_code,
            source
          FROM inbound_candidates
          WHERE COALESCE(event_key, '') <> ''
          ORDER BY event_key, source_priority ASC, created_at ASC
        ),
        attributed_messages AS (
          SELECT DISTINCT ON (event_key)
            e.event_key,
            e.id,
            r.id AS recipient_id,
            r.campaign_id,
            r.customer_id,
            r.customer_code,
            r.customer_display_name,
            r.jid,
            'INBOUND'::text AS direction,
            e.source,
            e.sender_name,
            e.content,
            e.created_at
          FROM inbound_events e
          JOIN campaign_recipients r
            ON e.created_at >= r.sent_at
           AND e.created_at < r.sent_at + ($2::int * INTERVAL '1 day')
           AND ${eventIdentityMatchSql("e", "r")}
          WHERE NOT EXISTS (
            SELECT 1
            FROM whatsapp_campaign_recipients newer
            WHERE newer.status = 'SENT'
              AND newer.sent_at IS NOT NULL
              AND newer.sent_at > r.sent_at
              AND newer.sent_at <= e.created_at
              AND newer.id <> r.id
              AND ${eventIdentityMatchSql("e", "newer")}
          )
          ORDER BY e.event_key, r.sent_at DESC, r.id
        )
        SELECT *
        FROM attributed_messages
        ORDER BY created_at ASC, id ASC
      `,
      [campaignId, WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS],
    ),
    pool.query(
      `
        WITH campaign_recipients AS (
          SELECT
            id,
            customer_id,
            customer_code,
            jid,
            sent_at
          FROM whatsapp_campaign_recipients
          WHERE campaign_id = $1
            AND status = 'SENT'
            AND sent_at IS NOT NULL
        ),
        campaign_scope AS (
          SELECT
            MIN(sent_at)::date AS first_sent_date,
            (MAX(sent_at) + ($2::int * INTERVAL '1 day'))::date AS last_window_date
          FROM campaign_recipients
        ),
        order_totals AS (
          SELECT
            o.id,
            o.customer_id,
            o.customer_code,
            o.order_date,
            o.total_amount,
            COALESCE(SUM(oi.quantity), 0) AS pieces
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          CROSS JOIN campaign_scope cs
          WHERE cs.first_sent_date IS NOT NULL
            AND o.order_date >= cs.first_sent_date
            AND o.order_date <= cs.last_window_date
          GROUP BY o.id, o.customer_id, o.customer_code, o.order_date, o.total_amount
        ),
        attributed_orders AS (
          SELECT DISTINCT ON (o.id)
            o.id,
            r.id AS recipient_id,
            o.order_date,
            o.total_amount,
            o.pieces
          FROM order_totals o
          JOIN campaign_recipients r
            ON o.order_date >= r.sent_at::date
           AND o.order_date <= (r.sent_at + ($2::int * INTERVAL '1 day'))::date
           AND ${orderIdentityMatchSql("o", "r")}
          WHERE NOT EXISTS (
            SELECT 1
            FROM whatsapp_campaign_recipients newer
            WHERE newer.status = 'SENT'
              AND newer.sent_at IS NOT NULL
              AND newer.sent_at > r.sent_at
              AND newer.sent_at::date <= o.order_date
              AND newer.id <> r.id
              AND ${orderIdentityMatchSql("o", "newer")}
          )
          ORDER BY o.id, r.sent_at DESC, r.id
        )
        SELECT
          recipient_id,
          MIN(order_date)::text AS first_order_at,
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(pieces), 0)::numeric(14,2) AS pieces,
          COALESCE(SUM(total_amount), 0)::numeric(14,2) AS revenue
        FROM attributed_orders
        GROUP BY recipient_id
      `,
      [campaignId, WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS],
    ),
    pool.query(
      `
        SELECT
          ml.id::text AS id,
          r.id AS recipient_id,
          ml.campaign_id,
          ml.customer_id,
          COALESCE(r.customer_code, c.customer_code) AS customer_code,
          COALESCE(r.customer_display_name, c.display_name) AS customer_display_name,
          COALESCE(r.jid, ml.destination) AS jid,
          'OUTBOUND'::text AS direction,
          'message_logs'::text AS source,
          ml.sent_by_name AS sender_name,
          ml.message AS content,
          ml.created_at
        FROM message_logs ml
        LEFT JOIN customers c ON c.id = ml.customer_id
        LEFT JOIN whatsapp_campaign_recipients r
          ON r.campaign_id = ml.campaign_id
         AND (
           r.group_id = ml.whatsapp_group_id
           OR (ml.customer_id IS NOT NULL AND r.customer_id = ml.customer_id)
           OR (ml.destination IS NOT NULL AND LOWER(r.jid) = LOWER(ml.destination))
         )
        WHERE ml.campaign_id = $1
          AND ml.status = 'SENT'
        ORDER BY ml.created_at ASC, ml.id ASC
      `,
      [campaignId],
    ),
  ]);

  const recipientPerformance = new Map<string, WhatsappCampaignRecipientPerformance>();
  for (const recipient of recipientStatusRows) {
    recipientPerformance.set(recipient.id, blankRecipientPerformance(recipient.id));
  }

  for (const row of inboundResult.rows) {
    const recipientId = String(row.recipient_id);
    const current = recipientPerformance.get(recipientId) ?? blankRecipientPerformance(recipientId);
    current.responseCount += 1;
    current.responded = true;
    const createdAt = toIsoStringOrNull(row.created_at);
    if (createdAt && (!current.firstResponseAt || createdAt < current.firstResponseAt)) {
      current.firstResponseAt = createdAt;
    }
    recipientPerformance.set(recipientId, current);
  }

  for (const row of purchaseResult.rows as CampaignPerformanceRecipientRow[]) {
    const purchasePerformance = mapRecipientPerformance({
      recipient_id: String(row.recipient_id),
      first_response_at: null,
      response_count: 0,
      first_order_at: row.first_order_at,
      orders_count: row.orders_count,
      pieces: row.pieces,
      revenue: row.revenue,
    });
    const current = recipientPerformance.get(purchasePerformance.recipientId) ?? blankRecipientPerformance(purchasePerformance.recipientId);
    current.purchased = purchasePerformance.purchased;
    current.firstOrderAt = purchasePerformance.firstOrderAt;
    current.ordersCount = purchasePerformance.ordersCount;
    current.pieces = purchasePerformance.pieces;
    current.revenue = purchasePerformance.revenue;
    recipientPerformance.set(purchasePerformance.recipientId, current);
  }

  const blockedRecipients = recipientStatusRows.filter((row) => row.status === "BLOCKED_RECENT").length;
  const failedRecipients = recipientStatusRows.filter((row) => row.status === "FAILED").length;
  const skippedRecipients = recipientStatusRows.filter((row) => row.status === "SKIPPED").length;
  const performanceRecipients = Array.from(recipientPerformance.values());
  const respondedRecipients = performanceRecipients.filter((recipient) => recipient.responded).length;
  const purchasedRecipients = performanceRecipients.filter((recipient) => recipient.purchased).length;
  const responseRate = ratio(respondedRecipients, sentRecipients);
  const purchaseRate = ratio(purchasedRecipients, sentRecipients);
  const inboundMessages = inboundResult.rows.map((row) => mapAttributedMessage(row));
  const outboundMessages = outboundResult.rows.map((row) => mapAttributedMessage(row));

  const messages = [...outboundMessages, ...inboundMessages]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(0, 500);

  return {
    attributionWindowDays: WHATSAPP_CAMPAIGN_ATTRIBUTION_WINDOW_DAYS,
    totalRecipients: recipientStatusRows.length,
    eligibleRecipients: sentRecipients,
    sentRecipients,
    blockedRecipients,
    failedRecipients,
    skippedRecipients,
    respondedRecipients,
    notRespondedRecipients: Math.max(0, sentRecipients - respondedRecipients),
    purchasedRecipients,
    responseRate,
    purchaseRate,
    orderCount: performanceRecipients.reduce((sum, recipient) => sum + recipient.ordersCount, 0),
    pieces: performanceRecipients.reduce((sum, recipient) => sum + recipient.pieces, 0),
    revenue: performanceRecipients.reduce((sum, recipient) => sum + recipient.revenue, 0),
    sentMessages: outboundMessages.length,
    receivedMessages: inboundMessages.length,
    diagnosis: buildWhatsappCampaignDiagnosis({
      sentRecipients,
      blockedRecipients,
      failedRecipients,
      responseRate,
      purchaseRate,
      purchasedRecipients,
    }),
    recipients: performanceRecipients,
    messages,
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
      WITH selected_campaigns AS (
        SELECT wc.*
        FROM whatsapp_campaigns wc
        ${where}
        ORDER BY wc.created_at DESC
        ${limitSql}
      ),
      recipient_progress AS (
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
        WHERE campaign_id IN (SELECT id FROM selected_campaigns)
        GROUP BY campaign_id
      )
      SELECT
        sc.*,
        COALESCE(rp.total_recipients, 0) AS total_recipients,
        COALESCE(rp.pending_count, 0) AS pending_count,
        COALESCE(rp.blocked_recent_count, 0) AS blocked_recent_count,
        COALESCE(rp.sending_count, 0) AS sending_count,
        COALESCE(rp.sent_count, 0) AS sent_count,
        COALESCE(rp.failed_count, 0) AS failed_count,
        COALESCE(rp.skipped_count, 0) AS skipped_count,
        rp.next_scheduled_at,
        rp.estimated_finish_at
      FROM selected_campaigns sc
      LEFT JOIN recipient_progress rp ON rp.campaign_id = sc.id
      ORDER BY sc.created_at DESC
    `,
    params,
  );
}

export async function createWhatsappCampaign(
  input: CreateWhatsappCampaignInput,
  user: JwtUser,
): Promise<CreateWhatsappCampaignResult> {
  const trimmedName = input.name.trim();
  const trimmedMessage = normalizeWhatsappCampaignMessageText(input);
  const uniqueGroupIds = [...new Set(input.groupIds)];
  const minDelaySeconds = input.minDelaySeconds ?? env.WHATSAPP_MIN_DELAY_SECONDS;
  const maxDelaySeconds = input.maxDelaySeconds ?? env.WHATSAPP_MAX_DELAY_SECONDS;

  if (!trimmedName) {
    throw new HttpError(400, "Defina um nome para a campanha.");
  }

  if (!uniqueGroupIds.length) {
    throw new HttpError(400, "Selecione pelo menos um grupo para disparo.");
  }

  if (minDelaySeconds > maxDelaySeconds) {
    throw new HttpError(400, "O intervalo minimo nao pode ser maior do que o maximo.");
  }

  const [groups, templateResult, savedSegmentResult, whatsappInstanceResult] = await Promise.all([
    getWhatsappGroupsByIds(uniqueGroupIds),
    input.templateId ? pool.query("SELECT id, title FROM message_templates WHERE id = $1", [input.templateId]) : null,
    input.savedSegmentId ? pool.query("SELECT id, name FROM saved_segments WHERE id = $1", [input.savedSegmentId]) : null,
    input.whatsappInstanceId
      ? pool.query("SELECT id, display_label FROM whatsapp_instances WHERE id = $1 AND status = 'ACTIVE'", [input.whatsappInstanceId])
      : null,
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

  if (input.whatsappInstanceId && !whatsappInstanceResult?.rows[0]) {
    throw new HttpError(404, "Instancia WhatsApp ativa nao encontrada.");
  }

  const campaignClient = await pool.connect();
  const enqueuedJobs: EnqueuedRecipientJob[] = [];

  try {
    await campaignClient.query("BEGIN");

    const messageType = input.messageType ?? "TEXT";
    const carouselData = input.carouselData ?? null;
    const videoUrl = input.videoUrl ?? null;

    const campaignInsert = await campaignClient.query(
      `
        INSERT INTO whatsapp_campaigns (
          name,
          status,
          template_id,
          template_title,
          saved_segment_id,
          saved_segment_name,
          whatsapp_instance_id,
          whatsapp_instance_label,
          message_text,
          message_type,
          carousel_data,
          video_url,
          filters_snapshot,
          min_delay_seconds,
          max_delay_seconds,
          override_recent_block,
          created_by_user_id,
          created_by_name
        )
        VALUES ($1, 'QUEUED', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13, $14, $15, $16, $17)
        RETURNING id, created_at
      `,
      [
        trimmedName,
        input.templateId ?? null,
        templateResult?.rows[0]?.title ? String(templateResult.rows[0].title) : null,
        input.savedSegmentId ?? null,
        savedSegmentResult?.rows[0]?.name ? String(savedSegmentResult.rows[0].name) : null,
        input.whatsappInstanceId ?? null,
        whatsappInstanceResult?.rows[0]?.display_label ? String(whatsappInstanceResult.rows[0].display_label) : null,
        trimmedMessage,
        messageType,
        carouselData ? JSON.stringify(carouselData) : null,
        videoUrl,
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

export async function listDueWhatsappCampaignRecipientJobs(
  options: ListDueWhatsappCampaignRecipientJobsOptions = {},
): Promise<EnqueuedRecipientJob[]> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 25), 100));
  const params: Array<string | number> = [now.toISOString()];
  const campaignFilter = options.campaignId
    ? (() => {
        params.push(options.campaignId!);
        return `AND r.campaign_id = $${params.length}`;
      })()
    : "";

  params.push(limit);

  const result = await pool.query(
    `
      SELECT
        r.id,
        r.campaign_id,
        r.scheduled_for
      FROM whatsapp_campaign_recipients r
      JOIN whatsapp_campaigns wc ON wc.id = r.campaign_id
      WHERE r.status = 'PENDING'
        AND r.scheduled_for IS NOT NULL
        AND r.scheduled_for <= $1::timestamptz
        AND wc.status IN ('QUEUED', 'IN_PROGRESS')
        AND wc.cancelled_at IS NULL
        ${campaignFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM whatsapp_campaign_recipients active
          WHERE active.campaign_id = r.campaign_id
            AND active.status = 'SENDING'
        )
      ORDER BY r.scheduled_for ASC, r.created_at ASC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    recipientId: String(row.id),
    campaignId: String(row.campaign_id),
    delayMs: 0,
  }));
}

export async function recoverWhatsappCampaignDispatchClaimFailures(
  options: RecoverWhatsappCampaignDispatchFailuresOptions = {},
) {
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 25), 100));
  const params: Array<string | number> = ["FOR UPDATE cannot be applied to the nullable side of an outer join%", limit];
  const campaignFilter = options.campaignId
    ? (() => {
        params.push(options.campaignId!);
        return `AND r.campaign_id = $${params.length}`;
      })()
    : "";

  const result = await pool.query(
    `
      WITH candidate AS (
        SELECT r.id
        FROM whatsapp_campaign_recipients r
        JOIN whatsapp_campaigns wc ON wc.id = r.campaign_id
        WHERE r.status = 'FAILED'
          AND r.last_error LIKE $1
          AND wc.cancelled_at IS NULL
          ${campaignFilter}
        ORDER BY r.updated_at ASC, r.created_at ASC
        LIMIT $2
      ),
      recovered AS (
        UPDATE whatsapp_campaign_recipients r
        SET
          status = 'PENDING',
          failed_at = NULL,
          last_error = NULL,
          provider_status = NULL,
          scheduled_for = COALESCE(r.scheduled_for, NOW()),
          updated_at = NOW()
        FROM candidate c
        WHERE r.id = c.id
        RETURNING r.campaign_id
      ),
      campaign_update AS (
        UPDATE whatsapp_campaigns wc
        SET
          status = CASE
            WHEN wc.status = 'COMPLETED' THEN 'IN_PROGRESS'
            ELSE wc.status
          END,
          finished_at = NULL,
          updated_at = NOW()
        WHERE wc.id IN (SELECT DISTINCT campaign_id FROM recovered)
        RETURNING wc.id
      )
      SELECT
        COUNT(*)::int AS recovered_count,
        (SELECT COUNT(*)::int FROM campaign_update) AS updated_campaign_count,
        COALESCE(ARRAY_AGG(DISTINCT campaign_id::text), ARRAY[]::text[]) AS campaign_ids
      FROM recovered
    `,
    params,
  );

  const row = result.rows[0] ?? {};
  return {
    recovered: Number(row.recovered_count ?? 0),
    campaignIds: Array.isArray(row.campaign_ids) ? row.campaign_ids.map(String) : [],
  };
}

/**
 * Reseta destinatários presos em SENDING há mais de `staleMinutes` minutos
 * (ex.: o processo reiniciou no meio de um envio, ou o envio travou). Sem isso,
 * um único destinatário travado em SENDING congela a campanha inteira pra sempre,
 * porque listDueWhatsappCampaignRecipientJobs ignora qualquer campanha que tenha
 * algum destinatário em SENDING. Volta o registro para PENDING para que o rescue
 * o processe de novo.
 */
export async function resetStaleSendingRecipients(staleMinutes = 5): Promise<number> {
  const result = await pool.query(
    `
      UPDATE whatsapp_campaign_recipients r
      SET
        status = 'PENDING',
        scheduled_for = COALESCE(r.scheduled_for, NOW()),
        last_attempt_at = NULL,
        updated_at = NOW()
      FROM whatsapp_campaigns wc
      WHERE wc.id = r.campaign_id
        AND r.status = 'SENDING'
        AND r.last_attempt_at IS NOT NULL
        AND r.last_attempt_at < NOW() - ($1 || ' minutes')::interval
        AND wc.cancelled_at IS NULL
        AND wc.status IN ('QUEUED', 'IN_PROGRESS')
    `,
    [String(Math.max(1, Math.floor(staleMinutes)))],
  );
  return result.rowCount ?? 0;
}

export async function listWhatsappCampaigns(limit = 20): Promise<WhatsappCampaignListItem[]> {
  const result = await queryCampaignRows(limit);
  return result.rows.map((row) => mapCampaignRow(row));
}

export async function getWhatsappCampaignDetail(
  campaignId: string,
  limit = 100,
  offset = 0,
  excludePerformance = false,
): Promise<WhatsappCampaignDetail | null> {
  const [campaignResult, recipientsResult, totalRecipientsResult, performance] = await Promise.all([
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
    getWhatsappCampaignPerformance(campaignId, excludePerformance),
  ]);

  const campaignRow = campaignResult.rows[0];
  if (!campaignRow) {
    return null;
  }

  const totalRecipients = Number(totalRecipientsResult.rows[0]?.total ?? 0);
  const base = mapCampaignRow(campaignRow);
  const performanceByRecipientId = new Map(
    performance.recipients.map((recipient) => [recipient.recipientId, recipient]),
  );

  return {
    ...base,
    recipients: recipientsResult.rows.map((row) => {
      const recipient = mapRecipientRow(row);
      return mergeRecipientPerformance(
        recipient,
        performanceByRecipientId.get(recipient.id) ?? blankRecipientPerformance(recipient.id),
      );
    }),
    performance,
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

export async function skipWhatsappCampaignRecipient(campaignId: string, recipientId: string) {
  const result = await pool.query(
    `
      UPDATE whatsapp_campaign_recipients
      SET
        status = 'SKIPPED',
        skipped_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND campaign_id = $2
        AND status = 'PENDING'
      RETURNING id
    `,
    [recipientId, campaignId],
  );

  if (!result.rows[0]) {
    throw new HttpError(400, "Destinatario nao encontrado ou ja foi processado.");
  }

  await refreshWhatsappCampaignStatus(campaignId);
  return { skipped: true, recipientId };
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
          wc.message_type,
          wc.carousel_data,
          wc.video_url,
          wc.template_id,
          wc.created_by_user_id,
          wc.created_by_name,
          wc.whatsapp_instance_id,
          wi.instance_name AS whatsapp_instance_name,
          wi.evolution_base_url AS whatsapp_evolution_base_url,
          wi.evolution_api_key AS whatsapp_evolution_api_key,
          wi.provider AS whatsapp_provider,
          wi.uazapi_base_url AS whatsapp_uazapi_base_url,
          wi.uazapi_token AS whatsapp_uazapi_token
        FROM whatsapp_campaign_recipients r
        JOIN whatsapp_campaigns wc ON wc.id = r.campaign_id
        LEFT JOIN whatsapp_instances wi ON wi.id = wc.whatsapp_instance_id AND wi.status = 'ACTIVE'
        WHERE r.id = $1
        FOR UPDATE OF r
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

    const provider = String(row.whatsapp_provider ?? "EVOLUTION");
    const rawCarousel = row.carousel_data;
    const carouselData: CarouselSlide[] | null =
      rawCarousel && Array.isArray(rawCarousel) ? (rawCarousel as CarouselSlide[]) : null;

    return {
      recipientId: String(row.id),
      campaignId: String(row.campaign_id),
      groupId: String(row.group_id),
      customerId: row.customer_id ? String(row.customer_id) : null,
      templateId: row.template_id ? String(row.template_id) : null,
      jid: String(row.jid),
      messageText: String(row.message_text),
      messageType: (String(row.message_type ?? "TEXT")) as WhatsappCampaignMessageType,
      carouselData,
      videoUrl: row.video_url ? String(row.video_url) : null,
      sourceName: String(row.source_name ?? ""),
      sourceCode: row.source_code ? String(row.source_code) : null,
      createdByUserId: String(row.created_by_user_id ?? ""),
      createdByName: String(row.created_by_name ?? ""),
      evolutionInstance:
        provider === "EVOLUTION" && row.whatsapp_instance_id && row.whatsapp_instance_name && row.whatsapp_evolution_base_url && row.whatsapp_evolution_api_key
          ? {
              instanceName: String(row.whatsapp_instance_name),
              evolutionBaseUrl: String(row.whatsapp_evolution_base_url),
              evolutionApiKey: String(row.whatsapp_evolution_api_key),
            }
          : null,
      uazapiInstance:
        provider === "UAZAPI" && row.whatsapp_instance_id && row.whatsapp_uazapi_base_url && row.whatsapp_uazapi_token
          ? {
              baseUrl: String(row.whatsapp_uazapi_base_url),
              token: String(row.whatsapp_uazapi_token),
            }
          : null,
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

export async function markRecipientDispatchClaimFailed(recipientId: string, errorMessage: string) {
  const result = await pool.query(
    `
      UPDATE whatsapp_campaign_recipients
      SET
        status = 'FAILED',
        failed_at = NOW(),
        last_error = $2,
        provider_status = 'FAILED',
        updated_at = NOW()
      WHERE id = $1
        AND status = 'PENDING'
      RETURNING campaign_id
    `,
    [recipientId, errorMessage.slice(0, 500)],
  );

  const campaignId = result.rows[0]?.campaign_id ? String(result.rows[0].campaign_id) : null;
  if (campaignId) {
    await refreshWhatsappCampaignStatus(campaignId);
  }

  return { failed: Boolean(campaignId), recipientId };
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

import type {
  DealActivity,
  DealPriority,
  WhatsappAgentActivityConversationKind,
  WhatsappAgentActivityReport,
  WhatsappMonitorAgent,
  WhatsappMonitorConversation,
  WhatsappMonitorConversationDetail,
  WhatsappMonitorConversationsResponse,
  WhatsappMonitorMetrics,
  WhatsappMonitorMessage,
} from "@olist-crm/shared";
import { pool, redis } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import type { JwtUser } from "../platform/authService.js";
import {
  markWhatsappChatAsUnread,
  markWhatsappMessagesAsRead,
  sendWhatsappInstanceMediaMessage,
  sendWhatsappInstanceTextMessage,
  type EvolutionInstanceConfig,
  type EvolutionMessageKey,
} from "./evolutionService.js";
import {
  chooseWhatsappConversationContactName,
  computeWhatsappUnreadState,
  detectWhatsappMessageRisk,
  extractEvolutionFromMeFlag,
  extractEvolutionMessageContact,
  extractEvolutionMessageContext,
  extractEvolutionMessageMedia,
  formatWhatsappJidPhone,
  getEvolutionMessageKey,
  mapWhatsappActivityToMessage,
  median,
  mergeWhatsappMonitorMessages,
} from "./whatsappMonitorCore.js";
import { createEventFromMessage } from "../events/eventsService.js";

interface ConversationFilters {
  instanceId?: string;
  search?: string;
  contactName?: string;
  contactPhone?: string;
  period?: "today" | "yesterday" | "7d" | "30d";
  status?: "unread" | "risk";
}

const ACTIVITY_REPORT_TIMEZONE = "America/Sao_Paulo";
const ACTIVITY_REPORT_NIGHT_START_HOUR = 18;
const ACTIVITY_REPORT_NIGHT_END_HOUR = 8;

function isInternalChat(name: string | null | undefined, remoteJid: string | null | undefined): boolean {
  if (!name && !remoteJid) return false;
  
  const jid = (remoteJid || "").toLowerCase();
  const normalized = (name || "").trim().toLowerCase();
  
  if (jid.includes("status@broadcast") || jid.endsWith("@broadcast")) {
    return true;
  }

  // Any group/chat starting with "xp" (case-insensitive)
  if (normalized.startsWith("xp")) {
    return true;
  }

  const blacklist = [
    "felipe zhao",
    "gabriel zanini",
    "int 🏆强大团队🏆 xp brasil",
    "int xp brasil",
    "notas finalizadas",
    "motoboy lucas",
    "romário frete",
    "romario frete",
    "lorenzo",
    "conferência",
    "conferencia",
    "motoboy",
    "frete"
  ];

  if (blacklist.some(item => normalized.includes(item))) {
    return true;
  }

  // Check if it matches internal group keywords!
  const isGroup = jid.endsWith("@g.us");
  if (isGroup) {
    const internalKeywords = /(interno|equipe|time|vendedor|vendedora|vendas|financeiro|diretoria|gestao|gestor|expor|xp factory|crm)/;
    if (internalKeywords.test(normalized)) {
      return true;
    }
  }

  return false;
}


function conversationMatchesInstanceSql(instanceAlias: string) {
  return `
    (
      d.whatsapp_instance_id = ${instanceAlias}.id
      OR EXISTS (
        SELECT 1
        FROM whatsapp_incoming_messages wim_inst
        WHERE wim_inst.remote_jid = d.whatsapp_jid
          AND LOWER(COALESCE(wim_inst.instance_name, '')) = LOWER(${instanceAlias}.instance_name)
      )
      OR EXISTS (
        SELECT 1
        FROM deal_activities da_inst
        WHERE da_inst.deal_id = d.id
          AND da_inst.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND LOWER(COALESCE(da_inst.metadata ->> 'instance', '')) = LOWER(${instanceAlias}.instance_name)
      )
    )
  `;
}

function monitorableWhatsappJidSql(expression: string) {
  return `
    (
      ${expression} IS NOT NULL
      AND LOWER(${expression}) <> 'status@broadcast'
      AND LOWER(${expression}) NOT LIKE '%@broadcast'
    )
  `;
}

function isoDate(value: unknown, fallback = new Date()) {
  return new Date(String(value ?? fallback.toISOString())).toISOString();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase("pt-BR");
    if (["true", "1", "yes", "sim"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "nao", "não"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function resolveWhatsappActivityFromMe(row: Record<string, unknown>, metadata = asRecord(row.metadata) ?? {}) {
  const incomingPayload = asRecord(row.incoming_raw_payload);
  const providerFromMe = incomingPayload ? extractEvolutionFromMeFlag(incomingPayload as any) : null;
  const storedIncomingFromMe = optionalBoolean(row.incoming_from_me);
  const metadataFromMe =
    optionalBoolean(metadata.fromMe) ??
    optionalBoolean(metadata.isOutbound) ??
    optionalBoolean(metadata.capturedFromWhatsapp) ??
    optionalBoolean(metadata.sentFromMonitor);

  return providerFromMe ?? storedIncomingFromMe ?? metadataFromMe;
}

function isWhatsappActivityOutbound(row: Record<string, unknown>, metadata = asRecord(row.metadata) ?? {}) {
  return resolveWhatsappActivityFromMe(row, metadata) ?? (String(row.activity_type) === "WHATSAPP_SENT");
}

function whatsappActivityHasMedia(row: Record<string, unknown>, metadata = asRecord(row.metadata) ?? {}) {
  if (
    "fileName" in metadata ||
    "filename" in metadata ||
    "mediaName" in metadata ||
    "mimetype" in metadata ||
    "mediaType" in metadata ||
    String(metadata.mediaType || "").trim() !== "" ||
    String(metadata.mimetype || "").trim() !== ""
  ) {
    return true;
  }

  const content = String(row.content || "");
  if (
    content.startsWith("[Imagem]") ||
    content.startsWith("[Vídeo]") ||
    content.startsWith("[Áudio]") ||
    content.startsWith("[Sticker]") ||
    content.startsWith("[Documento]")
  ) {
    return true;
  }

  const incomingPayload = asRecord(row.incoming_raw_payload);
  return incomingPayload ? Boolean(extractEvolutionMessageMedia(incomingPayload as any)) : false;
}

function extractProviderMessageId(payload: Record<string, unknown>) {
  const key = asRecord(payload.key);
  const keyId = optionalString(key?.id);
  return keyId ?? optionalString(payload.messageId) ?? optionalString(payload.id);
}

function riskSql(alias: string) {
  return `
    (
      lower(COALESCE(${alias}.content, '')) LIKE '%porra%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%caralho%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%merda%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%puta%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%fdp%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%senha%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%cartao de credito%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%token%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%urgente%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%processo%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%reclamacao%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%procon%'
      OR lower(COALESCE(${alias}.content, '')) LIKE '%cancelar%'
    )
  `;
}

function mapAgentRow(row: Record<string, unknown>): WhatsappMonitorAgent {
  return {
    id: String(row.id),
    instanceName: String(row.instance_name),
    displayLabel: String(row.display_label),
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    status: String(row.status ?? "ACTIVE") as WhatsappMonitorAgent["status"],
    isDefault: Boolean(row.is_default),
    provider: String(row.provider ?? "EVOLUTION") as WhatsappMonitorAgent["provider"],
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assignedUserName: row.assigned_user_name ? String(row.assigned_user_name) : null,
    lastHealthStatus: row.last_health_status ? String(row.last_health_status) : null,
    lastHealthCheckAt: row.last_health_check_at ? isoDate(row.last_health_check_at) : null,
    profilePictureUrl: optionalString(row.profile_picture_url),
    conversationCount: Number(row.conversation_count ?? 0),
    riskCount: Number(row.risk_count ?? 0),
    lastMessageAt: row.last_message_at ? isoDate(row.last_message_at) : null,
    sector: row.sector ? String(row.sector) : null,
    managerName: row.manager_name ? String(row.manager_name) : null,
    contactEmail: row.contact_email ? String(row.contact_email) : null,
  };
}

function mapConversationRow(row: Record<string, unknown>): WhatsappMonitorConversation {
  const remoteJid = row.whatsapp_jid ? String(row.whatsapp_jid) : null;
  const lastMessage = row.last_message_content ? String(row.last_message_content) : null;
  const rawTitle = optionalString(row.title) ?? optionalString(row.customer_display_name);
  const title = rawTitle ?? "Conversa sem nome";
  const isGroup = Boolean(remoteJid?.endsWith("@g.us"));
  const contactName = chooseWhatsappConversationContactName({
    remoteJid,
    isGroup,
    chatDisplayName: optionalString(row.chat_display_name),
    customerDisplayName: optionalString(row.customer_display_name),
    title: rawTitle,
    agentName: optionalString(row.agent_name),
    assignedUserName: optionalString(row.assigned_to_name),
    instanceName: optionalString(row.instance_name),
    instanceLabel: optionalString(row.instance_display_label),
    inboundSenderName: optionalString(row.inbound_sender_name),
  });
  const markedUnread = Boolean(row.marked_unread);
  const unreadState = computeWhatsappUnreadState(Number(row.unread_after_read ?? 0), markedUnread);

  return {
    id: String(row.id),
    dealId: String(row.id),
    title,
    contactName,
    contactPhone: formatWhatsappJidPhone(remoteJid),
    remoteJid,
    isGroup,
    profilePictureUrl: optionalString(row.profile_picture_url),
    whatsappInstanceId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
    instanceName: row.instance_name ? String(row.instance_name) : null,
    agentName: row.agent_name ? String(row.agent_name) : null,
    stageName: row.stage_name ? String(row.stage_name) : null,
    priority: String(row.priority ?? "MEDIUM") as DealPriority,
    lastMessage,
    lastMessageAt: isoDate(row.last_message_at ?? row.last_activity_at ?? row.created_at),
    unreadCount: unreadState.unreadCount,
    isUnread: unreadState.isUnread,
    markedUnread,
    lastReadAt: row.last_read_at ? isoDate(row.last_read_at) : null,
    eventCount: Number(row.event_count ?? 0),
    risk: detectWhatsappMessageRisk(lastMessage),
  };
}

function mapActivityRow(row: Record<string, unknown>): DealActivity {
  const baseMetadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  const incomingPayload = asRecord(row.incoming_raw_payload);
  const incomingMedia = incomingPayload ? extractEvolutionMessageMedia(incomingPayload as any) : null;
  const incomingContact = incomingPayload ? extractEvolutionMessageContact(incomingPayload as any) : null;
  const incomingContext = incomingPayload ? extractEvolutionMessageContext(incomingPayload as any, optionalString(row.instance_name)) : null;
  const providerFromMe = incomingPayload ? extractEvolutionFromMeFlag(incomingPayload as any) : null;
  const resolvedFromMe = resolveWhatsappActivityFromMe(row, baseMetadata);
  const isSent = resolvedFromMe ?? (row.activity_type === "WHATSAPP_SENT");

  const metadata: Record<string, unknown> = {
    ...baseMetadata,
    ...(incomingMedia ? incomingMedia : {}),
    ...(incomingContact ? { contact: incomingContact } : {}),
    ...(resolvedFromMe !== null
      ? {
        fromMe: resolvedFromMe,
        isOutbound: resolvedFromMe,
        capturedFromWhatsapp: resolvedFromMe,
        ...(resolvedFromMe
          ? { outboundSource: baseMetadata.outboundSource ?? (providerFromMe === true ? "whatsapp_device" : "whatsapp_api") }
          : {}),
      }
      : {}),
  };
  const participantName = optionalString(row.participant_display_name);
  const participantProfilePictureUrl = optionalString(row.participant_profile_picture_url);

  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    activityType: (isSent ? "WHATSAPP_SENT" : "WHATSAPP_RECEIVED") as DealActivity["activityType"],
    actorName: row.actor_name ? String(row.actor_name) : null,
    content: row.content ? String(row.content) : null,
    metadata: {
      ...metadata,
      senderName: metadata.senderName ?? participantName,
      senderJid: metadata.senderJid ?? incomingContext?.senderJid,
      senderProfilePictureUrl: metadata.senderProfilePictureUrl ?? participantProfilePictureUrl,
    },
    createdAt: isoDate(row.created_at),
  };
}

function localDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACTIVITY_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { year, month, day };
}

function localDateKey(value: Date) {
  const { year, month, day } = localDateParts(value);
  return `${year}-${month}-${day}`;
}

function buildActivityReportDays(days: number): WhatsappAgentActivityReport["days"] {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: ACTIVITY_REPORT_TIMEZONE,
    weekday: "long",
  });

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - 1 - index));
    const key = localDateKey(date);
    const [, month = "01", day = "01"] = key.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];

    return {
      date: key,
      label: `${day}/${month}`,
      weekday: formatter.format(date),
    };
  });
}

function classifyWhatsappGroup(input: { isGroup: boolean; name: string | null }) {
  if (!input.isGroup) {
    return "private" as const;
  }

  const normalized = normalizeLabel(input.name);

  if (/^(cliente|clientes|cl)(\b|[\s\-_:.\d#])/.test(normalized)) {
    return "customer_group" as const;
  }

  if (/(interno|equipe|time|vendedor|vendedora|vendas|financeiro|diretoria|gestao|gestor|expor|xp factory|crm)/.test(normalized)) {
    return "internal_group" as const;
  }

  return "other_group" as const;
}

function conversationProfileJoinSql() {
  return `
    LEFT JOIN LATERAL (
      SELECT wcp.display_name, wcp.profile_picture_url
      FROM whatsapp_chat_profiles wcp
      WHERE wcp.remote_jid = d.whatsapp_jid
        AND (
          wcp.instance_name = COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance', '')
          OR wcp.instance_name = ''
        )
      ORDER BY
        CASE
          WHEN wcp.instance_name = COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance', '') THEN 0
          ELSE 1
        END,
        wcp.updated_at DESC
      LIMIT 1
    ) chat_profile ON true
    LEFT JOIN LATERAL (
      SELECT
        wim.chat_display_name,
        wim.chat_profile_picture_url,
        wim.sender_name,
        wim.participant_name,
        wim.sender_profile_picture_url
      FROM whatsapp_incoming_messages wim
      WHERE wim.remote_jid = d.whatsapp_jid
        AND (
          wim.instance_name = COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance', '')
          OR COALESCE(wim.instance_name, '') = ''
        )
      ORDER BY wim.created_at DESC, wim.id DESC
      LIMIT 1
    ) incoming_profile ON true
    LEFT JOIN LATERAL (
      SELECT
        wim_inbound.sender_name AS inbound_sender_name,
        COALESCE(wim_inbound.sender_profile_picture_url, wim_inbound.chat_profile_picture_url) AS inbound_sender_picture
      FROM whatsapp_incoming_messages wim_inbound
      WHERE wim_inbound.remote_jid = d.whatsapp_jid
        AND wim_inbound.from_me = false
        AND wim_inbound.sender_name IS NOT NULL
        AND wim_inbound.sender_name <> ''
        AND (
          wim_inbound.instance_name = COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance', '')
          OR COALESCE(wim_inbound.instance_name, '') = ''
        )
      ORDER BY wim_inbound.created_at DESC
      LIMIT 1
    ) incoming_inbound_profile ON true
  `;
}

function conversationBaseSelectSql(userIdParamIndex: number) {
  return `
    WITH latest_whatsapp AS (
      SELECT
        da.*,
        ROW_NUMBER() OVER (PARTITION BY da.deal_id ORDER BY da.created_at DESC, da.id DESC) AS rn
      FROM deal_activities da
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    ),
    activity_stats AS (
      SELECT
        da.deal_id,
        COUNT(*) FILTER (WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED'))::int AS event_count,
        COUNT(*) FILTER (WHERE da.activity_type = 'WHATSAPP_RECEIVED')::int AS inbound_count,
        MAX(da.created_at) FILTER (WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')) AS last_message_at
      FROM deal_activities da
      GROUP BY da.deal_id
    )
    SELECT
      d.*,
      ps.name AS stage_name,
      COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance') AS instance_name,
      COALESCE(wi.display_label, latest_whatsapp.metadata ->> 'instance') AS instance_display_label,
      COALESCE(wi.display_label, d.assigned_to_name, latest_whatsapp.actor_name) AS agent_name,
      COALESCE(
        chat_profile.display_name,
        latest_whatsapp.metadata ->> 'chatDisplayName',
        incoming_profile.chat_display_name,
        incoming_profile.sender_name,
        incoming_profile.participant_name
      ) AS chat_display_name,
      incoming_inbound_profile.inbound_sender_name AS inbound_sender_name,
      COALESCE(
        chat_profile.profile_picture_url,
        latest_whatsapp.metadata ->> 'chatProfilePictureUrl',
        incoming_profile.chat_profile_picture_url,
        incoming_profile.sender_profile_picture_url,
        incoming_inbound_profile.inbound_sender_picture
      ) AS profile_picture_url,
      latest_whatsapp.content AS last_message_content,
      COALESCE(activity_stats.last_message_at, d.last_activity_at, d.created_at) AS last_message_at,
      COALESCE(activity_stats.event_count, 0)::int AS event_count,
      COALESCE(activity_stats.inbound_count, 0)::int AS inbound_count,
      COALESCE((
        SELECT COUNT(*)
        FROM deal_activities unread_activity
        WHERE unread_activity.deal_id = d.id
          AND unread_activity.activity_type = 'WHATSAPP_RECEIVED'
          AND (
            conversation_reads.last_read_at IS NULL
            OR unread_activity.created_at > conversation_reads.last_read_at
          )
      ), 0)::int AS unread_after_read,
      COALESCE(conversation_reads.force_unread, false) AS marked_unread,
      conversation_reads.last_read_at
    FROM deals d
    LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN latest_whatsapp ON latest_whatsapp.deal_id = d.id AND latest_whatsapp.rn = 1
    LEFT JOIN activity_stats ON activity_stats.deal_id = d.id
    LEFT JOIN whatsapp_conversation_reads conversation_reads
      ON conversation_reads.deal_id = d.id
      AND conversation_reads.user_id = $${userIdParamIndex}
    ${conversationProfileJoinSql()}
  `;
}

function conversationPeriodSql(period: NonNullable<ConversationFilters["period"]>) {
  const today = `timezone('${ACTIVITY_REPORT_TIMEZONE}', NOW())::date`;
  const rangeStart =
    period === "today"
      ? today
      : period === "yesterday"
        ? `${today} - INTERVAL '1 day'`
        : period === "7d"
          ? `${today} - INTERVAL '6 days'`
          : `${today} - INTERVAL '29 days'`;
  const rangeEnd = period === "yesterday" ? today : `${today} + INTERVAL '1 day'`;

  return `
    activity_stats.last_message_at >= ((${rangeStart}) AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
    AND activity_stats.last_message_at < ((${rangeEnd}) AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
  `;
}

function unreadConversationSql() {
  return `
    (
      COALESCE(conversation_reads.force_unread, false)
      OR EXISTS (
        SELECT 1
        FROM deal_activities unread_activity
        WHERE unread_activity.deal_id = d.id
          AND unread_activity.activity_type = 'WHATSAPP_RECEIVED'
          AND (
            conversation_reads.last_read_at IS NULL
            OR unread_activity.created_at > conversation_reads.last_read_at
          )
      )
    )
  `;
}

export async function listWhatsappMonitorAgents(user?: JwtUser): Promise<WhatsappMonitorAgent[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (user?.role === "SELLER") {
    params.push(user.id, user.name);
    where.push(`
      (
        wi.assigned_user_id = $1
        OR LOWER(COALESCE(wi.assigned_user_name, '')) = LOWER($2)
        OR EXISTS (
          SELECT 1
          FROM deals d
          WHERE ${monitorableWhatsappJidSql("d.whatsapp_jid")}
            AND ${conversationMatchesInstanceSql("wi")}
            AND (
              d.assigned_to = $1
              OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($2)
            )
        )
      )
    `);
  }

  const result = await pool.query(
    `
    WITH conversation_instances AS (
      SELECT DISTINCT
        d.id AS deal_id,
        wi_match.id AS whatsapp_instance_id
      FROM deals d
      JOIN whatsapp_instances wi_match
        ON ${conversationMatchesInstanceSql("wi_match")}
      WHERE ${monitorableWhatsappJidSql("d.whatsapp_jid")}
    ),
    message_stats AS (
      SELECT
        ci.whatsapp_instance_id,
        COUNT(DISTINCT ci.deal_id)::int AS conversation_count,
        COUNT(DISTINCT da.id) FILTER (
          WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
            AND da.content IS NOT NULL
            AND (
              lower(da.content) LIKE '%porra%'
              OR lower(da.content) LIKE '%senha%'
              OR lower(da.content) LIKE '%cartao de credito%'
              OR lower(da.content) LIKE '%token%'
              OR lower(da.content) LIKE '%procon%'
            )
        )::int AS risk_count,
        MAX(da.created_at) AS last_message_at
      FROM conversation_instances ci
      LEFT JOIN deal_activities da ON da.deal_id = ci.deal_id
      GROUP BY ci.whatsapp_instance_id
    )
    SELECT
      wi.*,
      u.email AS contact_email,
      COALESCE(ms.conversation_count, 0)::int AS conversation_count,
      COALESCE(ms.risk_count, 0)::int AS risk_count,
      ms.last_message_at,
      NULL::text AS sector,
      NULL::text AS manager_name
    FROM whatsapp_instances wi
    LEFT JOIN users u ON u.id = wi.assigned_user_id
    LEFT JOIN message_stats ms ON ms.whatsapp_instance_id = wi.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY wi.is_default DESC, wi.display_label ASC
    `,
    params,
  );

  return result.rows.map(mapAgentRow);
}

export async function listWhatsappMonitorConversations(
  user: JwtUser,
  filters: ConversationFilters = {},
): Promise<WhatsappMonitorConversationsResponse> {
  const params: unknown[] = [];
  const where: string[] = [
    monitorableWhatsappJidSql("d.whatsapp_jid"),
    `
      EXISTS (
        SELECT 1
        FROM whatsapp_instances wi_monitor
        WHERE ${conversationMatchesInstanceSql("wi_monitor")}
      )
    `,
  ];

  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    const userIdParamIndex = params.length - 1;
    const userNameParamIndex = params.length;
    where.push(`
      (
        d.assigned_to = $${userIdParamIndex}
        OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($${userNameParamIndex})
        OR EXISTS (
          SELECT 1
          FROM whatsapp_instances wi_user
          WHERE (
              wi_user.assigned_user_id = $${userIdParamIndex}
              OR LOWER(COALESCE(wi_user.assigned_user_name, '')) = LOWER($${userNameParamIndex})
            )
            AND ${conversationMatchesInstanceSql("wi_user")}
        )
      )
    `);
  }

  if (filters.instanceId) {
    params.push(filters.instanceId);
    where.push(`
      EXISTS (
        SELECT 1
        FROM whatsapp_instances wif
        WHERE wif.id = $${params.length}
          AND ${conversationMatchesInstanceSql("wif")}
      )
    `);
  }

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLocaleLowerCase("pt-BR")}%`);
    where.push(`
      (
        lower(d.title) LIKE $${params.length}
        OR lower(COALESCE(d.customer_display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(d.whatsapp_jid, '')) LIKE $${params.length}
        OR lower(COALESCE(incoming_profile.chat_display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(incoming_profile.sender_name, '')) LIKE $${params.length}
        OR lower(COALESCE(incoming_profile.participant_name, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM whatsapp_chat_profiles wcpf
          WHERE wcpf.remote_jid = d.whatsapp_jid
            AND lower(COALESCE(wcpf.display_name, '')) LIKE $${params.length}
        )
      )
    `);
  }

  if (filters.contactName?.trim()) {
    params.push(`%${filters.contactName.trim().toLocaleLowerCase("pt-BR")}%`);
    where.push(`
      (
        lower(d.title) LIKE $${params.length}
        OR lower(COALESCE(d.customer_display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(chat_profile.display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(latest_whatsapp.metadata ->> 'chatDisplayName', '')) LIKE $${params.length}
        OR lower(COALESCE(incoming_profile.chat_display_name, '')) LIKE $${params.length}
        OR lower(COALESCE(incoming_profile.sender_name, '')) LIKE $${params.length}
        OR lower(COALESCE(incoming_profile.participant_name, '')) LIKE $${params.length}
      )
    `);
  }

  if (filters.contactPhone?.trim()) {
    const phoneDigits = filters.contactPhone.replace(/\D/g, "");
    if (phoneDigits) {
      params.push(`%${phoneDigits}%`);
      where.push(`
        regexp_replace(COALESCE(d.whatsapp_jid, ''), '\\D', '', 'g') LIKE $${params.length}
      `);
    }
  }

  if (filters.period) {
    where.push(conversationPeriodSql(filters.period));
  }

  if (filters.status === "unread") {
    where.push(unreadConversationSql());
  }

  if (filters.status === "risk") {
    where.push(`
      EXISTS (
        SELECT 1
        FROM deal_activities risk_activity
        WHERE risk_activity.deal_id = d.id
          AND risk_activity.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND ${riskSql("risk_activity")}
      )
    `);
  }

  params.push(user.id);
  const userIdParamIndex = params.length;

  const [agents, conversationsResult] = await Promise.all([
    listWhatsappMonitorAgents(user),
    pool.query(
      `
      SELECT *
      FROM (
        SELECT DISTINCT ON (
          COALESCE(conversation_rows.whatsapp_instance_id::text, LOWER(COALESCE(conversation_rows.instance_name, ''))),
          LOWER(COALESCE(conversation_rows.whatsapp_jid, ''))
        )
          conversation_rows.*
        FROM (
          ${conversationBaseSelectSql(userIdParamIndex)}
          WHERE ${where.join(" AND ")}
        ) conversation_rows
        ORDER BY
          COALESCE(conversation_rows.whatsapp_instance_id::text, LOWER(COALESCE(conversation_rows.instance_name, ''))),
          LOWER(COALESCE(conversation_rows.whatsapp_jid, '')),
          COALESCE(conversation_rows.last_message_at, conversation_rows.last_activity_at, conversation_rows.created_at) DESC,
          conversation_rows.id DESC
      ) deduped_conversations
      ORDER BY COALESCE(deduped_conversations.last_message_at, deduped_conversations.last_activity_at, deduped_conversations.created_at) DESC, deduped_conversations.id DESC
      LIMIT 200
      `,
      params,
    ),
  ]);

  return {
    agents,
    conversations: conversationsResult.rows.map(mapConversationRow),
  };
}

export async function getWhatsappMonitorConversation(
  dealId: string,
  user: JwtUser,
): Promise<WhatsappMonitorConversationDetail> {
  const conversationParams: unknown[] = [dealId, user.id];
  const accessWhere: string[] = [];

  if (user.role === "SELLER") {
    conversationParams.push(user.name);
    accessWhere.push(`
      AND (
        d.assigned_to = $2
        OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($3)
        OR EXISTS (
          SELECT 1
          FROM whatsapp_instances wi_user
          WHERE (
              wi_user.assigned_user_id = $2
              OR LOWER(COALESCE(wi_user.assigned_user_name, '')) = LOWER($3)
            )
            AND ${conversationMatchesInstanceSql("wi_user")}
        )
      )
    `);
  }

  const conversationResult = await pool.query(
    `
    ${conversationBaseSelectSql(2)}
    WHERE d.id = $1
      AND ${monitorableWhatsappJidSql("d.whatsapp_jid")}
      ${accessWhere.join("\n")}
    LIMIT 1
    `,
    conversationParams,
  );

  if (!conversationResult.rows[0]) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  const conversation = mapConversationRow(conversationResult.rows[0]);
  const activitiesResult = await pool.query(
    `
    SELECT
      da.*,
      participant_profile.display_name AS participant_display_name,
      participant_profile.profile_picture_url AS participant_profile_picture_url,
      incoming_message.raw_payload AS incoming_raw_payload,
      incoming_message.from_me AS incoming_from_me,
      COALESCE(wi.instance_name, da.metadata ->> 'instance') AS instance_name
    FROM deal_activities da
    LEFT JOIN deals activity_deal ON activity_deal.id = da.deal_id
    LEFT JOIN whatsapp_instances wi ON wi.id = activity_deal.whatsapp_instance_id
    LEFT JOIN whatsapp_incoming_messages incoming_message
      ON incoming_message.message_id = da.metadata ->> 'messageId'
    LEFT JOIN LATERAL (
      SELECT wpp.display_name, wpp.profile_picture_url
      FROM whatsapp_participant_profiles wpp
      WHERE wpp.participant_jid = da.metadata ->> 'senderJid'
        AND (
          wpp.instance_name = COALESCE(da.metadata ->> 'instance', '')
          OR wpp.instance_name = ''
        )
      ORDER BY
        CASE WHEN wpp.instance_name = COALESCE(da.metadata ->> 'instance', '') THEN 0 ELSE 1 END,
        wpp.updated_at DESC
      LIMIT 1
    ) participant_profile ON true
    WHERE da.deal_id = $1
      AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    ORDER BY da.created_at ASC, incoming_message.created_at ASC NULLS LAST, da.id ASC
    LIMIT 300
    `,
    [dealId],
  );

  const activityMessages = activitiesResult.rows.map((row) => mapWhatsappActivityToMessage(mapActivityRow(row)));
  let messages = activityMessages;

  if (conversation.remoteJid) {
    const incomingResult = await pool.query(
      `
      SELECT
        wim.*,
        COALESCE(participant_profile.display_name, wim.participant_name, wim.sender_name) AS sender_display_name,
        COALESCE(participant_profile.profile_picture_url, wim.sender_profile_picture_url) AS participant_profile_picture_url
      FROM whatsapp_incoming_messages wim
      LEFT JOIN LATERAL (
        SELECT wpp.display_name, wpp.profile_picture_url
        FROM whatsapp_participant_profiles wpp
        WHERE wpp.participant_jid = wim.participant_jid
          AND (
            wpp.instance_name = COALESCE(wim.instance_name, '')
            OR wpp.instance_name = ''
          )
        ORDER BY
          CASE WHEN wpp.instance_name = COALESCE(wim.instance_name, '') THEN 0 ELSE 1 END,
          wpp.updated_at DESC
        LIMIT 1
      ) participant_profile ON true
      WHERE wim.remote_jid = $1
        AND LOWER(COALESCE(wim.instance_name, '')) = LOWER($2)
      ORDER BY wim.created_at ASC, wim.id ASC
      LIMIT 300
      `,
      [conversation.remoteJid, conversation.instanceName || ""],
    );

    const capturedMessages = incomingResult.rows.map((row): WhatsappMonitorMessage => {
      const content = String(row.message_text ?? "");
      const metadata =
        row.raw_payload && typeof row.raw_payload === "object" ? (row.raw_payload as Record<string, unknown>) : {};
      const media = extractEvolutionMessageMedia(metadata as any);
      const contact = extractEvolutionMessageContact(metadata as any);
      const incomingContext = extractEvolutionMessageContext(metadata as any, optionalString(row.instance_name));
      const messageId = optionalString(row.message_id) ?? optionalString(incomingContext.messageId) ?? String(row.id);
      // Prefer the raw provider flag so previously misclassified private messages render on the correct side.
      const fromMe = extractEvolutionFromMeFlag(metadata as any) ?? Boolean(row.from_me);

      return {
        id: String(row.id),
        dealId,
        direction: fromMe ? "OUTBOUND" : "INBOUND",
        senderName: row.sender_display_name ? String(row.sender_display_name) : conversation.contactName,
        senderJid: row.participant_jid ? String(row.participant_jid) : null,
        senderProfilePictureUrl: row.participant_profile_picture_url ? String(row.participant_profile_picture_url) : null,
        content,
        createdAt: isoDate(row.created_at),
        remoteJid: String(row.remote_jid),
        isGroup: conversation.isGroup,
        metadata: {
          ...metadata,
          messageId,
          ...(fromMe ? { fromMe: true, capturedFromWhatsapp: true, outboundSource: "whatsapp_device" } : {}),
          ...(media ? media : {}),
          ...(contact ? { contact } : {}),
        },
        risk: detectWhatsappMessageRisk(content),
      };
    });

    messages = mergeWhatsappMonitorMessages(activityMessages, capturedMessages);
  }

  return {
    ...conversation,
    messages,
  };
}

async function getWhatsappConversationEvolutionContext(dealId: string) {
  const result = await pool.query(
    `
    WITH latest_instance AS (
      SELECT da.metadata ->> 'instance' AS instance_name
      FROM deal_activities da
      WHERE da.deal_id = $1
        AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND da.metadata ->> 'instance' IS NOT NULL
      ORDER BY da.created_at DESC, da.id DESC
      LIMIT 1
    )
    SELECT
      d.id,
      d.whatsapp_jid,
      COALESCE(primary_instance.id, activity_instance.id) AS instance_id,
      COALESCE(primary_instance.instance_name, activity_instance.instance_name) AS instance_name,
      COALESCE(primary_instance.display_label, activity_instance.display_label) AS display_label,
      COALESCE(primary_instance.evolution_base_url, activity_instance.evolution_base_url) AS evolution_base_url,
      COALESCE(primary_instance.evolution_api_key, activity_instance.evolution_api_key) AS evolution_api_key,
      COALESCE(primary_instance.provider, activity_instance.provider) AS provider,
      COALESCE(primary_instance.uazapi_base_url, activity_instance.uazapi_base_url) AS uazapi_base_url,
      COALESCE(primary_instance.uazapi_token, activity_instance.uazapi_token) AS uazapi_token
    FROM deals d
    LEFT JOIN whatsapp_instances primary_instance ON primary_instance.id = d.whatsapp_instance_id
    LEFT JOIN latest_instance ON true
    LEFT JOIN whatsapp_instances activity_instance
      ON lower(activity_instance.instance_name) = lower(latest_instance.instance_name)
    WHERE d.id = $1
      AND ${monitorableWhatsappJidSql("d.whatsapp_jid")}
    LIMIT 1
    `,
    [dealId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  const remoteJid = optionalString(row.whatsapp_jid);
  const instanceName = optionalString(row.instance_name);
  const evolutionBaseUrl = optionalString(row.evolution_base_url);
  const evolutionApiKey = optionalString(row.evolution_api_key);
  const provider = optionalString(row.provider) ?? "EVOLUTION";
  const uazapiBaseUrl = optionalString(row.uazapi_base_url);
  const uazapiToken = optionalString(row.uazapi_token);

  return {
    dealId: String(row.id),
    remoteJid,
    instanceId: row.instance_id ? String(row.instance_id) : null,
    instanceLabel: optionalString(row.display_label),
    provider,
    evolution:
      provider === "EVOLUTION" && instanceName && evolutionBaseUrl && evolutionApiKey
        ? {
          instanceName,
          evolutionBaseUrl,
          evolutionApiKey,
        }
        : null,
    uazapi:
      provider === "UAZAPI" && uazapiBaseUrl && uazapiToken
        ? {
          baseUrl: uazapiBaseUrl,
          token: uazapiToken,
        }
        : null,
  };
}

async function getRecentEvolutionMessageKeys(dealId: string, onlyInbound = false): Promise<EvolutionMessageKey[]> {
  const result = await pool.query(
    `
    SELECT id, deal_id, activity_type, actor_name, content, metadata, created_at
    FROM deal_activities
    WHERE deal_id = $1
      AND activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      ${onlyInbound ? "AND activity_type = 'WHATSAPP_RECEIVED'" : ""}
    ORDER BY created_at DESC
    LIMIT 25
    `,
    [dealId],
  );

  return result.rows
    .map((row) => getEvolutionMessageKey(mapWhatsappActivityToMessage(mapActivityRow(row))))
    .filter((key): key is EvolutionMessageKey => Boolean(key));
}

async function syncConversationReadStateWithEvolution(dealId: string, unread: boolean) {
  try {
    const context = await getWhatsappConversationEvolutionContext(dealId);
    if (!context.remoteJid || !context.evolution) {
      return;
    }

    const keys = await getRecentEvolutionMessageKeys(dealId, !unread);
    if (unread) {
      await markWhatsappChatAsUnread(context.evolution, context.remoteJid, keys[0] ?? null);
      return;
    }

    // We no longer sync "read" state to Evolution to prevent marking as read on WhatsApp Web
    // as requested by the user.
    // await markWhatsappMessagesAsRead(context.evolution, keys);
  } catch (error) {
    logger.warn("whatsapp monitor failed to sync read state with Evolution", {
      dealId,
      unread,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendWhatsappMonitorReply(
  dealId: string,
  user: JwtUser,
  messageText: string,
): Promise<WhatsappMonitorConversationDetail> {
  const text = messageText.trim();
  if (!text) {
    throw new HttpError(400, "Mensagem vazia.");
  }

  const context = await getWhatsappConversationEvolutionContext(dealId);
  if (!context.remoteJid) {
    throw new HttpError(400, "Conversa sem JID configurado.");
  }

  let providerPayload: Record<string, unknown>;
  let providerMessageId: string;

  if (context.provider === "UAZAPI" && context.uazapi) {
    const { sendUazapiTextMessage } = await import("./uazapiService.js");
    providerPayload = await sendUazapiTextMessage(context.uazapi, context.remoteJid, text);
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else if (context.evolution) {
    providerPayload = await sendWhatsappInstanceTextMessage(context.evolution, context.remoteJid, text);
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else {
    throw new HttpError(400, "Conversa sem instância WhatsApp ativa configurada.");
  }

  const createdAt = new Date().toISOString();

  await pool.query(
    `
    INSERT INTO deal_activities (
      deal_id, activity_type, actor_user_id, actor_name, content, metadata, created_at
    )
    SELECT $1, 'WHATSAPP_SENT', $2, $3, $4, $5::jsonb, $6
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE deal_id = $1
        AND metadata ->> 'messageId' = $7
    )
    `,
    [
      dealId,
      user.id,
      user.name,
      text,
      JSON.stringify({
        remoteJid: context.remoteJid,
        messageId: providerMessageId,
        providerMessageId,
        providerPayload,
        instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
        instanceId: context.instanceId,
        isGroup: context.remoteJid.endsWith("@g.us"),
        senderName: user.name,
        sentFromMonitor: true,
      }),
      createdAt,
      providerMessageId,
    ],
  );

  // Messaging Intelligence: Detect and create event
  const monitorMessage: WhatsappMonitorMessage = {
    id: providerMessageId,
    dealId,
    direction: "OUTBOUND",
    senderName: user.name,
    senderJid: null,
    senderProfilePictureUrl: null,
    content: text,
    createdAt,
    remoteJid: context.remoteJid,
    isGroup: context.remoteJid.endsWith("@g.us"),
    metadata: {
      remoteJid: context.remoteJid,
      messageId: providerMessageId,
      instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
      sentFromMonitor: true,
    },
    risk: detectWhatsappMessageRisk(text),
  };

  createEventFromMessage(monitorMessage, dealId).catch((err) => {
    logger.warn("failed to create message event from monitor reply", {
      dealId,
      messageId: providerMessageId,
      error: err.message,
    });
  });

  await Promise.all([
    pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]),
    pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, last_read_at, force_unread, marked_unread_at, updated_at)
      VALUES ($1, $2, NOW(), false, NULL, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        last_read_at = NOW(),
        force_unread = false,
        marked_unread_at = NULL,
        updated_at = NOW()
      `,
      [dealId, user.id],
    ),
  ]);

  return getWhatsappMonitorConversation(dealId, user);
}

export async function sendWhatsappMonitorMediaReply(
  dealId: string,
  user: JwtUser,
  input: {
    mediaBase64: string;
    mediaType: "image" | "video" | "audio" | "document";
    fileName?: string;
    caption?: string;
  },
): Promise<WhatsappMonitorConversationDetail> {
  const context = await getWhatsappConversationEvolutionContext(dealId);
  if (!context.remoteJid) {
    throw new HttpError(400, "Conversa sem JID configurado.");
  }

  let providerPayload: Record<string, unknown>;
  let providerMessageId: string;

  if (context.provider === "UAZAPI" && context.uazapi) {
    const { sendUazapiImageMessage } = await import("./uazapiService.js");
    if (input.mediaType === "image") {
      providerPayload = await sendUazapiImageMessage(context.uazapi, context.remoteJid, input.mediaBase64, input.caption);
    } else {
      const { requestUazapi } = await import("./uazapiService.js");
      const [jidNum] = context.remoteJid.split("@");
      const number = (jidNum ?? context.remoteJid).replace(/\D/g, "");
      providerPayload = await requestUazapi(context.uazapi, "/send/file", "POST", {
        number,
        file: input.mediaBase64,
        caption: input.caption ?? "",
        filename: input.fileName ?? "file",
      });
    }
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else if (context.evolution) {
    providerPayload = await sendWhatsappInstanceMediaMessage(
      context.evolution,
      context.remoteJid,
      input.mediaBase64,
      input.mediaType,
      input.fileName,
      input.caption,
    );
    providerMessageId =
      extractProviderMessageId(providerPayload) ?? `monitor-media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } else {
    throw new HttpError(400, "Conversa sem instância WhatsApp ativa configurada.");
  }

  const createdAt = new Date().toISOString();

  await pool.query(
    `
    INSERT INTO deal_activities (
      deal_id, activity_type, actor_user_id, actor_name, content, metadata, created_at
    )
    SELECT $1, 'WHATSAPP_SENT', $2, $3, $4, $5::jsonb, $6
    WHERE NOT EXISTS (
      SELECT 1
      FROM deal_activities
      WHERE deal_id = $1
        AND metadata ->> 'messageId' = $7
    )
    `,
    [
      dealId,
      user.id,
      user.name,
      input.caption || (input.fileName ? `Arquivo: ${input.fileName}` : `Midia enviada (${input.mediaType})`),
      JSON.stringify({
        remoteJid: context.remoteJid,
        messageId: providerMessageId,
        providerMessageId,
        providerPayload,
        instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
        instanceId: context.instanceId,
        isGroup: context.remoteJid.endsWith("@g.us"),
        senderName: user.name,
        sentFromMonitor: true,
        mediaType: input.mediaType,
        mediaBase64: input.mediaBase64,
        fileName: input.fileName,
      }),
      createdAt,
      providerMessageId,
    ],
  );


  // Messaging Intelligence: Detect and create event
  const monitorMessage: WhatsappMonitorMessage = {
    id: providerMessageId,
    dealId,
    direction: "OUTBOUND",
    senderName: user.name,
    senderJid: null,
    senderProfilePictureUrl: null,
    content: input.caption || (input.fileName ? `Arquivo: ${input.fileName}` : `Midia enviada (${input.mediaType})`),
    createdAt,
    remoteJid: context.remoteJid,
    isGroup: context.remoteJid.endsWith("@g.us"),
    metadata: {
      remoteJid: context.remoteJid,
      messageId: providerMessageId,
      instance: context.instanceLabel || context.evolution?.instanceName || "WhatsApp",
      sentFromMonitor: true,
      mediaType: input.mediaType,
      mediaBase64: input.mediaBase64,
      fileName: input.fileName,
    },
    risk: detectWhatsappMessageRisk(input.caption || ""),
  };

  createEventFromMessage(monitorMessage, dealId).catch((err) => {
    logger.warn("failed to create message event from monitor media reply", {
      dealId,
      messageId: providerMessageId,
      error: err.message,
    });
  });

  await Promise.all([
    pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]),
    pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, last_read_at, force_unread, marked_unread_at, updated_at)
      VALUES ($1, $2, NOW(), false, NULL, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        last_read_at = NOW(),
        force_unread = false,
        marked_unread_at = NULL,
        updated_at = NOW()
      `,
      [dealId, user.id],
    ),
  ]);

  return getWhatsappMonitorConversation(dealId, user);
}

export async function getWhatsappMonitorMetrics(user: JwtUser): Promise<WhatsappMonitorMetrics> {
  const params: unknown[] = [];
  const dealWhere = [monitorableWhatsappJidSql("d.whatsapp_jid")];

  if (user.role === "SELLER") {
    params.push(user.name);
    dealWhere.push(`d.assigned_to_name = $${params.length}`);
  }

  const whereSql = dealWhere.join(" AND ");
  const metricsResult = await pool.query(
    `
    SELECT
      d.id AS deal_id,
      d.whatsapp_instance_id,
      COALESCE(wi.display_label, d.assigned_to_name, 'Sem agente') AS agent_name,
      wi.profile_picture_url,
      da.activity_type,
      da.content,
      da.metadata,
      da.created_at,
      NULL AS incoming_raw_payload,
      NULL AS incoming_from_me
    FROM deals d
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN deal_activities da
      ON da.deal_id = d.id
      AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    WHERE ${whereSql}
    ORDER BY d.id ASC, da.created_at ASC NULLS LAST, da.id ASC
    `,
    params,
  );

  const conversationIds = new Set<string>();
  const responseByDeal = new Map<
    string,
    {
      agentId: string | null;
      agentName: string;
      profilePictureUrl: string | null;
      firstInboundAt: Date | null;
      firstOutboundAt: Date | null;
    }
  >();
  const summary = {
    totalConversations: 0,
    receivedMessages: 0,
    sentMessages: 0,
    mediaMessages: 0,
    riskEvents: 0,
  };

  for (const row of metricsResult.rows) {
    const dealId = String(row.deal_id);
    conversationIds.add(dealId);

    if (!row.activity_type) {
      continue;
    }

    const metadata = asRecord(row.metadata) ?? {};
    const isOutbound = isWhatsappActivityOutbound(row, metadata);
    const createdAt = new Date(String(row.created_at));

    if (isOutbound) {
      summary.sentMessages += 1;
    } else {
      summary.receivedMessages += 1;
    }

    if (whatsappActivityHasMedia(row, metadata)) {
      summary.mediaMessages += 1;
    }

    if (detectWhatsappMessageRisk(optionalString(row.content) ?? "")) {
      summary.riskEvents += 1;
    }

    if (!Number.isFinite(createdAt.getTime())) {
      continue;
    }

    const responseState =
      responseByDeal.get(dealId) ??
      {
        agentId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
        agentName: optionalString(row.agent_name) ?? "Sem agente",
        profilePictureUrl: optionalString(row.profile_picture_url),
        firstInboundAt: null,
        firstOutboundAt: null,
      };

    if (!isOutbound && responseState.firstInboundAt === null) {
      responseState.firstInboundAt = createdAt;
    } else if (
      isOutbound &&
      responseState.firstInboundAt !== null &&
      responseState.firstOutboundAt === null &&
      createdAt > responseState.firstInboundAt
    ) {
      responseState.firstOutboundAt = createdAt;
    }

    responseByDeal.set(dealId, responseState);
  }

  summary.totalConversations = conversationIds.size;

  const responseRows = Array.from(responseByDeal.values())
    .filter((row) => row.firstInboundAt !== null)
    .map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      profilePictureUrl: row.profilePictureUrl,
      responseMinutes:
        row.firstInboundAt && row.firstOutboundAt
          ? (row.firstOutboundAt.getTime() - row.firstInboundAt.getTime()) / 60000
          : null,
    }));
  const responseMinutes = responseRows
    .map((row) => row.responseMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const groupedAgents = new Map<
    string,
    {
      agentId: string | null;
      agentName: string;
      profilePictureUrl: string | null;
      conversationCount: number;
      responseMinutes: number[];
    }
  >();

  for (const row of responseRows) {
    const key = row.agentId ?? row.agentName;
    const current =
      groupedAgents.get(key) ??
      {
        agentId: row.agentId,
        agentName: row.agentName,
        profilePictureUrl: row.profilePictureUrl,
        conversationCount: 0,
        responseMinutes: [],
      };

    current.conversationCount += 1;
    if (row.responseMinutes !== null && Number.isFinite(row.responseMinutes)) {
      current.responseMinutes.push(row.responseMinutes);
    }
    groupedAgents.set(key, current);
  }

  const agilityLeaders = Array.from(groupedAgents.values())
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      profilePictureUrl: agent.profilePictureUrl,
      conversationCount: agent.conversationCount,
      responseCount: agent.responseMinutes.length,
      averageFirstResponseMinutes: agent.responseMinutes.length
        ? agent.responseMinutes.reduce((sum, value) => sum + value, 0) / agent.responseMinutes.length
        : null,
      medianFirstResponseMinutes: median(agent.responseMinutes),
    }))
    .sort((left, right) => {
      if (left.medianFirstResponseMinutes === null && right.medianFirstResponseMinutes === null) {
        return right.responseCount - left.responseCount;
      }
      if (left.medianFirstResponseMinutes === null) return 1;
      if (right.medianFirstResponseMinutes === null) return -1;
      return left.medianFirstResponseMinutes - right.medianFirstResponseMinutes;
    })
    .slice(0, 5);

  return {
    summary: {
      totalConversations: summary.totalConversations,
      receivedMessages: summary.receivedMessages,
      sentMessages: summary.sentMessages,
      mediaMessages: summary.mediaMessages,
      riskEvents: summary.riskEvents,
      averageFirstResponseMinutes: responseMinutes.length
        ? responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length
        : null,
      medianFirstResponseMinutes: median(responseMinutes),
    },
    agilityLeaders,
  };
}

interface ActivityConversationAccumulator {
  remoteJid: string;
  name: string;
  kind: WhatsappAgentActivityConversationKind;
  sentMessages: number;
  receivedMessages: number;
}

interface ActivityReportAccumulator {
  sentMessages: number;
  receivedMessages: number;
  receivedUniquePrivates: Set<string>;
  receivedUniqueCustomerGroups: Set<string>;
  receivedUniqueInternalGroups: Set<string>;
  receivedUniqueOtherGroups: Set<string>;
  sentUniquePrivates: Set<string>;
  sentUniqueCustomerGroups: Set<string>;
  sentUniqueInternalGroups: Set<string>;
  sentUniqueOtherGroups: Set<string>;
  attendedConversations: Set<string>;
  attendedPrivates: Set<string>;
  customerGroups: Set<string>;
  internalGroups: Set<string>;
  otherGroups: Set<string>;
  conversations: Map<string, ActivityConversationAccumulator>;
  responseSeconds: number[];
}

function createActivityReportAccumulator(): ActivityReportAccumulator {
  return {
    sentMessages: 0,
    receivedMessages: 0,
    receivedUniquePrivates: new Set<string>(),
    receivedUniqueCustomerGroups: new Set<string>(),
    receivedUniqueInternalGroups: new Set<string>(),
    receivedUniqueOtherGroups: new Set<string>(),
    sentUniquePrivates: new Set<string>(),
    sentUniqueCustomerGroups: new Set<string>(),
    sentUniqueInternalGroups: new Set<string>(),
    sentUniqueOtherGroups: new Set<string>(),
    attendedConversations: new Set<string>(),
    attendedPrivates: new Set<string>(),
    customerGroups: new Set<string>(),
    internalGroups: new Set<string>(),
    otherGroups: new Set<string>(),
    conversations: new Map<string, ActivityConversationAccumulator>(),
    responseSeconds: [],
  };
}

function getActivityConversation(
  accumulator: ActivityReportAccumulator,
  remoteJid: string,
  name: string | null,
  kind: WhatsappAgentActivityConversationKind,
) {
  const current =
    accumulator.conversations.get(remoteJid) ??
    {
      remoteJid,
      name: name ?? formatWhatsappJidPhone(remoteJid),
      kind,
      sentMessages: 0,
      receivedMessages: 0,
    };

  if (name && current.name === formatWhatsappJidPhone(remoteJid)) {
    current.name = name;
  }
  current.kind = current.kind === "internal_group" ? current.kind : kind;
  accumulator.conversations.set(remoteJid, current);
  return current;
}

function registerActivityReportEvent(input: {
  accumulator: ActivityReportAccumulator;
  remoteJid: string;
  chatName: string | null;
  kind: WhatsappAgentActivityConversationKind;
  isOutbound: boolean;
}) {
  const conversation = getActivityConversation(input.accumulator, input.remoteJid, input.chatName, input.kind);

  if (input.isOutbound) {
    input.accumulator.sentMessages += 1;
    conversation.sentMessages += 1;

    if (input.kind === "private") {
      input.accumulator.attendedPrivates.add(input.remoteJid);
      input.accumulator.attendedConversations.add(input.remoteJid);
      input.accumulator.sentUniquePrivates.add(input.remoteJid);
    } else if (input.kind === "internal_group") {
      input.accumulator.internalGroups.add(input.remoteJid);
      input.accumulator.sentUniqueInternalGroups.add(input.remoteJid);
    } else {
      input.accumulator.attendedConversations.add(input.remoteJid);
      if (input.kind === "customer_group") {
        input.accumulator.customerGroups.add(input.remoteJid);
        input.accumulator.sentUniqueCustomerGroups.add(input.remoteJid);
      } else {
        input.accumulator.otherGroups.add(input.remoteJid);
        input.accumulator.sentUniqueOtherGroups.add(input.remoteJid);
      }
    }
  } else {
    input.accumulator.receivedMessages += 1;
    conversation.receivedMessages += 1;
    
    if (input.kind === "private") {
      input.accumulator.receivedUniquePrivates.add(input.remoteJid);
    } else if (input.kind === "customer_group") {
      input.accumulator.receivedUniqueCustomerGroups.add(input.remoteJid);
    } else if (input.kind === "internal_group") {
      input.accumulator.receivedUniqueInternalGroups.add(input.remoteJid);
    } else {
      input.accumulator.receivedUniqueOtherGroups.add(input.remoteJid);
    }
  }
}

function addResponseSeconds(accumulator: ActivityReportAccumulator, responseSeconds: number | null) {
  if (responseSeconds !== null && Number.isFinite(responseSeconds) && responseSeconds >= 0) {
    accumulator.responseSeconds.push(responseSeconds);
  }
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function publicActivityCounters(accumulator: ActivityReportAccumulator) {
  const conversations = Array.from(accumulator.conversations.values());

  // Critério de conversa concluída: Teve recebida E enviada (interação real)
  const attended = conversations.filter((c) => c.sentMessages > 0 && c.receivedMessages > 0);

  const attendedGroups = attended.filter((c) => c.kind === "customer_group" || c.kind === "other_group");
  const attendedPrivates = attended.filter((c) => c.kind === "private");
  const internalGroups = conversations.filter((c) => c.kind === "internal_group" && c.sentMessages > 0);

  const privateConvs = conversations.filter((c) => c.kind === "private");
  const groupConvs = conversations.filter((c) => c.kind !== "private");

  return {
    attendedConversations: attendedPrivates.length + attendedGroups.length,
    attendedGroups: attendedGroups.length,
    attendedPrivates: attendedPrivates.length,
    customerGroups: attendedGroups.filter((c) => c.kind === "customer_group").length,
    internalGroups: internalGroups.length,
    otherGroups: attendedGroups.filter((c) => c.kind === "other_group").length,
    sentMessages: accumulator.sentMessages,
    sentMessagesPrivate: privateConvs.reduce((sum, c) => sum + c.sentMessages, 0),
    sentMessagesGroup: groupConvs.reduce((sum, c) => sum + c.sentMessages, 0),
    receivedMessages: accumulator.receivedMessages,
    receivedMessagesPrivate: privateConvs.reduce((sum, c) => sum + c.receivedMessages, 0),
    receivedMessagesGroup: groupConvs.reduce((sum, c) => sum + c.receivedMessages, 0),
    receivedUniqueMessages: accumulator.receivedUniquePrivates.size + accumulator.receivedUniqueCustomerGroups.size + accumulator.receivedUniqueOtherGroups.size,
    receivedUniqueMessagesPrivate: accumulator.receivedUniquePrivates.size,
    receivedUniqueMessagesGroup: accumulator.receivedUniqueCustomerGroups.size + accumulator.receivedUniqueOtherGroups.size,
    sentUniqueMessages: accumulator.sentUniquePrivates.size + accumulator.sentUniqueCustomerGroups.size + accumulator.sentUniqueOtherGroups.size,
    sentUniqueMessagesPrivate: accumulator.sentUniquePrivates.size,
    sentUniqueMessagesGroup: accumulator.sentUniqueCustomerGroups.size + accumulator.sentUniqueOtherGroups.size,
    attendedConversationsCount: accumulator.attendedConversations.size, // Use the Set for accurate unique count across periods
    responseCount: accumulator.responseSeconds.length,
    averageFirstResponseSeconds: average(accumulator.responseSeconds),
  };
}

function publicActivityConversations(accumulator: ActivityReportAccumulator) {
  return Array.from(accumulator.conversations.values())
    .filter((conversation) => conversation.sentMessages > 0 || conversation.receivedMessages > 0)
    .sort((left, right) => right.sentMessages - left.sentMessages || left.name.localeCompare(right.name))
    .slice(0, 100);
}

export async function getWhatsappAgentActivityReport(
  user: JwtUser,
  daysInput = 7,
): Promise<WhatsappAgentActivityReport> {
  const days = Math.max(1, Math.min(31, Math.floor(daysInput) || 7));

  // Redis cache to avoid re-running the expensive query on every request
  const cacheKey = user.role === "SELLER"
    ? `wa-activity-report:${days}:seller:${user.id}`
    : `wa-activity-report:${days}:all`;
  const cacheTtl = user.role === "SELLER" ? 90 : 60; // seconds

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as WhatsappAgentActivityReport;
    }
  } catch {
    // Redis failure should not block the report
  }

  const reportDays = buildActivityReportDays(days);
  const totalReportDays = buildActivityReportDays(days * 2);

  const startDate = totalReportDays[0]?.date ?? localDateKey(new Date());
  const endDate = totalReportDays[totalReportDays.length - 1]?.date ?? localDateKey(new Date());
  const pivotDate = reportDays[0]?.date ?? startDate;

  const params: unknown[] = [startDate, endDate];
  const where: string[] = [
    "da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')",
    `da.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')`,
    `da.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')`,
  ];

  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    const userIdParamIndex = params.length - 1;
    const userNameParamIndex = params.length;
    where.push(`
      (
        da.actor_user_id = $${userIdParamIndex}
        OR d.assigned_to = $${userIdParamIndex}
        OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($${userNameParamIndex})
        OR EXISTS (
          SELECT 1 FROM whatsapp_instances wi_sub 
          WHERE wi_sub.id = d.whatsapp_instance_id 
            AND (wi_sub.assigned_user_id = $${userIdParamIndex} OR LOWER(COALESCE(wi_sub.assigned_user_name, '')) = LOWER($${userNameParamIndex}))
        )
      )
    `);
  }

  // Run all DB queries in parallel for maximum performance.
  // Use a dedicated client with statement_timeout for the main heavy query
  // to prevent the reverse proxy from killing the connection with a 502.
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '25s'");

    const [allInstances, result, usersRes] = await Promise.all([
      client.query(`
        SELECT 
          wi.id as instance_id,
          wi.instance_name,
          wi.display_label,
          wi.phone_number,
          wi.profile_picture_url,
          wi.assigned_user_id,
          wi.assigned_user_name,
          u.id as user_id,
          u.name as user_name
        FROM whatsapp_instances wi
        LEFT JOIN users u ON u.id = wi.assigned_user_id
        WHERE wi.status = 'ACTIVE'
      `),
      client.query(
        `
        SELECT
          da.activity_type,
          da.actor_user_id::text AS actor_user_id,
          da.actor_name,
          da.created_at,
          (da.metadata ->> 'instance')::text AS metadata_instance,
          (da.metadata ->> 'remoteJid')::text AS metadata_remote_jid,
          (da.metadata ->> 'chatDisplayName')::text AS metadata_chat_display_name,
          (da.metadata ->> 'fromMe')::text AS metadata_from_me,
          (da.metadata ->> 'isOutbound')::text AS metadata_is_outbound,
          (da.metadata ->> 'capturedFromWhatsapp')::text AS metadata_captured,
          (da.metadata ->> 'sentFromMonitor')::text AS metadata_sent_from_monitor,
          d.assigned_to,
          d.assigned_to_name,
          d.whatsapp_instance_id,
          d.whatsapp_jid,
          d.customer_display_name,
          d.title,
          TO_CHAR(timezone('${ACTIVITY_REPORT_TIMEZONE}', da.created_at), 'YYYY-MM-DD') AS local_date,
          EXTRACT(HOUR FROM timezone('${ACTIVITY_REPORT_TIMEZONE}', da.created_at))::int AS local_hour
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        WHERE ${where.join("\n          AND ")}
        ORDER BY da.created_at ASC, da.id ASC
        `,
        params,
      ),
      client.query("SELECT id, name FROM users"),
    ]);

  const users = usersRes.rows;
  // Use allInstances rows also as instance lookup (avoid extra query)
  const instances = allInstances.rows.map((r: Record<string, unknown>) => ({
    id: r.instance_id,
    instance_name: r.instance_name,
    display_label: r.display_label,
    phone_number: r.phone_number,
    profile_picture_url: r.profile_picture_url,
    assigned_user_id: r.assigned_user_id ?? r.user_id,
    assigned_user_name: r.assigned_user_name ?? r.user_name,
  }));

  const currentPeriodDateKeys = new Set(reportDays.map((day) => day.date));
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const agents = new Map<
    string,
    {
      agentId: string;
      agentName: string;
      instanceName: string | null;
      displayLabel: string | null;
      phoneNumber: string | null;
      profilePictureUrl: string | null;
      accumulator: ActivityReportAccumulator;
      activeHours: Set<string>;
      lastMessageAt: string | null;
    }
  >();
  const cells = new Map<
    string,
    {
      agentId: string;
      agentName: string;
      date: string;
      hour: number;
      accumulator: ActivityReportAccumulator;
    }
  >();
  const dailyAccumulators = new Map<string, ActivityReportAccumulator>();
  const summaryAccumulator = createActivityReportAccumulator();
  const previousSummaryAccumulator = createActivityReportAccumulator();
  const pendingInboundByAgentConversation = new Map<string, Date>();

  // To track active agents in each period correctly
  const currentPeriodAgents = new Set<string>();
  const previousPeriodAgents = new Set<string>();

  // Pre-populate with all active instances/assigned users
  for (const row of allInstances.rows) {
    const agentId = row.user_id ? String(row.user_id) : `instance:${row.instance_id}`;
    const agentName = row.user_name && row.user_name !== row.display_label && row.user_name !== row.instance_name
      ? `${row.user_name} (${row.display_label || row.instance_name})`
      : row.user_name || row.display_label || row.instance_name || "Agente desconhecido";
    
    agents.set(agentId, {
      agentId,
      agentName,
      instanceName: row.instance_name ? String(row.instance_name) : null,
      displayLabel: row.display_label ? String(row.display_label) : null,
      phoneNumber: row.phone_number ? String(row.phone_number) : null,
      profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
      accumulator: createActivityReportAccumulator(),
      activeHours: new Set<string>(),
      lastMessageAt: null,
    });
  }

  // Pre-build user/instance lookup maps for O(1) resolution instead of O(n) .find()
  const userById = new Map<string, { id: string; name: string }>();
  const userByNameLower = new Map<string, { id: string; name: string }>();
  for (const u of users) {
    userById.set(String(u.id), u);
    if (u.name) userByNameLower.set(String(u.name).toLowerCase(), u);
  }
  const instanceById = new Map<string, Record<string, unknown>>();
  const instanceByNameLower = new Map<string, Record<string, unknown>>();
  for (const inst of instances) {
    instanceById.set(String(inst.id), inst);
    if (inst.instance_name) instanceByNameLower.set(String(inst.instance_name).toLowerCase(), inst);
  }

  for (const row of result.rows) {
    const localDate = optionalString(row.local_date);
    const localHour = Number(row.local_hour);
    if (!localDate || !Number.isInteger(localHour)) {
      continue;
    }

    const remoteJid = String(row.metadata_remote_jid || row.whatsapp_jid || "");
    if (!remoteJid) {
      continue;
    }

    // In-memory monitorable JID filter (replaces expensive SQL COALESCE filter)
    const jidLower = remoteJid.toLowerCase();
    if (jidLower === 'status@broadcast' || jidLower.endsWith('@broadcast')) {
      continue;
    }

    // Resolve WhatsApp instance (O(1) map lookup)
    const metadataInstance = row.metadata_instance ? String(row.metadata_instance).toLowerCase() : "";
    const wi = (row.whatsapp_instance_id ? instanceById.get(String(row.whatsapp_instance_id)) : null)
      ?? (metadataInstance ? instanceByNameLower.get(metadataInstance) : null)
      ?? null;

    // Resolve matched user (O(1) map lookup chain)
    const actorName = row.actor_name ? String(row.actor_name).toLowerCase() : "";
    const assignedToName = row.assigned_to_name ? String(row.assigned_to_name).toLowerCase() : "";
    const wiAssignedUserName = wi?.assigned_user_name ? String(wi.assigned_user_name).toLowerCase() : "";

    const matchedUser = 
      (row.actor_user_id ? userById.get(String(row.actor_user_id)) : null) ??
      (row.assigned_to ? userById.get(String(row.assigned_to)) : null) ??
      (wi?.assigned_user_id ? userById.get(String(wi.assigned_user_id)) : null) ??
      (actorName ? userByNameLower.get(actorName) : null) ??
      (assignedToName ? userByNameLower.get(assignedToName) : null) ??
      (wiAssignedUserName ? userByNameLower.get(wiAssignedUserName) : null) ??
      null;

    const agentId = matchedUser 
      ? String(matchedUser.id)
      : (wi ? `instance:${wi.id}` : 'sem-agente');

    let agentName = "Sem agente";
    const wiLabel = wi ? (wi.display_label || wi.instance_name) : null;
    if (matchedUser) {
      if (wiLabel) {
        agentName = `${matchedUser.name} (${wiLabel})`;
      } else {
        agentName = matchedUser.name;
      }
    } else if (wiLabel) {
      agentName = String(wiLabel);
    }

    const instanceName = wi ? String(wi.instance_name ?? "") : null;
    const displayLabel = wi ? String(wi.display_label ?? "") : null;
    const phoneNumber = wi ? String(wi.phone_number ?? "") : null;
    const profilePictureUrl = wi ? (wi.profile_picture_url ? String(wi.profile_picture_url) : null) : null;

    const isGroup = remoteJid.endsWith("@g.us");
    const groupClass = classifyWhatsappGroup({
      isGroup,
      name: row.metadata_chat_display_name || row.customer_display_name || row.title,
    });
    // Resolve fromMe using extracted metadata fields instead of full metadata object
    const resolvedFromMe = 
      optionalBoolean(row.metadata_from_me) ??
      optionalBoolean(row.metadata_is_outbound) ??
      optionalBoolean(row.metadata_captured) ??
      optionalBoolean(row.metadata_sent_from_monitor) ??
      null;
    const isOutbound = resolvedFromMe ?? (String(row.activity_type) === "WHATSAPP_SENT");
    const chatName = row.metadata_chat_display_name || row.customer_display_name || row.title || "";
    if (isInternalChat(chatName, remoteJid)) {
      continue;
    }
    const createdAt = new Date(String(row.created_at));

    const isCurrentPeriod = localDate >= pivotDate;

    const pendingKey = `${agentId}:${remoteJid}`;
    let responseSeconds: number | null = null;
    if (isOutbound) {
      const pendingInboundAt = pendingInboundByAgentConversation.get(pendingKey);
      if (pendingInboundAt) {
        responseSeconds = Math.max(0, (createdAt.getTime() - pendingInboundAt.getTime()) / 1000);
        pendingInboundByAgentConversation.delete(pendingKey);
      }
      if (isCurrentPeriod) {
        currentPeriodAgents.add(agentId);
      } else {
        previousPeriodAgents.add(agentId);
      }
    } else {
      pendingInboundByAgentConversation.set(pendingKey, createdAt);
    }

    if (isCurrentPeriod) {
      const current =
        agents.get(agentId) ??
        {
          agentId,
          agentName,
          instanceName,
          displayLabel,
          phoneNumber,
          profilePictureUrl,
          accumulator: createActivityReportAccumulator(),
          activeHours: new Set<string>(),
          lastMessageAt: null,
        };

      current.agentName = agentName;
      current.instanceName ??= instanceName;
      current.displayLabel ??= displayLabel;
      current.phoneNumber ??= phoneNumber;
      current.profilePictureUrl ??= profilePictureUrl;
      current.lastMessageAt = isoDate(row.created_at);
      agents.set(agentId, current);

      const dailyAccumulator = dailyAccumulators.get(localDate) ?? createActivityReportAccumulator();
      dailyAccumulators.set(localDate, dailyAccumulator);

      const cellKey = `${agentId}:${localDate}:${localHour}`;
      const cell =
        cells.get(cellKey) ??
        {
          agentId,
          agentName,
          date: localDate,
          hour: localHour,
          accumulator: createActivityReportAccumulator(),
        };
      cell.agentName = agentName;
      cells.set(cellKey, cell);

      if (isOutbound) {
        current.activeHours.add(`${localDate}:${localHour}`);
      }

      for (const accumulator of [summaryAccumulator, dailyAccumulator, current.accumulator, cell.accumulator]) {
        registerActivityReportEvent({
          accumulator,
          remoteJid,
          chatName,
          kind: groupClass,
          isOutbound,
        });
        addResponseSeconds(accumulator, responseSeconds);
      }
    } else {
      // Previous period
      registerActivityReportEvent({
        accumulator: previousSummaryAccumulator,
        remoteJid,
        chatName,
        kind: groupClass,
        isOutbound,
      });
      addResponseSeconds(previousSummaryAccumulator, responseSeconds);
    }
  }

  const agentRows = Array.from(agents.values())
    .map((agent) => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      instanceName: agent.instanceName,
      displayLabel: agent.displayLabel,
      phoneNumber: agent.phoneNumber,
      profilePictureUrl: agent.profilePictureUrl,
      ...publicActivityCounters(agent.accumulator),
      activeHours: agent.activeHours.size,
      lastMessageAt: agent.lastMessageAt,
    }))
    .sort((left, right) => right.sentMessages - left.sentMessages || left.agentName.localeCompare(right.agentName));

  const engagedConversations = Array.from(summaryAccumulator.conversations.values())
    .filter((c) => c.sentMessages > 0 && c.receivedMessages > 0);
  const engagedPrivates = new Set(engagedConversations.filter((c) => c.kind === "private").map((c) => c.remoteJid));
  const engagedGroups = new Set(engagedConversations.filter((c) => c.kind !== "private").map((c) => c.remoteJid));

  const report: WhatsappAgentActivityReport = {
    period: {
      startDate: reportDays[0]?.date ?? pivotDate,
      endDate: reportDays[reportDays.length - 1]?.date ?? pivotDate,
      days,
      timezone: ACTIVITY_REPORT_TIMEZONE,
      nightStartHour: ACTIVITY_REPORT_NIGHT_START_HOUR,
      nightEndHour: ACTIVITY_REPORT_NIGHT_END_HOUR,
    },
    summary: {
      ...publicActivityCounters(summaryAccumulator),
      activeAgents: currentPeriodAgents.size,
    },
    previousSummary: {
      ...publicActivityCounters(previousSummaryAccumulator),
      activeAgents: previousPeriodAgents.size,
    },
    days: reportDays,
    hours,
    agents: agentRows,
    dailySeries: reportDays.map((day) => {
      const accumulator = dailyAccumulators.get(day.date) ?? createActivityReportAccumulator();
      const counts = publicActivityCounters(accumulator);
      const dayJids = Array.from(accumulator.conversations.keys());
      const dayAttendedPrivates = dayJids.filter((jid) => engagedPrivates.has(jid)).length;
      const dayAttendedGroups = dayJids.filter((jid) => engagedGroups.has(jid)).length;

      return {
        date: day.date,
        label: day.label,
        attendedConversations: dayAttendedPrivates + dayAttendedGroups,
        attendedGroups: dayAttendedGroups,
        attendedPrivates: dayAttendedPrivates,
        sentMessages: counts.sentMessages,
        sentMessagesPrivate: counts.sentMessagesPrivate,
        sentMessagesGroup: counts.sentMessagesGroup,
        receivedMessages: counts.receivedMessages,
        receivedMessagesPrivate: counts.receivedMessagesPrivate,
        receivedMessagesGroup: counts.receivedMessagesGroup,
        receivedUniqueMessages: counts.receivedUniqueMessages,
        receivedUniqueMessagesPrivate: counts.receivedUniqueMessagesPrivate,
        receivedUniqueMessagesGroup: counts.receivedUniqueMessagesGroup,
        sentUniqueMessages: counts.sentUniqueMessages,
        sentUniqueMessagesPrivate: counts.sentUniqueMessagesPrivate,
        sentUniqueMessagesGroup: counts.sentUniqueMessagesGroup,
        averageFirstResponseSeconds: counts.averageFirstResponseSeconds,
      };
    }),
    hourlyCells: Array.from(cells.values()).map((cell) => {
      const counts = publicActivityCounters(cell.accumulator);
      const cellJids = Array.from(cell.accumulator.conversations.keys());
      const cellAttendedPrivates = cellJids.filter((jid) => engagedPrivates.has(jid)).length;
      const cellAttendedGroups = cellJids.filter((jid) => engagedGroups.has(jid)).length;

      return {
        agentId: cell.agentId,
        agentName: cell.agentName,
        date: cell.date,
        hour: cell.hour,
        ...counts,
        attendedConversations: cellAttendedPrivates + cellAttendedGroups,
        attendedPrivates: cellAttendedPrivates,
        attendedGroups: cellAttendedGroups,
        conversations: publicActivityConversations(cell.accumulator),
      };
    }),
  };

  // Write to Redis cache (fire-and-forget, don't block the response)
  redis.set(cacheKey, JSON.stringify(report), "EX", cacheTtl).catch(() => {});

  return report;

  } finally {
    client.release();
  }
}

export async function setWhatsappConversationReadState(
  dealId: string,
  user: JwtUser,
  unread: boolean,
): Promise<WhatsappMonitorConversationDetail> {
  const existing = await pool.query(
    `SELECT id FROM deals WHERE id = $1 AND ${monitorableWhatsappJidSql("whatsapp_jid")}`,
    [dealId],
  );
  if (!existing.rows[0]) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  if (unread) {
    await pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, force_unread, marked_unread_at, updated_at)
      VALUES ($1, $2, true, NOW(), NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        force_unread = true,
        marked_unread_at = NOW(),
        updated_at = NOW()
      `,
      [dealId, user.id],
    );
  } else {
    await pool.query(
      `
      INSERT INTO whatsapp_conversation_reads (deal_id, user_id, last_read_at, force_unread, marked_unread_at, updated_at)
      VALUES ($1, $2, NOW(), false, NULL, NOW())
      ON CONFLICT (deal_id, user_id) DO UPDATE SET
        last_read_at = NOW(),
        force_unread = false,
        marked_unread_at = NULL,
        updated_at = NOW()
      `,
      [dealId, user.id],
    );
  }

  void syncConversationReadStateWithEvolution(dealId, unread);

  return getWhatsappMonitorConversation(dealId, user);
}

export async function getWhatsappDailySummaryReport(
  user: JwtUser,
  dateInput?: string
): Promise<any> {
  // Use provided date or default to current date in America/Sao_Paulo timezone
  const dateStr = dateInput || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

  // 1. Query New Customers of the day (Optimized: filters by date first, then runs fast NOT EXISTS index lookup)
  const newCustomersResult = await pool.query(
    `
    SELECT
      c.customer_code,
      c.display_name,
      o.total_amount::numeric(14,2) as total_amount,
      o.item_count,
      COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') as last_attendant
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.order_date = $1::date
      AND NOT EXISTS (
        SELECT 1 FROM orders o2 
        WHERE o2.customer_id = o.customer_id 
          AND o2.order_date < $1::date
      )
    ORDER BY o.total_amount DESC, c.display_name ASC
    `,
    [dateStr]
  );

  // 2. Query Recovered Customers of the day (Optimized: filters by date first, then retrieves prior order using MAX index)
  const recoveredCustomersResult = await pool.query(
    `
    WITH scoped_orders AS (
      SELECT
        o.customer_id,
        o.order_date,
        o.total_amount,
        o.item_count,
        COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') as last_attendant,
        (
          SELECT MAX(o2.order_date) 
          FROM orders o2 
          WHERE o2.customer_id = o.customer_id 
            AND o2.order_date < o.order_date
        ) as previous_order_date
      FROM orders o
      WHERE o.order_date = $1::date
    )
    SELECT
      c.customer_code,
      c.display_name,
      so.total_amount::numeric(14,2) as total_amount,
      so.item_count,
      so.last_attendant,
      so.previous_order_date::text as previous_order_date,
      (so.order_date - so.previous_order_date)::int as days_inactive
    FROM scoped_orders so
    JOIN customers c ON c.id = so.customer_id
    WHERE so.previous_order_date IS NOT NULL
      AND (so.order_date - so.previous_order_date) >= 90
    ORDER BY so.total_amount DESC, c.display_name ASC
    `,
    [dateStr]
  );

  // 3. Query Sales Performance for the day (Optimized: calculates sum of items only for the days' orders)
  const salesPerformanceResult = await pool.query(
    `
    WITH scoped_orders AS (
      SELECT
        o.id,
        o.customer_id,
        COALESCE(NULLIF(o.last_attendant, ''), 'Sem atendente') AS attendant,
        COALESCE(o.total_amount, 0)::numeric(14,2) AS total_revenue,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          WHERE oi.order_id = o.id
        ), 0)::int AS total_items
      FROM orders o
      WHERE o.order_date = $1::date
    )
    SELECT
      so.attendant,
      COUNT(*)::int AS total_orders,
      COUNT(DISTINCT so.customer_id)::int AS unique_customers,
      COALESCE(SUM(so.total_revenue), 0)::numeric(14,2) AS total_revenue,
      COALESCE(SUM(so.total_items), 0)::int AS total_items
    FROM scoped_orders so
    GROUP BY so.attendant
    ORDER BY total_items DESC, total_revenue DESC, attendant ASC
    `,
    [dateStr]
  );

  // 4. Query Chat Activities for the day (Optimized: removed unindexed multi-OR outer joins and handles resolving in JS memory)
  const where: string[] = [
    "da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')",
    "da.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')",
    "da.created_at < (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')",
    monitorableWhatsappJidSql("COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)"),
  ];
  
  const params: any[] = [dateStr];

  if (user.role === "SELLER") {
    params.push(user.id, user.name);
    where.push(`
      (
        da.actor_user_id = $2
        OR d.assigned_to = $2
        OR LOWER(COALESCE(d.assigned_to_name, '')) = LOWER($3)
        OR EXISTS (
          SELECT 1 FROM whatsapp_instances wi_sub 
          WHERE wi_sub.id = d.whatsapp_instance_id 
            AND (wi_sub.assigned_user_id = $2 OR LOWER(COALESCE(wi_sub.assigned_user_name, '')) = LOWER($3))
        )
      )
    `);
  }

  const activitiesResult = await pool.query(
    `
    SELECT
      da.activity_type,
      da.actor_user_id,
      da.actor_name,
      da.metadata,
      da.created_at,
      NULL AS incoming_raw_payload,
      NULL AS incoming_from_me,
      (da.metadata ->> 'instance')::text AS metadata_instance,
      (da.metadata ->> 'remoteJid')::text AS metadata_remote_jid,
      (da.metadata ->> 'chatDisplayName')::text AS metadata_chat_display_name,
      d.assigned_to,
      d.assigned_to_name,
      d.whatsapp_instance_id,
      d.whatsapp_jid,
      d.customer_display_name,
      d.title,
      COALESCE(NULLIF(cs.display_name, ''), c.display_name) AS real_customer_name
    FROM deal_activities da
    JOIN deals d ON d.id = da.deal_id
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN customer_snapshot cs ON cs.customer_id = d.customer_id
    WHERE ${where.join("\n      AND ")}
    ORDER BY da.created_at ASC, da.id ASC
    `,
    params
  );

  // Fetch all users and whatsapp instances for fast in-memory name mapping
  const usersRes = await pool.query("SELECT id, name FROM users");
  const instancesRes = await pool.query("SELECT id, instance_name, display_label, assigned_user_id, assigned_user_name FROM whatsapp_instances");
  
  const users = usersRes.rows;
  const instances = instancesRes.rows;

  // Group activity data by agent
  const agentsMap = new Map<string, {
    agentId: string;
    agentName: string;
    sentMessages: number;
    receivedMessages: number;
    privateChats: Set<string>;
    groupChats: Set<string>;
    initiatedChats: Set<string>;
    // Keep track of first activity in each chat to calculate initiation
    chatFirstActivity: Map<string, { activityType: string; isGroup: boolean; name: string }>;
    // Detail lists
    attendedPrivateClients: Map<string, { name: string; jid: string; sent: number; received: number; initiated: boolean }>;
    attendedGroupClients: Map<string, { name: string; jid: string; sent: number; received: number }>;
    totalResponseSeconds: number;
    responseCount: number;
  }>();

  let totalSent = 0;
  let totalReceived = 0;
  const pendingInboundByAgentConversation = new Map<string, Date>();

  for (const row of activitiesResult.rows) {
    // Resolve WhatsApp instance (in-memory, highly efficient)
    const metadataInstance = row.metadata_instance ? String(row.metadata_instance).toLowerCase() : "";
    const wi = instances.find(inst => 
      inst.id === row.whatsapp_instance_id || 
      (metadataInstance && inst.instance_name && inst.instance_name.toLowerCase() === metadataInstance)
    );

    // Resolve matched user (in-memory fallback mapping, avoids unindexed outer joins)
    const actorName = row.actor_name ? String(row.actor_name).toLowerCase() : "";
    const assignedToName = row.assigned_to_name ? String(row.assigned_to_name).toLowerCase() : "";
    const wiAssignedUserName = wi?.assigned_user_name ? String(wi.assigned_user_name).toLowerCase() : "";

    const matchedUser = users.find(u => 
      u.id === row.actor_user_id ||
      u.id === row.assigned_to ||
      (wi && u.id === wi.assigned_user_id) ||
      (actorName && u.name && u.name.toLowerCase() === actorName) ||
      (assignedToName && u.name && u.name.toLowerCase() === assignedToName) ||
      (wiAssignedUserName && u.name && u.name.toLowerCase() === wiAssignedUserName)
    );

    const agentId = matchedUser 
      ? String(matchedUser.id)
      : (wi ? `instance:${wi.id}` : 'sem-agente');

    const wiLabel = wi ? (wi.display_label || wi.instance_name) : null;
    const agentName = matchedUser 
      ? matchedUser.name 
      : (wiLabel || 'Sem agente');

    const remoteJid = String(row.metadata_remote_jid || row.whatsapp_jid || "");
    const isGroup = remoteJid.endsWith("@g.us");
    const isOutbound = isWhatsappActivityOutbound(row);
    const chatName = row.real_customer_name || row.metadata_chat_display_name || row.customer_display_name || row.title || (isGroup ? "Grupo sem nome" : formatWhatsappJidPhone(remoteJid));
    
    if (isInternalChat(chatName, remoteJid)) {
      continue;
    }

    const createdAt = new Date(String(row.created_at));

    if (isOutbound) totalSent++;
    else totalReceived++;

    if (!agentsMap.has(agentId)) {
      agentsMap.set(agentId, {
        agentId,
        agentName,
        sentMessages: 0,
        receivedMessages: 0,
        privateChats: new Set(),
        groupChats: new Set(),
        initiatedChats: new Set(),
        chatFirstActivity: new Map(),
        attendedPrivateClients: new Map(),
        attendedGroupClients: new Map(),
        totalResponseSeconds: 0,
        responseCount: 0,
      });
    }

    const agent = agentsMap.get(agentId)!;

    // Track response seconds
    const pendingKey = `${agentId}:${remoteJid}`;
    if (isOutbound) {
      agent.sentMessages++;
      const pendingInboundAt = pendingInboundByAgentConversation.get(pendingKey);
      if (pendingInboundAt) {
        const responseSeconds = Math.max(0, (createdAt.getTime() - pendingInboundAt.getTime()) / 1000);
        agent.totalResponseSeconds += responseSeconds;
        agent.responseCount++;
        pendingInboundByAgentConversation.delete(pendingKey);
      }
    } else {
      agent.receivedMessages++;
      pendingInboundByAgentConversation.set(pendingKey, createdAt);
    }

    if (isGroup) {
      if (isOutbound) {
        agent.groupChats.add(remoteJid);
      }
      if (!agent.attendedGroupClients.has(remoteJid)) {
        agent.attendedGroupClients.set(remoteJid, {
          name: chatName,
          jid: remoteJid,
          sent: 0,
          received: 0,
        });
      }
      const client = agent.attendedGroupClients.get(remoteJid)!;
      if (isOutbound) client.sent++;
      else client.received++;
    } else {
      if (isOutbound) {
        agent.privateChats.add(remoteJid);
      }
      if (!agent.attendedPrivateClients.has(remoteJid)) {
        agent.attendedPrivateClients.set(remoteJid, {
          name: chatName,
          jid: remoteJid,
          sent: 0,
          received: 0,
          initiated: false,
        });
      }
      const client = agent.attendedPrivateClients.get(remoteJid)!;
      if (isOutbound) client.sent++;
      else client.received++;
    }

    // Check first activity for initiation
    if (!agent.chatFirstActivity.has(remoteJid)) {
      agent.chatFirstActivity.set(remoteJid, {
        activityType: isOutbound ? "WHATSAPP_SENT" : "WHATSAPP_RECEIVED",
        isGroup,
        name: chatName,
      });

      // If the first activity is outbound and it's private, it's initiated!
      if (isOutbound && !isGroup) {
        agent.initiatedChats.add(remoteJid);
        const client = agent.attendedPrivateClients.get(remoteJid);
        if (client) {
          client.initiated = true;
        }
      }
    }
  }

  // Combine sales performance with message metrics
  const salesPerformance = salesPerformanceResult.rows;
  const newCustomers = newCustomersResult.rows;
  const recoveredCustomers = recoveredCustomersResult.rows;

  const totalTelasSold = salesPerformance.reduce((sum, row) => sum + Number(row.total_items ?? 0), 0);
  const totalRevenue = salesPerformance.reduce((sum, row) => sum + Number(row.total_revenue ?? 0), 0);
  const totalOrders = salesPerformance.reduce((sum, row) => sum + Number(row.total_orders ?? 0), 0);

  // Build vendedoras daily summary
  const rawAgentsList = Array.from(agentsMap.values()).map(a => {
    // Find sales stats if they exist
    const sales = salesPerformance.find(s => 
      s.attendant.toLowerCase() === a.agentName.toLowerCase() ||
      (s.attendant === "Sem atendente" && a.agentName === "Sem agente")
    );

    return {
      agentId: a.agentId,
      agentName: a.agentName,
      sentMessages: a.sentMessages,
      receivedMessages: a.receivedMessages,
      privateChatsCount: a.privateChats.size,
      groupChatsCount: a.groupChats.size,
      initiatedCount: a.initiatedChats.size,
      screensSold: sales ? Number(sales.total_items ?? 0) : 0,
      ordersCount: sales ? Number(sales.total_orders ?? 0) : 0,
      revenue: sales ? Number(sales.total_revenue ?? 0) : 0,
      attendedPrivateClients: Array.from(a.attendedPrivateClients.values()).filter(c => c.sent > 0),
      attendedGroupClients: Array.from(a.attendedGroupClients.values()).filter(g => g.sent > 0),
      averageFirstResponseSeconds: a.responseCount > 0 ? Math.round(a.totalResponseSeconds / a.responseCount) : null,
    };
  });

  // Merge duplicate agents by name (case-insensitive)
  const mergedAgentsMap = new Map<string, typeof rawAgentsList[0]>();
  for (const agent of rawAgentsList) {
    const nameKey = agent.agentName.trim().toLowerCase();
    const existing = mergedAgentsMap.get(nameKey);
    if (existing) {
      existing.sentMessages += agent.sentMessages;
      existing.receivedMessages += agent.receivedMessages;
      existing.screensSold += agent.screensSold;
      existing.ordersCount += agent.ordersCount;
      existing.revenue += agent.revenue;
      
      // Merge unique private clients
      const privateClientsMap = new Map(existing.attendedPrivateClients.map(c => [c.jid, c]));
      agent.attendedPrivateClients.forEach(c => {
        const ext = privateClientsMap.get(c.jid);
        if (ext) {
          ext.sent += c.sent;
          ext.received += c.received;
          ext.initiated = ext.initiated || c.initiated;
        } else {
          privateClientsMap.set(c.jid, c);
        }
      });
      existing.attendedPrivateClients = Array.from(privateClientsMap.values());
      existing.privateChatsCount = existing.attendedPrivateClients.length;

      // Merge unique group clients
      const groupClientsMap = new Map(existing.attendedGroupClients.map(g => [g.jid, g]));
      agent.attendedGroupClients.forEach(g => {
        const ext = groupClientsMap.get(g.jid);
        if (ext) {
          ext.sent += g.sent;
          ext.received += g.received;
        } else {
          groupClientsMap.set(g.jid, g);
        }
      });
      existing.attendedGroupClients = Array.from(groupClientsMap.values());
      existing.groupChatsCount = existing.attendedGroupClients.length;

      // Initiated count
      existing.initiatedCount = existing.attendedPrivateClients.filter(c => c.initiated).length;

      // Average response time
      if (existing.averageFirstResponseSeconds !== null && agent.averageFirstResponseSeconds !== null) {
         existing.averageFirstResponseSeconds = Math.round((existing.averageFirstResponseSeconds + agent.averageFirstResponseSeconds) / 2);
      } else {
         existing.averageFirstResponseSeconds = existing.averageFirstResponseSeconds ?? agent.averageFirstResponseSeconds;
      }
    } else {
      mergedAgentsMap.set(nameKey, { ...agent });
    }
  }

  const agentsList = Array.from(mergedAgentsMap.values());

  // Sort agents: first those with sales (by screens sold), then by messages sent
  agentsList.sort((left, right) => {
    if (left.screensSold !== right.screensSold) return right.screensSold - left.screensSold;
    if (left.ordersCount !== right.ordersCount) return right.ordersCount - left.ordersCount;
    return right.sentMessages - left.sentMessages;
  });

  // Calculate global average response seconds
  const globalTotalResponseSeconds = Array.from(agentsMap.values()).reduce((sum, a) => sum + a.totalResponseSeconds, 0);
  const globalResponseCount = Array.from(agentsMap.values()).reduce((sum, a) => sum + a.responseCount, 0);
  const averageFirstResponseSeconds = globalResponseCount > 0 ? Math.round(globalTotalResponseSeconds / globalResponseCount) : null;

  // Format date for display: DD/MM/YYYY
  const [year, month, day] = dateStr.split("-");
  const formattedDate = `${day}/${month}/${year}`;

  // Assemble beautiful formatted text for copy paste to WhatsApp (no sales data)
  let text = `📅 *Relatório de Atendimento XP*\n_${formattedDate}_\n\n`;
  text += `📱 *Clientes Novos no Dia:* ${newCustomers.length}\n`;
  text += `🔄 *Clientes Recuperados no Dia:* ${recoveredCustomers.length}\n\n`;
  text += `💬 *Resumo de Mensagens:*\n`;
  text += `📱 Enviadas: ${totalSent.toLocaleString("pt-BR")}\n`;
  text += `🧾 Recebidas: ${totalReceived.toLocaleString("pt-BR")}\n\n`;
  text += `🏆 *Ranking de Vendedoras e Atendimentos:*\n\n`;

  agentsList.forEach((agent, index) => {
    const medals = ["🥇", "🥈", "🥉"];
    const emoji = index < 3 ? medals[index] : "❤️";
    text += `${emoji} *${agent.agentName}*\n`;
    text += `💬 Mensagens Enviadas: ${agent.sentMessages.toLocaleString("pt-BR")}\n`;
    text += `📱 Atendimentos Particular: ${agent.privateChatsCount}\n`;
    text += `👥 Atendimentos em Grupo: ${agent.groupChatsCount}\n`;
    text += `✨ Conversas Iniciadas: ${agent.initiatedCount}\n`;
    
    if (agent.attendedPrivateClients.length > 0 || agent.attendedGroupClients.length > 0) {
      text += `👥 *Clientes Atendidos:*\n`;
      // Particular
      agent.attendedPrivateClients.forEach(c => {
        const initiatedTag = c.initiated ? " _[Iniciada]_" : "";
        text += `* ${c.name} (Particular)${initiatedTag}\n`;
      });
      // Grupos
      agent.attendedGroupClients.forEach(g => {
        text += `* ${g.name} (Grupo)\n`;
      });
    }
    text += `\n`;
  });

  return {
    date: dateStr,
    newCustomersCount: newCustomers.length,
    recoveredCustomersCount: recoveredCustomers.length,
    totalMessagesSent: totalSent,
    totalMessagesReceived: totalReceived,
    totalTelasSold,
    totalOrders,
    totalRevenue,
    agents: agentsList,
    newCustomersList: newCustomers,
    recoveredCustomersList: recoveredCustomers,
    formattedText: text,
    averageFirstResponseSeconds,
  };
}

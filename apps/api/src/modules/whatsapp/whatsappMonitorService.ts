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
import { pool } from "../../db/client.js";
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
  const incomingFromMe = incomingPayload ? extractEvolutionFromMeFlag(incomingPayload as any) : null;
  // An activity is outbound if it was originally saved as WHATSAPP_SENT, or if the synced message is fromMe
  const isSent = row.activity_type === "WHATSAPP_SENT" || incomingFromMe === true;

  const metadata: Record<string, unknown> = {
    ...baseMetadata,
    ...(incomingMedia ? incomingMedia : {}),
    ...(incomingContact ? { contact: incomingContact } : {}),
    ...(isSent
      ? {
        fromMe: true,
        isOutbound: true,
        capturedFromWhatsapp: true,
        outboundSource: baseMetadata.outboundSource ?? (incomingFromMe === true ? "whatsapp_device" : "whatsapp_api"),
      }
      : incomingFromMe === false
        ? {
          fromMe: false,
          isOutbound: false,
          capturedFromWhatsapp: false,
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
  const [summaryResult, responseResult] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(DISTINCT d.id)::int AS total_conversations,
        COUNT(*) FILTER (WHERE da.activity_type = 'WHATSAPP_RECEIVED')::int AS received_messages,
        COUNT(*) FILTER (WHERE da.activity_type = 'WHATSAPP_SENT')::int AS sent_messages,
        COUNT(*) FILTER (
          WHERE da.metadata ? 'fileName'
            OR da.metadata ? 'filename'
            OR da.metadata ? 'mediaName'
            OR da.metadata ? 'mimetype'
            OR da.metadata ? 'mediaType'
        )::int AS media_messages,
        COUNT(*) FILTER (WHERE ${riskSql("da")})::int AS risk_events
      FROM deals d
      LEFT JOIN deal_activities da
        ON da.deal_id = d.id
        AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      WHERE ${whereSql}
      `,
      params,
    ),
    pool.query(
      `
      SELECT
        d.id AS deal_id,
        d.whatsapp_instance_id,
        COALESCE(wi.display_label, d.assigned_to_name, 'Sem agente') AS agent_name,
        wi.profile_picture_url,
        EXTRACT(EPOCH FROM (first_outbound.first_outbound_at - first_inbound.first_inbound_at)) / 60 AS response_minutes
      FROM deals d
      LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
      JOIN LATERAL (
        SELECT MIN(da.created_at) AS first_inbound_at
        FROM deal_activities da
        WHERE da.deal_id = d.id
          AND da.activity_type = 'WHATSAPP_RECEIVED'
      ) first_inbound ON first_inbound.first_inbound_at IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT MIN(da.created_at) AS first_outbound_at
        FROM deal_activities da
        WHERE da.deal_id = d.id
          AND da.activity_type = 'WHATSAPP_SENT'
          AND da.created_at > first_inbound.first_inbound_at
      ) first_outbound ON true
      WHERE ${whereSql}
      `,
      params,
    ),
  ]);

  const summary = summaryResult.rows[0] ?? {};
  const responseRows = responseResult.rows.map((row) => ({
    agentId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
    agentName: optionalString(row.agent_name) ?? "Sem agente",
    profilePictureUrl: optionalString(row.profile_picture_url),
    responseMinutes: row.response_minutes === null ? null : Number(row.response_minutes),
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
      totalConversations: Number(summary.total_conversations ?? 0),
      receivedMessages: Number(summary.received_messages ?? 0),
      sentMessages: Number(summary.sent_messages ?? 0),
      mediaMessages: Number(summary.media_messages ?? 0),
      riskEvents: Number(summary.risk_events ?? 0),
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
    monitorableWhatsappJidSql("COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)"),
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
        OR wi.assigned_user_id = $${userIdParamIndex}
        OR LOWER(COALESCE(wi.assigned_user_name, '')) = LOWER($${userNameParamIndex})
      )
    `);
  }

  const allInstances = await pool.query(`
    SELECT 
      wi.id as instance_id,
      wi.instance_name,
      wi.display_label,
      wi.phone_number,
      wi.profile_picture_url,
      u.id as user_id,
      u.name as user_name
    FROM whatsapp_instances wi
    LEFT JOIN users u ON u.id = wi.assigned_user_id
    WHERE wi.status = 'ACTIVE'
  `);

  const result = await pool.query(
    `
    SELECT
      COALESCE(u.id::text, 'instance:' || wi_base.id, 'instance:' || wi.id, 'sem-agente') AS agent_id,
      COALESCE(
        CASE 
          WHEN u.name IS NOT NULL AND COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) IS NOT NULL 
          THEN u.name || ' (' || COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) || ')'
          ELSE COALESCE(u.name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name)
        END,
        'Sem agente'
      ) AS agent_name,
      COALESCE(wi_base.instance_name, wi.instance_name) as instance_name,
      COALESCE(wi_base.display_label, wi.display_label) as display_label,
      COALESCE(wi_base.phone_number, wi.phone_number) as phone_number,
      COALESCE(wi_base.profile_picture_url, wi.profile_picture_url) as profile_picture_url,
      da.activity_type,
      da.actor_user_id::text AS actor_user_id,
      da.actor_name,
      da.content,
      da.metadata,
      da.created_at,
      COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid) AS remote_jid,
      COALESCE(NULLIF(da.metadata ->> 'chatDisplayName', ''), d.customer_display_name, d.title) AS chat_name,
      TO_CHAR(timezone('${ACTIVITY_REPORT_TIMEZONE}', da.created_at), 'YYYY-MM-DD') AS local_date,
      EXTRACT(HOUR FROM timezone('${ACTIVITY_REPORT_TIMEZONE}', da.created_at))::int AS local_hour
    FROM deal_activities da
    JOIN deals d ON d.id = da.deal_id
    LEFT JOIN whatsapp_instances wi_base ON (
      wi_base.id = d.whatsapp_instance_id 
      OR LOWER(wi_base.instance_name) = LOWER(COALESCE(da.metadata ->> 'instance', ''))
    )
    LEFT JOIN users u ON (
      u.id = da.actor_user_id 
      OR u.id = d.assigned_to
      OR u.id = wi_base.assigned_user_id
      OR LOWER(u.name) = LOWER(da.actor_name)
      OR LOWER(u.name) = LOWER(d.assigned_to_name)
      OR LOWER(u.name) = LOWER(wi_base.assigned_user_name)
    )
    LEFT JOIN LATERAL (
      SELECT wi_match.*
      FROM whatsapp_instances wi_match
      WHERE (wi_match.id = d.whatsapp_instance_id OR wi_match.assigned_user_id = u.id)
      ORDER BY
        CASE
          WHEN wi_match.id = d.whatsapp_instance_id THEN 0
          WHEN wi_match.assigned_user_id = u.id THEN 1
          ELSE 2
        END
      LIMIT 1
    ) wi ON true
    WHERE ${where.join("\n      AND ")}
    ORDER BY da.created_at ASC, da.id ASC
    `,
    params,
  );

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

  for (const row of result.rows) {
    const localDate = optionalString(row.local_date);
    const localHour = Number(row.local_hour);
    if (!localDate || !Number.isInteger(localHour)) {
      continue;
    }

    const remoteJid = optionalString(row.remote_jid);
    if (!remoteJid) {
      continue;
    }

    const isGroup = Boolean(remoteJid?.endsWith("@g.us"));
    const groupClass = classifyWhatsappGroup({
      isGroup,
      name: optionalString(row.chat_name),
    });
    const isOutbound = String(row.activity_type) === "WHATSAPP_SENT";
    const chatName = optionalString(row.chat_name);
    const agentId = String(row.agent_id ?? "sem-agente");
    const agentName = String(row.agent_name ?? "Sem agente");
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
          instanceName: optionalString(row.instance_name),
          displayLabel: optionalString(row.display_label),
          phoneNumber: optionalString(row.phone_number),
          profilePictureUrl: optionalString(row.profile_picture_url),
          accumulator: createActivityReportAccumulator(),
          activeHours: new Set<string>(),
          lastMessageAt: null,
        };

      current.agentName = agentName;
      current.instanceName ??= optionalString(row.instance_name);
      current.displayLabel ??= optionalString(row.display_label);
      current.phoneNumber ??= optionalString(row.phone_number);
      current.profilePictureUrl ??= optionalString(row.profile_picture_url);
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

  return {
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

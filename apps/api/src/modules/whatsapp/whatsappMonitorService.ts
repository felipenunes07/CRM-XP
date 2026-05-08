import type {
  DealActivity,
  DealPriority,
  WhatsappMonitorAgent,
  WhatsappMonitorConversation,
  WhatsappMonitorConversationDetail,
  WhatsappMonitorConversationsResponse,
  WhatsappMonitorMessage,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
import {
  computeWhatsappUnreadState,
  detectWhatsappMessageRisk,
  formatWhatsappJidPhone,
  mapWhatsappActivityToMessage,
} from "./whatsappMonitorCore.js";

interface ConversationFilters {
  instanceId?: string;
  search?: string;
}

function isoDate(value: unknown, fallback = new Date()) {
  return new Date(String(value ?? fallback.toISOString())).toISOString();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapAgentRow(row: Record<string, unknown>): WhatsappMonitorAgent {
  return {
    id: String(row.id),
    instanceName: String(row.instance_name),
    displayLabel: String(row.display_label),
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    status: String(row.status ?? "ACTIVE") as WhatsappMonitorAgent["status"],
    isDefault: Boolean(row.is_default),
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
  const title = String(row.title ?? row.customer_display_name ?? "Conversa sem nome");
  const contactName =
    optionalString(row.chat_display_name) ??
    (row.customer_display_name ? String(row.customer_display_name) : title);
  const markedUnread = Boolean(row.marked_unread);
  const unreadState = computeWhatsappUnreadState(Number(row.unread_after_read ?? 0), markedUnread);

  return {
    id: String(row.id),
    dealId: String(row.id),
    title,
    contactName,
    contactPhone: formatWhatsappJidPhone(remoteJid),
    remoteJid,
    isGroup: Boolean(remoteJid?.endsWith("@g.us")),
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
  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    activityType: String(row.activity_type) as DealActivity["activityType"],
    actorName: row.actor_name ? String(row.actor_name) : null,
    content: row.content ? String(row.content) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    createdAt: isoDate(row.created_at),
  };
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
  `;
}

function conversationBaseSelectSql(userIdParamIndex: number) {
  return `
    WITH latest_whatsapp AS (
      SELECT
        da.*,
        ROW_NUMBER() OVER (PARTITION BY da.deal_id ORDER BY da.created_at DESC) AS rn
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
      COALESCE(wi.display_label, d.assigned_to_name, latest_whatsapp.actor_name) AS agent_name,
      COALESCE(chat_profile.display_name, latest_whatsapp.metadata ->> 'chatDisplayName') AS chat_display_name,
      COALESCE(chat_profile.profile_picture_url, latest_whatsapp.metadata ->> 'chatProfilePictureUrl') AS profile_picture_url,
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

export async function listWhatsappMonitorAgents(): Promise<WhatsappMonitorAgent[]> {
  const result = await pool.query(`
    WITH message_stats AS (
      SELECT
        d.whatsapp_instance_id,
        COUNT(DISTINCT d.id)::int AS conversation_count,
        COUNT(*) FILTER (
          WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
            AND da.content IS NOT NULL
            AND (
              lower(da.content) LIKE '%porra%'
              OR lower(da.content) LIKE '%senha%'
              OR lower(da.content) LIKE '%pix%'
              OR lower(da.content) LIKE '%cpf%'
              OR lower(da.content) LIKE '%cartao%'
              OR lower(da.content) LIKE '%procon%'
            )
        )::int AS risk_count,
        MAX(da.created_at) AS last_message_at
      FROM deals d
      LEFT JOIN deal_activities da ON da.deal_id = d.id
      WHERE d.whatsapp_instance_id IS NOT NULL
      GROUP BY d.whatsapp_instance_id
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
    ORDER BY wi.is_default DESC, wi.display_label ASC
  `);

  return result.rows.map(mapAgentRow);
}

export async function listWhatsappMonitorConversations(
  user: JwtUser,
  filters: ConversationFilters = {},
): Promise<WhatsappMonitorConversationsResponse> {
  const params: unknown[] = [];
  const where: string[] = ["d.whatsapp_jid IS NOT NULL"];

  if (user.role === "SELLER") {
    params.push(user.name);
    where.push(`d.assigned_to_name = $${params.length}`);
  }

  if (filters.instanceId) {
    params.push(filters.instanceId);
    where.push(`
      (
        d.whatsapp_instance_id = $${params.length}
        OR EXISTS (
          SELECT 1
          FROM whatsapp_incoming_messages wim
          JOIN whatsapp_instances wif ON wif.instance_name = wim.instance_name
          WHERE wim.remote_jid = d.whatsapp_jid
            AND wif.id = $${params.length}
        )
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
        OR EXISTS (
          SELECT 1
          FROM whatsapp_chat_profiles wcpf
          WHERE wcpf.remote_jid = d.whatsapp_jid
            AND lower(COALESCE(wcpf.display_name, '')) LIKE $${params.length}
        )
      )
    `);
  }

  params.push(user.id);
  const userIdParamIndex = params.length;

  const [agents, conversationsResult] = await Promise.all([
    listWhatsappMonitorAgents(),
    pool.query(
      `
      ${conversationBaseSelectSql(userIdParamIndex)}
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(activity_stats.last_message_at, d.last_activity_at, d.created_at) DESC
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
  const conversationResult = await pool.query(
    `
    ${conversationBaseSelectSql(2)}
    WHERE d.id = $1
      AND d.whatsapp_jid IS NOT NULL
    LIMIT 1
    `,
    [dealId, user.id],
  );

  if (!conversationResult.rows[0]) {
    throw new HttpError(404, "Conversa de WhatsApp nao encontrada.");
  }

  const conversation = mapConversationRow(conversationResult.rows[0]);
  const activitiesResult = await pool.query(
    `
    SELECT *
    FROM deal_activities
    WHERE deal_id = $1
      AND activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
    ORDER BY created_at ASC
    LIMIT 300
    `,
    [dealId],
  );

  let messages = activitiesResult.rows.map((row) => mapWhatsappActivityToMessage(mapActivityRow(row)));

  if (!messages.length && conversation.remoteJid) {
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
      ORDER BY wim.created_at ASC
      LIMIT 300
      `,
      [conversation.remoteJid],
    );

    messages = incomingResult.rows.map((row): WhatsappMonitorMessage => {
      const content = String(row.message_text ?? "");
      const metadata =
        row.raw_payload && typeof row.raw_payload === "object" ? (row.raw_payload as Record<string, unknown>) : {};

      return {
        id: String(row.id),
        dealId,
        direction: row.from_me ? "OUTBOUND" : "INBOUND",
        senderName: row.sender_display_name ? String(row.sender_display_name) : conversation.contactName,
        senderJid: row.participant_jid ? String(row.participant_jid) : null,
        senderProfilePictureUrl: row.participant_profile_picture_url ? String(row.participant_profile_picture_url) : null,
        content,
        createdAt: isoDate(row.created_at),
        remoteJid: String(row.remote_jid),
        isGroup: conversation.isGroup,
        metadata,
        risk: detectWhatsappMessageRisk(content),
      };
    });
  }

  return {
    ...conversation,
    messages,
  };
}

export async function setWhatsappConversationReadState(
  dealId: string,
  user: JwtUser,
  unread: boolean,
): Promise<WhatsappMonitorConversationDetail> {
  const existing = await pool.query("SELECT id FROM deals WHERE id = $1 AND whatsapp_jid IS NOT NULL", [dealId]);
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

  return getWhatsappMonitorConversation(dealId, user);
}

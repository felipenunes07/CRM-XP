import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

const ACTIVITY_REPORT_TIMEZONE = "America/Sao_Paulo";
const ACTIVITY_ROLLUP_LOCK_ID = 2026060202;

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

function boundedRefreshDays(daysInput?: number) {
  return Math.max(2, Math.min(120, Math.floor(daysInput ?? env.WHATSAPP_ACTIVITY_ROLLUP_REFRESH_DAYS) || 70));
}

function buildRefreshWindow(daysInput?: number) {
  const days = boundedRefreshDays(daysInput);
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - (days - 1));
  return {
    days,
    startDate: localDateKey(start),
    endDate: localDateKey(today),
  };
}

export async function refreshWhatsappActivityRollups(daysInput?: number) {
  const window = buildRefreshWindow(daysInput);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '5s'`);
    await client.query(`SET LOCAL statement_timeout = '${env.WHATSAPP_ACTIVITY_ROLLUP_STATEMENT_TIMEOUT_MS}ms'`);

    const lockResult = await client.query(
      "SELECT pg_try_advisory_xact_lock($1) AS locked",
      [ACTIVITY_ROLLUP_LOCK_ID],
    );
    if (!lockResult.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return {
        refreshed: false,
        reason: "locked",
        deleted: 0,
        inserted: 0,
        ...window,
      };
    }

    const deleteResult = await client.query(
      `
      DELETE FROM whatsapp_activity_rollups
      WHERE period_date >= $1::date
        AND period_date <= $2::date
      `,
      [window.startDate, window.endDate],
    );

    const insertResult = await client.query(
      `
      INSERT INTO whatsapp_activity_rollups (
        period_date,
        hour,
        agent_id,
        agent_name,
        instance_name,
        display_label,
        phone_number,
        profile_picture_url,
        remote_jid,
        chat_name,
        sent_messages,
        received_messages,
        response_count,
        response_seconds_total,
        last_message_at,
        updated_at
      )
      WITH clean_instances AS (
        SELECT *,
          regexp_replace(phone_number, '\\D', '', 'g') AS clean_phone
        FROM whatsapp_instances
        WHERE phone_number IS NOT NULL
      ),
      monitor_messages AS (
        SELECT
          0 AS source_priority,
          wmm.id::text AS source_id,
          wmm.deal_id,
          COALESCE(NULLIF(wmm.message_id, ''), wmm.id::text) AS message_key,
          CASE
            WHEN COALESCE(wmm.from_me, false) OR UPPER(COALESCE(wmm.direction, '')) = 'OUTBOUND'
              THEN 'WHATSAPP_SENT'
            ELSE 'WHATSAPP_RECEIVED'
          END AS activity_type,
          wmm.created_at,
          COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', '')) AS remote_jid,
          COALESCE(NULLIF(wmm.instance_name, ''), NULLIF(wmm.media_json ->> 'instance', '')) AS instance_name,
          NULLIF(wmm.sender_name, '') AS sender_name,
          NULLIF(wmm.sender_jid, '') AS sender_jid,
          NULLIF(wmm.sender_pic_url, '') AS sender_profile_picture_url,
          NULLIF(wmm.media_json ->> 'chatDisplayName', '') AS chat_display_name,
          NULLIF(wmm.media_json ->> 'chatProfilePictureUrl', '') AS chat_profile_picture_url,
          wmm.content,
          COALESCE(wmm.media_json, '{}'::jsonb) AS metadata
        FROM whatsapp_monitor_messages wmm
        WHERE wmm.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND wmm.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
      ),
      activity_messages AS (
        SELECT
          1 AS source_priority,
          da.id::text AS source_id,
          da.deal_id,
          COALESCE(NULLIF(da.metadata ->> 'messageId', ''), NULLIF(da.metadata ->> 'providerMessageId', ''), da.id::text) AS message_key,
          da.activity_type,
          da.created_at,
          NULLIF(da.metadata ->> 'remoteJid', '') AS remote_jid,
          NULLIF(da.metadata ->> 'instance', '') AS instance_name,
          NULLIF(COALESCE(da.metadata ->> 'senderName', da.actor_name), '') AS sender_name,
          NULLIF(da.metadata ->> 'senderJid', '') AS sender_jid,
          NULLIF(da.metadata ->> 'senderProfilePictureUrl', '') AS sender_profile_picture_url,
          NULLIF(da.metadata ->> 'chatDisplayName', '') AS chat_display_name,
          NULLIF(da.metadata ->> 'chatProfilePictureUrl', '') AS chat_profile_picture_url,
          da.content,
          COALESCE(da.metadata, '{}'::jsonb) AS metadata
        FROM deal_activities da
        WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND da.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND da.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
      ),
      source_messages AS (
        SELECT * FROM monitor_messages
        UNION ALL
        SELECT * FROM activity_messages
      ),
      deduped_source AS (
        SELECT *,
          regexp_replace(sender_jid, '\\D', '', 'g') AS clean_sender_jid
        FROM (
          SELECT
            source_messages.*,
            ROW_NUMBER() OVER (
              PARTITION BY deal_id, message_key
              ORDER BY source_priority ASC, created_at ASC, source_id ASC
            ) AS source_rank
          FROM source_messages
        ) ranked_source
        WHERE source_rank = 1
      ),
      event_rows AS (
        SELECT
          src.source_id AS id,
          COALESCE(u.id::text, 'instance:' || wi_sender.id, 'instance:' || wi_base.id, 'instance:' || wi.id, 'sem-agente') AS agent_id,
          COALESCE(
            CASE
              WHEN u.name IS NOT NULL AND COALESCE(wi_sender.display_label, wi_sender.instance_name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) IS NOT NULL
                THEN u.name || ' (' || COALESCE(wi_sender.display_label, wi_sender.instance_name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) || ')'
              ELSE COALESCE(u.name, wi_sender.display_label, wi_sender.instance_name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name)
            END,
            'Sem agente'
          ) AS agent_name,
          COALESCE(wi_sender.instance_name, wi_base.instance_name, wi.instance_name) AS instance_name,
          COALESCE(wi_sender.display_label, wi_base.display_label, wi.display_label) AS display_label,
          COALESCE(wi_sender.phone_number, wi_base.phone_number, wi.phone_number) AS phone_number,
          COALESCE(wi_sender.profile_picture_url, wi_base.profile_picture_url, wi.profile_picture_url) AS profile_picture_url,
          src.activity_type,
          src.created_at,
          COALESCE(src.remote_jid, d.whatsapp_jid) AS remote_jid,
          COALESCE(src.chat_display_name, d.customer_display_name, d.title) AS chat_name,
          TO_CHAR(timezone('${ACTIVITY_REPORT_TIMEZONE}', src.created_at), 'YYYY-MM-DD') AS local_date,
          EXTRACT(HOUR FROM timezone('${ACTIVITY_REPORT_TIMEZONE}', src.created_at))::int AS local_hour
        FROM deduped_source src
        JOIN deals d ON d.id = src.deal_id
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM whatsapp_instances wi_match
          WHERE wi_match.id = d.whatsapp_instance_id
            OR LOWER(wi_match.instance_name) = LOWER(COALESCE(src.instance_name, ''))
          ORDER BY
            CASE
              WHEN wi_match.id = d.whatsapp_instance_id THEN 0
              ELSE 1
            END
          LIMIT 1
        ) wi_base ON true
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM clean_instances wi_match
          WHERE src.activity_type = 'WHATSAPP_SENT'
            AND src.sender_jid IS NOT NULL
            AND LENGTH(src.clean_sender_jid) >= 10
            AND LENGTH(wi_match.clean_phone) >= 10
            AND (
              RIGHT(src.clean_sender_jid, 11) = RIGHT(wi_match.clean_phone, 11)
              OR RIGHT(src.clean_sender_jid, 10) = RIGHT(wi_match.clean_phone, 10)
            )
          ORDER BY
            CASE WHEN wi_match.status = 'ACTIVE' THEN 0 ELSE 1 END,
            wi_match.updated_at DESC
          LIMIT 1
        ) wi_sender ON true
        LEFT JOIN LATERAL (
          SELECT user_match.*
          FROM users user_match
          WHERE user_match.id = wi_sender.assigned_user_id
            OR user_match.id = d.assigned_to
            OR user_match.id = wi_base.assigned_user_id
            OR (
              src.activity_type = 'WHATSAPP_SENT'
              AND LOWER(user_match.name) = LOWER(src.sender_name)
            )
            OR LOWER(user_match.name) = LOWER(d.assigned_to_name)
            OR LOWER(user_match.name) = LOWER(wi_sender.assigned_user_name)
            OR LOWER(user_match.name) = LOWER(wi_base.assigned_user_name)
          ORDER BY
            CASE
              WHEN user_match.id = wi_sender.assigned_user_id THEN 0
              WHEN user_match.id = d.assigned_to THEN 1
              WHEN user_match.id = wi_base.assigned_user_id THEN 2
              ELSE 3
            END
          LIMIT 1
        ) u ON true
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM whatsapp_instances wi_match
          WHERE wi_match.id = d.whatsapp_instance_id
            OR wi_match.id = wi_sender.id
            OR wi_match.assigned_user_id = u.id
          ORDER BY
            CASE
              WHEN wi_match.id = d.whatsapp_instance_id THEN 0
              WHEN wi_match.id = wi_sender.id THEN 1
              WHEN wi_match.assigned_user_id = u.id THEN 2
              ELSE 2
            END
          LIMIT 1
        ) wi ON true
        WHERE COALESCE(src.remote_jid, d.whatsapp_jid) IS NOT NULL
          AND LOWER(COALESCE(src.remote_jid, d.whatsapp_jid)) <> 'status@broadcast'
          AND LOWER(COALESCE(src.remote_jid, d.whatsapp_jid)) NOT LIKE '%@broadcast'
      ),
      sequenced AS (
        SELECT
          event_rows.*,
          MAX(created_at) FILTER (WHERE activity_type = 'WHATSAPP_RECEIVED') OVER (
            PARTITION BY agent_id, remote_jid
            ORDER BY created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS last_inbound_at,
          MAX(created_at) FILTER (WHERE activity_type = 'WHATSAPP_SENT') OVER (
            PARTITION BY agent_id, remote_jid
            ORDER BY created_at, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS last_outbound_at
        FROM event_rows
      )
      SELECT
        local_date::date AS period_date,
        local_hour AS hour,
        agent_id,
        MAX(agent_name) AS agent_name,
        MAX(instance_name) AS instance_name,
        MAX(display_label) AS display_label,
        MAX(phone_number) AS phone_number,
        MAX(profile_picture_url) AS profile_picture_url,
        remote_jid,
        MAX(chat_name) AS chat_name,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_SENT')::int AS sent_messages,
        COUNT(*) FILTER (WHERE activity_type = 'WHATSAPP_RECEIVED')::int AS received_messages,
        COUNT(*) FILTER (
          WHERE activity_type = 'WHATSAPP_SENT'
            AND last_inbound_at IS NOT NULL
            AND (last_outbound_at IS NULL OR last_inbound_at > last_outbound_at)
        )::int AS response_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (created_at - last_inbound_at))) FILTER (
          WHERE activity_type = 'WHATSAPP_SENT'
            AND last_inbound_at IS NOT NULL
            AND (last_outbound_at IS NULL OR last_inbound_at > last_outbound_at)
        ), 0)::double precision AS response_seconds_total,
        MAX(created_at) AS last_message_at,
        NOW() AS updated_at
      FROM sequenced
      GROUP BY
        local_date,
        local_hour,
        agent_id,
        remote_jid
      `,
      [window.startDate, window.endDate],
    );

    await client.query("COMMIT");

    const result = {
      refreshed: true,
      deleted: deleteResult.rowCount ?? 0,
      inserted: insertResult.rowCount ?? 0,
      ...window,
    };
    logger.info("whatsapp activity rollups refreshed", result);
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("failed to refresh whatsapp activity rollups", {
      error: error instanceof Error ? error.message : String(error),
      ...window,
    });
    throw error;
  } finally {
    client.release();
  }
}

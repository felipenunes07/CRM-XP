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

    // O filtro da janela compara created_at em UTC, mas period_date sai do fuso
    // America/Sao_Paulo — linhas na borda caem 1 dia fora da janela deletada
    // acima, então o upsert é obrigatório para não violar a PK e abortar tudo.
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
      WITH raw_monitor_rows AS (
        SELECT
          ('monitor:' || wmm.id::text) AS id,
          COALESCE(NULLIF(wmm.message_id, ''), wmm.id::text) AS message_key,
          0 AS source_priority,
          wmm.direction,
          wmm.created_at,
          wmm.instance_name AS wmm_instance_name,
          d.whatsapp_instance_id AS deal_instance_id,
          d.assigned_to AS deal_assigned_to,
          d.assigned_to_name AS deal_assigned_to_name,
          COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid) AS remote_jid,
          COALESCE(NULLIF(wmm.media_json ->> 'chatDisplayName', ''), d.customer_display_name, d.title) AS chat_name
        FROM whatsapp_monitor_messages wmm
        JOIN deals d ON d.id = wmm.deal_id
        WHERE wmm.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND wmm.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid) IS NOT NULL
          AND LOWER(COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid)) <> 'status@broadcast'
          AND LOWER(COALESCE(NULLIF(wmm.remote_jid, ''), NULLIF(wmm.media_json ->> 'remoteJid', ''), d.whatsapp_jid)) NOT LIKE '%@broadcast'
      ),
      raw_activity_rows AS (
        SELECT
          ('activity:' || da.id::text) AS id,
          COALESCE(NULLIF(da.metadata ->> 'messageId', ''), NULLIF(da.metadata ->> 'providerMessageId', ''), da.id::text) AS message_key,
          1 AS source_priority,
          da.activity_type,
          da.created_at,
          da.actor_user_id AS da_actor_user_id,
          da.actor_name AS da_actor_name,
          da.metadata ->> 'instance' AS da_instance_name,
          d.whatsapp_instance_id AS deal_instance_id,
          d.assigned_to AS deal_assigned_to,
          d.assigned_to_name AS deal_assigned_to_name,
          COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid) AS remote_jid,
          COALESCE(NULLIF(da.metadata ->> 'chatDisplayName', ''), d.customer_display_name, d.title) AS chat_name
        FROM deal_activities da
        JOIN deals d ON d.id = da.deal_id
        WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
          AND da.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND da.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid) IS NOT NULL
          AND LOWER(COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)) <> 'status@broadcast'
          AND LOWER(COALESCE(da.metadata ->> 'remoteJid', d.whatsapp_jid)) NOT LIKE '%@broadcast'
      ),
      deduped_raw AS (
        SELECT *
        FROM (
          SELECT
            unioned.*,
            ROW_NUMBER() OVER (
              PARTITION BY unioned.remote_jid, unioned.message_key
              ORDER BY unioned.source_priority ASC, unioned.created_at ASC, unioned.id ASC
            ) AS row_rank
          FROM (
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              wmm_instance_name, NULL AS da_instance_name,
              NULL::uuid AS da_actor_user_id, NULL AS da_actor_name,
              CASE WHEN direction = 'OUTBOUND' THEN 'WHATSAPP_SENT' ELSE 'WHATSAPP_RECEIVED' END AS activity_type
            FROM raw_monitor_rows
            UNION ALL
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              NULL AS wmm_instance_name, da_instance_name,
              da_actor_user_id, da_actor_name,
              activity_type
            FROM raw_activity_rows
          ) unioned
        ) ranked
        WHERE row_rank = 1
      ),
      joined_rows AS (
        SELECT
          dr_inner.id,
          dr_inner.message_key,
          dr_inner.activity_type,
          dr_inner.created_at,
          dr_inner.remote_jid,
          dr_inner.chat_name,
          TO_CHAR(timezone('${ACTIVITY_REPORT_TIMEZONE}', dr_inner.created_at), 'YYYY-MM-DD') AS local_date,
          EXTRACT(HOUR FROM timezone('${ACTIVITY_REPORT_TIMEZONE}', dr_inner.created_at))::int AS local_hour,
          COALESCE(u.id::text, 'instance:' || wi_base.id, 'instance:' || wi.id, 'sem-agente') AS agent_id,
          COALESCE(
            CASE
              WHEN u.name IS NOT NULL AND COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) IS NOT NULL
                THEN u.name || ' (' || COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) || ')'
              ELSE COALESCE(u.name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name)
            END,
            'Sem agente'
          ) AS agent_name,
          COALESCE(wi_base.instance_name, wi.instance_name) AS instance_name,
          COALESCE(wi_base.display_label, wi.display_label) AS display_label,
          COALESCE(wi_base.phone_number, wi.phone_number) AS phone_number,
          COALESCE(wi_base.profile_picture_url, wi.profile_picture_url) AS profile_picture_url
        FROM deduped_raw dr_inner
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM whatsapp_instances wi_match
          WHERE wi_match.id = dr_inner.deal_instance_id
            OR LOWER(wi_match.instance_name) = LOWER(COALESCE(dr_inner.wmm_instance_name, dr_inner.da_instance_name, ''))
          ORDER BY
            CASE
              WHEN wi_match.id = dr_inner.deal_instance_id THEN 0
              ELSE 1
            END
          LIMIT 1
        ) wi_base ON true
        LEFT JOIN LATERAL (
          SELECT user_match.*
          FROM users user_match
          WHERE user_match.id = dr_inner.da_actor_user_id
            OR user_match.id = dr_inner.deal_assigned_to
            OR user_match.id = wi_base.assigned_user_id
            OR LOWER(user_match.name) = LOWER(COALESCE(dr_inner.da_actor_name, ''))
            OR LOWER(user_match.name) = LOWER(COALESCE(dr_inner.deal_assigned_to_name, ''))
            OR LOWER(user_match.name) = LOWER(COALESCE(wi_base.assigned_user_name, ''))
          ORDER BY
            CASE
              WHEN user_match.id = dr_inner.da_actor_user_id THEN 0
              WHEN user_match.id = dr_inner.deal_assigned_to THEN 1
              WHEN user_match.id = wi_base.assigned_user_id THEN 2
              ELSE 3
            END
          LIMIT 1
        ) u ON true
        LEFT JOIN LATERAL (
          SELECT wi_match.*
          FROM whatsapp_instances wi_match
          WHERE wi_match.id = dr_inner.deal_instance_id
            OR wi_match.assigned_user_id = u.id
          ORDER BY
            CASE
              WHEN wi_match.id = dr_inner.deal_instance_id THEN 0
              WHEN wi_match.assigned_user_id = u.id THEN 1
              ELSE 2
            END
          LIMIT 1
        ) wi ON true
      ),
      sequenced AS (
        SELECT
          joined_rows.*,
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
        FROM joined_rows
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
      ON CONFLICT (period_date, hour, agent_id, remote_jid) DO UPDATE SET
        agent_name = EXCLUDED.agent_name,
        instance_name = EXCLUDED.instance_name,
        display_label = EXCLUDED.display_label,
        phone_number = EXCLUDED.phone_number,
        profile_picture_url = EXCLUDED.profile_picture_url,
        chat_name = EXCLUDED.chat_name,
        sent_messages = EXCLUDED.sent_messages,
        received_messages = EXCLUDED.received_messages,
        response_count = EXCLUDED.response_count,
        response_seconds_total = EXCLUDED.response_seconds_total,
        last_message_at = EXCLUDED.last_message_at,
        updated_at = EXCLUDED.updated_at
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

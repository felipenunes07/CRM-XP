import { Pool } from "pg";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { internalChatExclusionSql } from "./whatsappMonitorService.js";

const ACTIVITY_REPORT_TIMEZONE = "America/Sao_Paulo";
const ACTIVITY_ROLLUP_LOCK_ID = 2026060202;

// Pool dedicado SEM query_timeout do node-pg. O pool padrão tem query_timeout=20s,
// que matava o rebuild do rollup (~30s) com "Query read timeout" ANTES do
// statement_timeout (90s) — por isso o heatmap de hoje ficava VAZIO. Aqui só o
// statement_timeout (SET LOCAL abaixo) governa o limite.
let rollupPool: Pool | null = null;
function getRollupPool() {
  if (!rollupPool) {
    rollupPool = new Pool({
      connectionString: env.DATABASE_URL,
      query_timeout: 0,
      statement_timeout: 0,
      max: 2,
      idleTimeoutMillis: 30_000,
    });
  }
  return rollupPool;
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
  const client = await getRollupPool().connect();

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
          wmm.from_me,
          wmm.sender_name AS wmm_sender_name,
          regexp_replace(split_part(COALESCE(wmm.sender_jid, ''), '@', 1), '\\D', '', 'g') AS wmm_sender_digits,
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
          -- Remetente time INTERNO (não-vendedora): conversa interna, não conta no heatmap
          -- (igual ao Resumo). Fonte: roster por número do n8n. Empty sender_jid -> mantém.
          AND regexp_replace(split_part(COALESCE(wmm.sender_jid, ''), '@', 1), '\\D', '', 'g') NOT IN (
            '5511911279702','132791866028208','5511915863088','5511916263525','5511930890128',
            '5511944538074','5511947879036','5511971086782','35013009666203','5511914898986',
            '5511978398236','5511964218475','5511976001044','5511915103835','5511958326930',
            '5511990224961','5511997431733','32624739369122','5511973422619','74810310824049',
            '3960597401743','128441684885669'
          )
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
      raw_incoming_rows AS (
        SELECT
          ('incoming:' || wim.id::text) AS id,
          COALESCE(NULLIF(wim.message_id, ''), wim.id::text) AS message_key,
          2 AS source_priority,
          CASE
            WHEN COALESCE(wim.from_me, false) THEN 'WHATSAPP_SENT'
            ELSE 'WHATSAPP_RECEIVED'
          END AS activity_type,
          wim.created_at,
          NULL::uuid AS da_actor_user_id,
          CASE
            WHEN COALESCE(wim.from_me, false)
              THEN COALESCE(NULLIF(wim.participant_name, ''), NULLIF(wim.sender_name, ''))
            ELSE NULL
          END AS da_actor_name,
          NULLIF(wim.instance_name, '') AS da_instance_name,
          NULL::uuid AS deal_instance_id,
          NULL::uuid AS deal_assigned_to,
          NULL::text AS deal_assigned_to_name,
          wim.remote_jid AS remote_jid,
          COALESCE(NULLIF(wim.chat_display_name, ''), NULLIF(wim.sender_name, '')) AS chat_name
        FROM whatsapp_incoming_messages wim
        WHERE wim.created_at >= ($1::date AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND wim.created_at < (($2::date + INTERVAL '1 day') AT TIME ZONE '${ACTIVITY_REPORT_TIMEZONE}')
          AND wim.remote_jid IS NOT NULL
          AND LOWER(wim.remote_jid) <> 'status@broadcast'
          AND LOWER(wim.remote_jid) NOT LIKE '%@broadcast'
      ),
      deduped_raw AS (
        SELECT *
        FROM (
          SELECT
            unioned.*,
            ROW_NUMBER() OVER (
              PARTITION BY unioned.remote_jid, unioned.message_key
              ORDER BY
                (CASE WHEN unioned.activity_type = 'WHATSAPP_SENT' THEN 0 ELSE 1 END),
                unioned.source_priority ASC, unioned.created_at ASC, unioned.id ASC
            ) AS row_rank
          FROM (
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              wmm_instance_name, NULL AS da_instance_name,
              NULL::uuid AS da_actor_user_id,
              -- ENVIADA é creditada à vendedora pelo NÚMERO do remetente (sender_jid),
              -- igual ao Resumo. Vendedora = só as 5 instâncias conectadas. Pega a msg de
              -- grupo com from_me=false (sender_jid traz o telefone real da vendedora).
              -- Internos já foram removidos no WHERE do raw_monitor_rows.
              CASE
                WHEN wmm_sender_digits IN ('5511998595698','226362308726972') THEN 'Amanda'
                WHEN wmm_sender_digits IN ('5511996435466','269603754213443') THEN 'Suelen'
                WHEN wmm_sender_digits IN ('5511951392256','268044697878703') THEN 'Tamires'
                WHEN wmm_sender_digits IN ('5511944705416','93755076042876') THEN 'Thais'
                WHEN wmm_sender_digits IN ('5511959502231','5511975501901','278971715473575','214997741375562') THEN 'Ragnar'
                WHEN COALESCE(from_me, false) OR UPPER(COALESCE(direction, '')) = 'OUTBOUND'
                  THEN NULLIF(wmm_sender_name, '')
                ELSE NULL
              END AS da_actor_name,
              CASE
                WHEN COALESCE(from_me, false) OR UPPER(COALESCE(direction, '')) = 'OUTBOUND'
                  OR wmm_sender_digits IN (
                    '5511998595698','226362308726972','5511996435466','269603754213443',
                    '5511951392256','268044697878703','5511944705416','93755076042876',
                    '5511959502231','5511975501901','278971715473575','214997741375562'
                  )
                  -- Fallback por nome SÓ quando o sender_jid veio vazio (igual ao Resumo),
                  -- pra não classificar como ENVIADA por nome quando o número já decidiu.
                  OR (COALESCE(wmm_sender_digits, '') = '' AND EXISTS (
                    SELECT 1 FROM whatsapp_instances si2
                    WHERE NULLIF(wmm_sender_name, '') IS NOT NULL
                      AND LOWER(regexp_replace(COALESCE(wmm_sender_name, ''), '^xp\\s+', '', 'i')) IN (
                        LOWER(regexp_replace(COALESCE(si2.instance_name, ''), '^xp\\s+', '', 'i')),
                        LOWER(regexp_replace(COALESCE(si2.display_label, ''), '^xp\\s+', '', 'i')),
                        LOWER(regexp_replace(COALESCE(si2.assigned_user_name, ''), '^xp\\s+', '', 'i'))
                      )
                  ))
                  THEN 'WHATSAPP_SENT'
                ELSE 'WHATSAPP_RECEIVED'
              END AS activity_type
            FROM raw_monitor_rows
            UNION ALL
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              NULL AS wmm_instance_name, da_instance_name,
              da_actor_user_id, da_actor_name,
              activity_type
            FROM raw_activity_rows
            UNION ALL
            SELECT
              id, message_key, source_priority, created_at, remote_jid, chat_name,
              deal_instance_id, deal_assigned_to, deal_assigned_to_name,
              NULL AS wmm_instance_name, da_instance_name,
              da_actor_user_id, da_actor_name,
              activity_type
            FROM raw_incoming_rows
          ) unioned
        ) ranked
        -- Exclui os MESMOS chats internos que o Resumo (jids/telefones/nomes da equipe),
        -- via fonte única internalChatExclusionSql. Sem isto o heatmap inflaria (ex.:
        -- vendedora mandando em grupo interno entraria só no heatmap). Medido 19/06:
        -- Amanda 73->48, Thais 31->14, batendo com o Resumo.
        WHERE row_rank = 1
          AND NOT ${internalChatExclusionSql("remote_jid", "chat_name")}
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
          -- sender_inst (remetente real da ENVIADA) tem prioridade sobre dono/instância do deal.
          COALESCE('instance:' || sender_inst.id, u.id::text, 'instance:' || wi_base.id, 'instance:' || wi.id, 'sem-agente') AS agent_id,
          COALESCE(
            sender_inst.display_label,
            sender_inst.instance_name,
            CASE
              WHEN u.name IS NOT NULL AND COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) IS NOT NULL
                THEN u.name || ' (' || COALESCE(wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name) || ')'
              ELSE COALESCE(u.name, wi_base.display_label, wi_base.instance_name, wi.display_label, wi.instance_name)
            END,
            'Sem agente'
          ) AS agent_name,
          COALESCE(sender_inst.instance_name, wi_base.instance_name, wi.instance_name) AS instance_name,
          COALESCE(sender_inst.display_label, wi_base.display_label, wi.display_label) AS display_label,
          COALESCE(sender_inst.phone_number, wi_base.phone_number, wi.phone_number) AS phone_number,
          COALESCE(sender_inst.profile_picture_url, wi_base.profile_picture_url, wi.profile_picture_url) AS profile_picture_url
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
        -- Instância do REMETENTE real (só p/ ENVIADA): casa o sender_name com a
        -- instância da equipe por instance_name/display_label (com "xp " removido).
        -- Tem prioridade na atribuição, pra mensagem de grupo ser creditada a quem
        -- enviou — igual o Resumo Diário faz.
        LEFT JOIN LATERAL (
          SELECT si.*
          FROM whatsapp_instances si
          WHERE dr_inner.activity_type = 'WHATSAPP_SENT'
            AND NULLIF(dr_inner.da_actor_name, '') IS NOT NULL
            AND (
              LOWER(si.instance_name) = LOWER(dr_inner.da_actor_name)
              OR LOWER(COALESCE(si.display_label, '')) = LOWER(dr_inner.da_actor_name)
              OR LOWER(COALESCE(si.assigned_user_name, '')) = LOWER(dr_inner.da_actor_name)
              OR LOWER(regexp_replace(si.instance_name, '^xp\\s+', '', 'i'))
                 = LOWER(regexp_replace(dr_inner.da_actor_name, '^xp\\s+', '', 'i'))
              OR LOWER(regexp_replace(COALESCE(si.display_label, ''), '^xp\\s+', '', 'i'))
                 = LOWER(regexp_replace(dr_inner.da_actor_name, '^xp\\s+', '', 'i'))
            )
          LIMIT 1
        ) sender_inst ON true
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

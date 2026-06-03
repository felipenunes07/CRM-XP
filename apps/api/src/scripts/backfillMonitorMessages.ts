import { pool, redis } from "../db/client.js";
import { logger } from "../lib/logger.js";

async function main() {
  logger.info("Starting optimized whatsapp monitor messages backfill...");

  // 1. Backfill from deal_activities
  logger.info("Backfilling from deal_activities...");
  const activitiesResult = await pool.query(`
    WITH raw_activities AS (
      SELECT
        da.deal_id,
        SUBSTRING(COALESCE(da.metadata ->> 'messageId', da.metadata ->> 'providerMessageId', da.id::text) FROM 1 FOR 200) AS message_id,
        d.whatsapp_jid AS remote_jid,
        COALESCE(wi.instance_name, da.metadata ->> 'instance') AS instance_name,
        CASE 
          WHEN COALESCE((da.metadata ->> 'fromMe')::boolean, (da.metadata ->> 'isOutbound')::boolean, (da.metadata ->> 'capturedFromWhatsapp')::boolean, (da.metadata ->> 'sentFromMonitor')::boolean) = true THEN 'OUTBOUND'
          WHEN da.activity_type = 'WHATSAPP_SENT' THEN 'OUTBOUND'
          ELSE 'INBOUND'
        END AS direction,
        CASE 
          WHEN COALESCE((da.metadata ->> 'fromMe')::boolean, (da.metadata ->> 'isOutbound')::boolean, (da.metadata ->> 'capturedFromWhatsapp')::boolean, (da.metadata ->> 'sentFromMonitor')::boolean) = true THEN true
          WHEN da.activity_type = 'WHATSAPP_SENT' THEN true
          ELSE false
        END AS from_me,
        COALESCE(da.metadata ->> 'senderName', da.actor_name) AS sender_name,
        da.metadata ->> 'senderJid' AS sender_jid,
        COALESCE(da.metadata ->> 'senderProfilePictureUrl', wpp.profile_picture_url) AS sender_pic_url,
        da.content AS content,
        da.metadata AS media_json,
        'activity' AS source,
        da.created_at AS created_at
      FROM deal_activities da
      JOIN deals d ON d.id = da.deal_id
      LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
      LEFT JOIN LATERAL (
        SELECT wpp_inner.profile_picture_url
        FROM whatsapp_participant_profiles wpp_inner
        WHERE wpp_inner.participant_jid = da.metadata ->> 'senderJid'
          AND (wpp_inner.instance_name = COALESCE(da.metadata ->> 'instance', '') OR wpp_inner.instance_name = '')
        ORDER BY
          CASE WHEN wpp_inner.instance_name = COALESCE(da.metadata ->> 'instance', '') THEN 0 ELSE 1 END,
          wpp_inner.updated_at DESC
        LIMIT 1
      ) wpp ON true
      WHERE da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND da.created_at >= NOW() - INTERVAL '90 days'
    ),
    deduped_activities AS (
      SELECT DISTINCT ON (deal_id, message_id) *
      FROM raw_activities
      ORDER BY deal_id, message_id, created_at DESC
    )
    INSERT INTO whatsapp_monitor_messages (
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    )
    SELECT 
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    FROM deduped_activities
    ON CONFLICT (deal_id, message_id, source) DO UPDATE SET
      content        = EXCLUDED.content,
      sender_name    = COALESCE(EXCLUDED.sender_name, whatsapp_monitor_messages.sender_name),
      sender_pic_url = COALESCE(EXCLUDED.sender_pic_url, whatsapp_monitor_messages.sender_pic_url),
      media_json     = COALESCE(EXCLUDED.media_json, whatsapp_monitor_messages.media_json),
      from_me        = EXCLUDED.from_me
  `);
  logger.info(`Completed activities backfill: ${activitiesResult.rowCount} rows processed/inserted.`);

  // 2. Backfill from whatsapp_incoming_messages (Direct remote_jid matches)
  logger.info("Backfilling from whatsapp_incoming_messages (remote_jid)...");
  const incomingRemoteResult = await pool.query(`
    WITH raw_incoming_remote AS (
      SELECT
        d.id AS deal_id,
        SUBSTRING(wim.message_id FROM 1 FOR 200) AS message_id,
        d.whatsapp_jid AS remote_jid,
        wim.instance_name AS instance_name,
        CASE WHEN COALESCE(wim.from_me, false) THEN 'OUTBOUND' ELSE 'INBOUND' END AS direction,
        COALESCE(wim.from_me, false) AS from_me,
        COALESCE(wpp.display_name, wim.participant_name, wim.sender_name) AS sender_name,
        wim.participant_jid AS sender_jid,
        COALESCE(wpp.profile_picture_url, wim.sender_profile_picture_url) AS sender_pic_url,
        COALESCE(wim.message_text, '') AS content,
        wim.raw_payload AS media_json,
        'incoming' AS source,
        wim.created_at AS created_at
      FROM whatsapp_incoming_messages wim
      JOIN deals d ON d.whatsapp_jid = wim.remote_jid
      LEFT JOIN LATERAL (
        SELECT wpp_inner.display_name, wpp_inner.profile_picture_url
        FROM whatsapp_participant_profiles wpp_inner
        WHERE wpp_inner.participant_jid = wim.participant_jid
          AND (wpp_inner.instance_name = COALESCE(wim.instance_name, '') OR wpp_inner.instance_name = '')
        ORDER BY
          CASE WHEN wpp_inner.instance_name = COALESCE(wim.instance_name, '') THEN 0 ELSE 1 END,
          wpp_inner.updated_at DESC
        LIMIT 1
      ) wpp ON true
      WHERE wim.created_at >= NOW() - INTERVAL '90 days'
    ),
    deduped_incoming_remote AS (
      SELECT DISTINCT ON (deal_id, message_id) *
      FROM raw_incoming_remote
      ORDER BY deal_id, message_id, created_at DESC
    )
    INSERT INTO whatsapp_monitor_messages (
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    )
    SELECT 
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    FROM deduped_incoming_remote
    ON CONFLICT (deal_id, message_id, source) DO UPDATE SET
      content        = EXCLUDED.content,
      sender_name    = COALESCE(EXCLUDED.sender_name, whatsapp_monitor_messages.sender_name),
      sender_pic_url = COALESCE(EXCLUDED.sender_pic_url, whatsapp_monitor_messages.sender_pic_url),
      media_json     = COALESCE(EXCLUDED.media_json, whatsapp_monitor_messages.media_json),
      from_me        = EXCLUDED.from_me
  `);
  logger.info(`Completed incoming remote matches: ${incomingRemoteResult.rowCount} rows processed/inserted.`);

  // 3. Backfill from whatsapp_incoming_messages (Direct participant_jid matches)
  logger.info("Backfilling from whatsapp_incoming_messages (participant_jid)...");
  const incomingParticipantResult = await pool.query(`
    WITH raw_incoming_participant AS (
      SELECT
        d.id AS deal_id,
        SUBSTRING(wim.message_id FROM 1 FOR 200) AS message_id,
        d.whatsapp_jid AS remote_jid,
        wim.instance_name AS instance_name,
        CASE WHEN COALESCE(wim.from_me, false) THEN 'OUTBOUND' ELSE 'INBOUND' END AS direction,
        COALESCE(wim.from_me, false) AS from_me,
        COALESCE(wpp.display_name, wim.participant_name, wim.sender_name) AS sender_name,
        wim.participant_jid AS sender_jid,
        COALESCE(wpp.profile_picture_url, wim.sender_profile_picture_url) AS sender_pic_url,
        COALESCE(wim.message_text, '') AS content,
        wim.raw_payload AS media_json,
        'incoming' AS source,
        wim.created_at AS created_at
      FROM whatsapp_incoming_messages wim
      JOIN deals d ON d.whatsapp_jid = wim.participant_jid
      LEFT JOIN LATERAL (
        SELECT wpp_inner.display_name, wpp_inner.profile_picture_url
        FROM whatsapp_participant_profiles wpp_inner
        WHERE wpp_inner.participant_jid = wim.participant_jid
          AND (wpp_inner.instance_name = COALESCE(wim.instance_name, '') OR wpp_inner.instance_name = '')
        ORDER BY
          CASE WHEN wpp_inner.instance_name = COALESCE(wim.instance_name, '') THEN 0 ELSE 1 END,
          wpp_inner.updated_at DESC
        LIMIT 1
      ) wpp ON true
      WHERE wim.created_at >= NOW() - INTERVAL '90 days'
    ),
    deduped_incoming_participant AS (
      SELECT DISTINCT ON (deal_id, message_id) *
      FROM raw_incoming_participant
      ORDER BY deal_id, message_id, created_at DESC
    )
    INSERT INTO whatsapp_monitor_messages (
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    )
    SELECT 
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    FROM deduped_incoming_participant
    ON CONFLICT (deal_id, message_id, source) DO UPDATE SET
      content        = EXCLUDED.content,
      sender_name    = COALESCE(EXCLUDED.sender_name, whatsapp_monitor_messages.sender_name),
      sender_pic_url = COALESCE(EXCLUDED.sender_pic_url, whatsapp_monitor_messages.sender_pic_url),
      media_json     = COALESCE(EXCLUDED.media_json, whatsapp_monitor_messages.media_json),
      from_me        = EXCLUDED.from_me
  `);
  logger.info(`Completed incoming participant matches: ${incomingParticipantResult.rowCount} rows processed/inserted.`);

  // 4. Backfill from whatsapp_incoming_messages (Alias matches)
  logger.info("Backfilling from whatsapp_incoming_messages (alias matches)...");
  const incomingAliasResult = await pool.query(`
    WITH raw_incoming_alias AS (
      SELECT
        d.id AS deal_id,
        SUBSTRING(wim.message_id FROM 1 FOR 200) AS message_id,
        d.whatsapp_jid AS remote_jid,
        wim.instance_name AS instance_name,
        CASE WHEN COALESCE(wim.from_me, false) THEN 'OUTBOUND' ELSE 'INBOUND' END AS direction,
        COALESCE(wim.from_me, false) AS from_me,
        COALESCE(wpp.display_name, wim.participant_name, wim.sender_name) AS sender_name,
        wim.participant_jid AS sender_jid,
        COALESCE(wpp.profile_picture_url, wim.sender_profile_picture_url) AS sender_pic_url,
        COALESCE(wim.message_text, '') AS content,
        wim.raw_payload AS media_json,
        'incoming' AS source,
        wim.created_at AS created_at
      FROM whatsapp_incoming_messages wim
      JOIN whatsapp_jid_aliases wja ON wja.alias_jid = wim.remote_jid OR wja.alias_jid = wim.participant_jid
      JOIN deals d ON d.whatsapp_jid = wja.canonical_jid
      LEFT JOIN LATERAL (
        SELECT wpp_inner.display_name, wpp_inner.profile_picture_url
        FROM whatsapp_participant_profiles wpp_inner
        WHERE wpp_inner.participant_jid = wim.participant_jid
          AND (wpp_inner.instance_name = COALESCE(wim.instance_name, '') OR wpp_inner.instance_name = '')
        ORDER BY
          CASE WHEN wpp_inner.instance_name = COALESCE(wim.instance_name, '') THEN 0 ELSE 1 END,
          wpp_inner.updated_at DESC
        LIMIT 1
      ) wpp ON true
      WHERE wim.created_at >= NOW() - INTERVAL '90 days'
    ),
    deduped_incoming_alias AS (
      SELECT DISTINCT ON (deal_id, message_id) *
      FROM raw_incoming_alias
      ORDER BY deal_id, message_id, created_at DESC
    )
    INSERT INTO whatsapp_monitor_messages (
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    )
    SELECT 
      deal_id, message_id, remote_jid, instance_name, direction, from_me,
      sender_name, sender_jid, sender_pic_url, content, media_json, source, created_at
    FROM deduped_incoming_alias
    ON CONFLICT (deal_id, message_id, source) DO UPDATE SET
      content        = EXCLUDED.content,
      sender_name    = COALESCE(EXCLUDED.sender_name, whatsapp_monitor_messages.sender_name),
      sender_pic_url = COALESCE(EXCLUDED.sender_pic_url, whatsapp_monitor_messages.sender_pic_url),
      media_json     = COALESCE(EXCLUDED.media_json, whatsapp_monitor_messages.media_json),
      from_me        = EXCLUDED.from_me
  `);
  logger.info(`Completed incoming alias matches: ${incomingAliasResult.rowCount} rows processed/inserted.`);

  logger.info("Optimized backfill completed successfully.");
}

main()
  .catch((err) => {
    logger.error("Backfill failed", { error: err.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });

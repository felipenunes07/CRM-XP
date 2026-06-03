/**
 * Manual WhatsApp identity repair (LID <-> phone JID) + avatar cleanup.
 *
 * Why this exists: the auto-migration that runs on server startup only repairs
 * the last 3 days of data (`INTERVAL '3 days'`). The conversation monitor reads
 * the last 90 days (WHATSAPP_MONITOR_HISTORY_DAYS), so older conversations were
 * left with:
 *   - missing whatsapp_jid_aliases rows  -> opened threads come back empty
 *     (after the perf change the message query only matches by
 *      remote_jid/participant_jid, which depends on these alias rows);
 *   - deals still keyed by an unresolved @lid;
 *   - chat/participant profiles carrying the SELLER's (instance owner's) avatar.
 *
 * This script re-runs the same idempotent repair over a configurable window
 * (default 90 days) and additionally clears any profile picture that is exactly
 * the instance's own avatar. It is safe to run multiple times.
 *
 * Usage:
 *   npm run repair:whatsapp-identity            # 90 days (default)
 *   npm run repair:whatsapp-identity -- 120     # custom window in days
 *
 * It is intentionally NOT wired into runMigrations so it never blocks server
 * startup. Run it manually during low-traffic hours.
 */
import { pool, redis } from "../db/client.js";
import { logger } from "../lib/logger.js";

const DEFAULT_WINDOW_DAYS = 90;

async function readDiagnostics(days: number) {
  const result = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM deals
        WHERE whatsapp_jid LIKE '%@lid'
          AND COALESCE(last_activity_at, created_at) >= NOW() - make_interval(days => $1::int)
      ) AS lid_deals,
      (SELECT COUNT(*) FROM deals
        WHERE whatsapp_jid IS NOT NULL
          AND COALESCE(last_activity_at, created_at) >= NOW() - make_interval(days => $1::int)
          AND (
            customer_display_name IS NULL
            OR customer_display_name = ''
            OR LOWER(customer_display_name) = LOWER(whatsapp_jid)
            OR regexp_replace(customer_display_name, '\\D', '', 'g') = regexp_replace(whatsapp_jid, '\\D', '', 'g')
          )
      ) AS numeric_names,
      (SELECT COUNT(*) FROM whatsapp_chat_profiles wcp
        JOIN whatsapp_instances wi ON LOWER(wi.instance_name) = LOWER(wcp.instance_name)
        WHERE NULLIF(wcp.profile_picture_url, '') IS NOT NULL
          AND wcp.profile_picture_url = wi.profile_picture_url
      ) AS seller_avatar_chat_profiles,
      (SELECT COUNT(*) FROM whatsapp_participant_profiles wpp
        JOIN whatsapp_instances wi ON LOWER(wi.instance_name) = LOWER(wpp.instance_name)
        WHERE NULLIF(wpp.profile_picture_url, '') IS NOT NULL
          AND wpp.profile_picture_url = wi.profile_picture_url
      ) AS seller_avatar_participant_profiles
    `,
    [days],
  );
  return result.rows[0];
}

async function backfillAliases(days: number) {
  const result = await pool.query(
    `
    WITH source_messages AS (
      SELECT
        LOWER(COALESCE(instance_name, '')) AS instance_name,
        LOWER(COALESCE(remote_jid, '')) AS remote_jid,
        LOWER(COALESCE(participant_jid, '')) AS participant_jid,
        raw_payload,
        created_at
      FROM whatsapp_incoming_messages
      WHERE created_at >= NOW() - make_interval(days => $1::int)
        AND LOWER(COALESCE(remote_jid, '')) NOT LIKE '%@g.us'
    ),
    candidate_pairs AS (
      SELECT
        source_messages.instance_name,
        source_messages.created_at,
        CASE
          WHEN LOWER(alias_value) LIKE '%@lid' THEN LOWER(alias_value)
          WHEN regexp_replace(COALESCE(alias_value, ''), '\\D', '', 'g') <> ''
            AND LENGTH(regexp_replace(COALESCE(alias_value, ''), '\\D', '', 'g')) > 13
            THEN regexp_replace(alias_value, '\\D', '', 'g') || '@lid'
          ELSE NULL
        END AS alias_jid,
        CASE
          WHEN LOWER(COALESCE(phone_value, '')) LIKE '%@lid' THEN NULL
          WHEN LOWER(COALESCE(phone_value, '')) LIKE '%@g.us' THEN NULL
          WHEN LOWER(COALESCE(phone_value, '')) LIKE '%@s.whatsapp.net' THEN LOWER(phone_value)
          WHEN LENGTH(regexp_replace(COALESCE(phone_value, ''), '\\D', '', 'g')) BETWEEN 10 AND 13
            THEN regexp_replace(phone_value, '\\D', '', 'g') || '@s.whatsapp.net'
          ELSE NULL
        END AS canonical_jid
      FROM source_messages
      CROSS JOIN LATERAL (
        VALUES
          (source_messages.remote_jid),
          (source_messages.participant_jid),
          (source_messages.raw_payload #>> '{key,remoteJid}'),
          (source_messages.raw_payload #>> '{key,participant}'),
          (source_messages.raw_payload #>> '{key,senderJid}'),
          (source_messages.raw_payload ->> 'remoteJid'),
          (source_messages.raw_payload ->> 'chatId'),
          (source_messages.raw_payload ->> 'jid'),
          (source_messages.raw_payload ->> 'participant'),
          (source_messages.raw_payload ->> 'participantJid'),
          (source_messages.raw_payload ->> 'senderJid')
      ) aliases(alias_value)
      CROSS JOIN LATERAL (
        VALUES
          (source_messages.raw_payload #>> '{key,remoteJidPn}'),
          (source_messages.raw_payload #>> '{key,remoteJidAlt}'),
          (source_messages.raw_payload #>> '{key,senderPn}'),
          (source_messages.raw_payload #>> '{key,participantPn}'),
          (source_messages.raw_payload #>> '{key,participantAlt}'),
          (source_messages.raw_payload ->> 'remoteJidPn'),
          (source_messages.raw_payload ->> 'remoteJidAlt'),
          (source_messages.raw_payload ->> 'chatIdPn'),
          (source_messages.raw_payload ->> 'chatIdAlt'),
          (source_messages.raw_payload ->> 'jidAlt'),
          (source_messages.raw_payload ->> 'senderPn'),
          (source_messages.raw_payload ->> 'participantPn'),
          (source_messages.raw_payload ->> 'participantAlt')
      ) phones(phone_value)
    )
    INSERT INTO whatsapp_jid_aliases (
      instance_name, alias_jid, canonical_jid, alias_type, source,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      instance_name, alias_jid, canonical_jid, 'LID', 'manual-identity-repair',
      MIN(created_at), MAX(created_at), NOW(), NOW()
    FROM candidate_pairs
    WHERE alias_jid IS NOT NULL
      AND canonical_jid IS NOT NULL
      AND alias_jid <> canonical_jid
    GROUP BY instance_name, alias_jid, canonical_jid
    ON CONFLICT (instance_name, alias_jid) DO UPDATE SET
      canonical_jid = EXCLUDED.canonical_jid,
      alias_type = EXCLUDED.alias_type,
      source = COALESCE(whatsapp_jid_aliases.source, EXCLUDED.source),
      first_seen_at = LEAST(whatsapp_jid_aliases.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(whatsapp_jid_aliases.last_seen_at, EXCLUDED.last_seen_at),
      updated_at = NOW()
    `,
    [days],
  );
  return result.rowCount ?? 0;
}

async function convertLidDeals(days: number) {
  const result = await pool.query(
    `
    WITH safe_deal_alias AS (
      SELECT
        d.id AS deal_id,
        MIN(wja.canonical_jid) AS canonical_jid,
        COUNT(DISTINCT wja.canonical_jid) AS canonical_count
      FROM deals d
      LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
      JOIN whatsapp_jid_aliases wja
        ON LOWER(wja.instance_name) = LOWER(COALESCE(wi.instance_name, ''))
       AND wja.alias_jid = LOWER(d.whatsapp_jid)
      WHERE LOWER(COALESCE(d.whatsapp_jid, '')) LIKE '%@lid'
        AND wja.canonical_jid LIKE '%@s.whatsapp.net'
        AND COALESCE(d.last_activity_at, d.created_at) >= NOW() - make_interval(days => $1::int)
      GROUP BY d.id
    )
    UPDATE deals d
    SET whatsapp_jid = safe_deal_alias.canonical_jid,
        last_activity_at = COALESCE(d.last_activity_at, NOW())
    FROM safe_deal_alias
    WHERE d.id = safe_deal_alias.deal_id
      AND safe_deal_alias.canonical_count = 1
    `,
    [days],
  );
  return result.rowCount ?? 0;
}

/**
 * Clears any chat/participant profile picture that is exactly the instance's own
 * avatar (the seller's photo wrongly attached to a customer). After clearing,
 * the monitor falls back to the real inbound picture / initials.
 */
async function clearSellerAvatars() {
  const chat = await pool.query(
    `
    UPDATE whatsapp_chat_profiles wcp
    SET profile_picture_url = NULL, updated_at = NOW()
    FROM whatsapp_instances wi
    WHERE LOWER(wi.instance_name) = LOWER(wcp.instance_name)
      AND NULLIF(wcp.profile_picture_url, '') IS NOT NULL
      AND wcp.profile_picture_url = wi.profile_picture_url
      AND wcp.is_group = false
    `,
  );

  const participant = await pool.query(
    `
    UPDATE whatsapp_participant_profiles wpp
    SET profile_picture_url = NULL, updated_at = NOW()
    FROM whatsapp_instances wi
    WHERE LOWER(wi.instance_name) = LOWER(wpp.instance_name)
      AND NULLIF(wpp.profile_picture_url, '') IS NOT NULL
      AND wpp.profile_picture_url = wi.profile_picture_url
    `,
  );

  return { chat: chat.rowCount ?? 0, participant: participant.rowCount ?? 0 };
}

async function main() {
  const rawDays = process.argv[2];
  const days = rawDays === undefined ? DEFAULT_WINDOW_DAYS : Number(rawDays);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`Invalid days argument: ${rawDays}`);
  }

  logger.info("whatsapp identity repair starting", { windowDays: days });

  const before = await readDiagnostics(days);
  logger.info("whatsapp identity repair: before", before);

  const aliasesUpserted = await backfillAliases(days);
  logger.info("whatsapp identity repair: aliases upserted", { aliasesUpserted });

  const dealsConverted = await convertLidDeals(days);
  logger.info("whatsapp identity repair: lid deals converted to phone jid", { dealsConverted });

  const avatarsCleared = await clearSellerAvatars();
  logger.info("whatsapp identity repair: seller avatars cleared", avatarsCleared);

  const after = await readDiagnostics(days);
  logger.info("whatsapp identity repair: after", after);

  logger.info("whatsapp identity repair finished");
}

main()
  .catch((error) => {
    logger.error("whatsapp identity repair failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await redis.quit().catch(() => undefined);
    await pool.end().catch(() => undefined);
  });

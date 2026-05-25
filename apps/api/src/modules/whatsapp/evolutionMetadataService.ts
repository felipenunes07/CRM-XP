import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import {
  formatEvolutionSendTextTarget,
  isWhatsappFallbackDisplayName,
  type EvolutionMessageContext,
} from "./whatsappMonitorCore.js";

interface EvolutionInstanceConfig {
  instanceName: string;
  baseUrl: string;
  apiKey: string;
}

interface WhatsappProfileCache {
  displayName: string | null;
  profilePictureUrl: string | null;
  lastSyncedAt: Date | null;
}

interface WhatsappChatMetadata {
  chatDisplayName: string | null;
  chatProfilePictureUrl: string | null;
  senderName: string | null;
  senderProfilePictureUrl: string | null;
}

interface RefreshProfileCandidate {
  remoteJid: string;
  instanceName: string | null;
  displayName: string | null;
}

const PROFILE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function pickNestedRecord(source: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return null;
}

function collectArrayPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["instances", "data", "response", "result"]) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return collectArrayPayload(nested);
      }
    }
    return [record];
  }

  return [];
}

function isFresh(value: Date | null) {
  return Boolean(value && Date.now() - value.getTime() < PROFILE_CACHE_TTL_MS);
}

function coerceRawProfile(payload: unknown) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}

async function getEvolutionInstanceConfig(instanceName: string | null | undefined): Promise<EvolutionInstanceConfig | null> {
  const normalizedName = instanceName || env.EVOLUTION_INSTANCE_NAME;

  if (normalizedName) {
    const result = await pool.query(
      `
      SELECT instance_name, evolution_base_url, evolution_api_key
      FROM whatsapp_instances
      WHERE instance_name = $1
        AND status = 'ACTIVE'
      LIMIT 1
      `,
      [normalizedName],
    );

    const row = result.rows[0];
    if (row?.evolution_base_url && row?.evolution_api_key) {
      return {
        instanceName: String(row.instance_name),
        baseUrl: String(row.evolution_base_url),
        apiKey: String(row.evolution_api_key),
      };
    }
  }

  if (!env.EVOLUTION_API_BASE_URL || !env.EVOLUTION_API_KEY || !normalizedName) {
    return null;
  }

  return {
    instanceName: normalizedName,
    baseUrl: env.EVOLUTION_API_BASE_URL,
    apiKey: env.EVOLUTION_API_KEY,
  };
}

async function fetchEvolutionJson(
  config: EvolutionInstanceConfig,
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${stripTrailingSlash(config.baseUrl)}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: config.apiKey,
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    logger.warn("Evolution metadata request failed", {
      path,
      status: response.status,
      message: payload.message ?? payload.error,
    });
    return null;
  }

  return payload;
}

async function fetchEvolutionGroupInfo(config: EvolutionInstanceConfig, remoteJid: string) {
  const safeInstance = encodeURIComponent(config.instanceName);
  const search = new URLSearchParams({ groupJid: remoteJid });
  const payload = await fetchEvolutionJson(config, `/group/findGroupInfos/${safeInstance}?${search.toString()}`);

  if (!payload) {
    return null;
  }

  return {
    displayName: pickString(payload, ["subject", "name", "displayName"]),
    profilePictureUrl: pickString(payload, ["pictureUrl", "profilePictureUrl", "profilePicUrl"]),
    rawProfile: payload,
  };
}

async function fetchEvolutionProfilePicture(config: EvolutionInstanceConfig, jid: string) {
  const safeInstance = encodeURIComponent(config.instanceName);
  const payload = await fetchEvolutionJson(config, `/chat/fetchProfilePictureUrl/${safeInstance}`, {
    method: "POST",
    body: JSON.stringify({ number: formatEvolutionSendTextTarget(jid) }),
  });

  return payload ? pickString(payload, ["profilePictureUrl", "profilePicUrl", "pictureUrl", "url"]) : null;
}

async function fetchEvolutionInstances(config: EvolutionInstanceConfig) {
  const payload = await fetchEvolutionJson(config, "/instance/fetchInstances");
  return collectArrayPayload(payload);
}

function parseInstanceSummary(payload: Record<string, unknown>) {
  const nestedInstance = pickNestedRecord(payload, ["instance"]);
  const source = nestedInstance ? { ...payload, ...nestedInstance } : payload;
  const instanceName = pickString(source, ["instanceName", "name", "instance", "id"]);
  const profilePictureUrl = pickString(source, ["profilePictureUrl", "profilePicUrl", "pictureUrl", "avatar"]);
  const ownerJid = pickString(source, ["ownerJid", "owner", "wuid", "number"]);

  return {
    instanceName,
    profilePictureUrl,
    ownerJid,
    rawProfile: payload,
  };
}

function phoneFromJid(jid: string | null) {
  if (!jid) {
    return null;
  }

  const [rawId = jid] = jid.split("@");
  const digits = rawId.replace(/\D/g, "");
  return digits || null;
}

async function getCachedChatProfile(instanceName: string, remoteJid: string): Promise<WhatsappProfileCache | null> {
  const result = await pool.query(
    `
    SELECT display_name, profile_picture_url, last_synced_at
    FROM whatsapp_chat_profiles
    WHERE instance_name = $1
      AND remote_jid = $2
    LIMIT 1
    `,
    [instanceName, remoteJid],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    displayName: row.display_name ? String(row.display_name) : null,
    profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)) : null,
  };
}

async function getCachedParticipantProfile(instanceName: string, participantJid: string): Promise<WhatsappProfileCache | null> {
  const result = await pool.query(
    `
    SELECT display_name, profile_picture_url, last_synced_at
    FROM whatsapp_participant_profiles
    WHERE instance_name = $1
      AND participant_jid = $2
    LIMIT 1
    `,
    [instanceName, participantJid],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    displayName: row.display_name ? String(row.display_name) : null,
    profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)) : null,
  };
}

async function upsertChatProfile(
  instanceName: string,
  remoteJid: string,
  input: {
    displayName: string | null;
    profilePictureUrl: string | null;
    isGroup: boolean;
    rawProfile?: Record<string, unknown>;
  },
) {
  await pool.query(
    `
    INSERT INTO whatsapp_chat_profiles (
      instance_name, remote_jid, display_name, profile_picture_url,
      is_group, raw_profile, last_synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    ON CONFLICT (instance_name, remote_jid) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, whatsapp_chat_profiles.display_name),
      profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, whatsapp_chat_profiles.profile_picture_url),
      is_group = EXCLUDED.is_group,
      raw_profile = CASE
        WHEN EXCLUDED.raw_profile = '{}'::jsonb THEN whatsapp_chat_profiles.raw_profile
        ELSE EXCLUDED.raw_profile
      END,
      last_synced_at = NOW()
    `,
    [
      instanceName,
      remoteJid,
      input.displayName,
      input.profilePictureUrl,
      input.isGroup,
      JSON.stringify(input.rawProfile ?? {}),
    ],
  );
}

async function upsertParticipantProfile(
  instanceName: string,
  participantJid: string,
  input: {
    displayName: string | null;
    profilePictureUrl: string | null;
    rawProfile?: Record<string, unknown>;
  },
) {
  await pool.query(
    `
    INSERT INTO whatsapp_participant_profiles (
      instance_name, participant_jid, display_name, profile_picture_url,
      raw_profile, last_synced_at
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
    ON CONFLICT (instance_name, participant_jid) DO UPDATE SET
      display_name = COALESCE(EXCLUDED.display_name, whatsapp_participant_profiles.display_name),
      profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, whatsapp_participant_profiles.profile_picture_url),
      raw_profile = CASE
        WHEN EXCLUDED.raw_profile = '{}'::jsonb THEN whatsapp_participant_profiles.raw_profile
        ELSE EXCLUDED.raw_profile
      END,
      last_synced_at = NOW()
    `,
    [
      instanceName,
      participantJid,
      input.displayName,
      input.profilePictureUrl,
      JSON.stringify(input.rawProfile ?? {}),
    ],
  );
}

export async function resolveWhatsappMessageMetadata(context: EvolutionMessageContext): Promise<WhatsappChatMetadata> {
  const config = await getEvolutionInstanceConfig(context.instanceName);
  const instanceName = config?.instanceName ?? context.instanceName ?? "";
  const metadata: WhatsappChatMetadata = {
    chatDisplayName: context.chatDisplayName,
    chatProfilePictureUrl: context.chatProfilePictureUrl,
    senderName: context.senderName,
    senderProfilePictureUrl: context.senderProfilePictureUrl,
  };

  if (!context.remoteJid) {
    return metadata;
  }

  try {
    const cachedChat = await getCachedChatProfile(instanceName, context.remoteJid);
    if (cachedChat) {
      metadata.chatDisplayName ??= cachedChat.displayName;
      metadata.chatProfilePictureUrl ??= cachedChat.profilePictureUrl;
    }

    if (config && (!cachedChat || !isFresh(cachedChat.lastSyncedAt) || !cachedChat.profilePictureUrl)) {
      if (context.isGroup) {
        const groupInfo = await fetchEvolutionGroupInfo(config, context.remoteJid);
        if (groupInfo) {
          metadata.chatDisplayName = groupInfo.displayName ?? metadata.chatDisplayName;
          metadata.chatProfilePictureUrl = groupInfo.profilePictureUrl ?? metadata.chatProfilePictureUrl;
          await upsertChatProfile(instanceName, context.remoteJid, {
            displayName: metadata.chatDisplayName,
            profilePictureUrl: metadata.chatProfilePictureUrl,
            isGroup: true,
            rawProfile: groupInfo.rawProfile,
          });
        }
      } else {
        const profilePictureUrl = await fetchEvolutionProfilePicture(config, context.remoteJid);
        metadata.chatProfilePictureUrl = profilePictureUrl ?? metadata.chatProfilePictureUrl;
        await upsertChatProfile(instanceName, context.remoteJid, {
          displayName: metadata.chatDisplayName ?? context.senderName,
          profilePictureUrl: metadata.chatProfilePictureUrl,
          isGroup: false,
        });
      }
    }

    if (!cachedChat && !config) {
      await upsertChatProfile(instanceName, context.remoteJid, {
        displayName: metadata.chatDisplayName ?? context.senderName,
        profilePictureUrl: metadata.chatProfilePictureUrl,
        isGroup: context.isGroup,
      });
    }
  } catch (error) {
    logger.warn("Failed to enrich WhatsApp chat profile", {
      remoteJid: context.remoteJid,
      error: String(error),
    });
  }

  if (!context.senderJid) {
    return metadata;
  }

  try {
    const cachedSender = await getCachedParticipantProfile(instanceName, context.senderJid);
    if (cachedSender) {
      metadata.senderName ??= cachedSender.displayName;
      metadata.senderProfilePictureUrl ??= cachedSender.profilePictureUrl;
    }

    if (config && (!cachedSender || !isFresh(cachedSender.lastSyncedAt) || !cachedSender.profilePictureUrl)) {
      const profilePictureUrl =
        metadata.senderProfilePictureUrl ?? (await fetchEvolutionProfilePicture(config, context.senderJid));
      metadata.senderProfilePictureUrl = profilePictureUrl ?? metadata.senderProfilePictureUrl;
      await upsertParticipantProfile(instanceName, context.senderJid, {
        displayName: metadata.senderName,
        profilePictureUrl: metadata.senderProfilePictureUrl,
        rawProfile: coerceRawProfile({ source: "messages.upsert" }),
      });
    }

    if (!cachedSender && !config) {
      await upsertParticipantProfile(instanceName, context.senderJid, {
        displayName: metadata.senderName,
        profilePictureUrl: metadata.senderProfilePictureUrl,
      });
    }
  } catch (error) {
    logger.warn("Failed to enrich WhatsApp participant profile", {
      participantJid: context.senderJid,
      error: String(error),
    });
  }

  return metadata;
}

export async function refreshWhatsappChatProfile(
  remoteJid: string,
  instanceName: string | null,
): Promise<WhatsappChatMetadata> {
  const config = await getEvolutionInstanceConfig(instanceName);
  const resolvedInstanceName = config?.instanceName ?? instanceName ?? "";
  const isGroup = remoteJid.endsWith("@g.us");
  const cachedChat = await getCachedChatProfile(resolvedInstanceName, remoteJid);
  const metadata: WhatsappChatMetadata = {
    chatDisplayName: cachedChat?.displayName ?? null,
    chatProfilePictureUrl: cachedChat?.profilePictureUrl ?? null,
    senderName: null,
    senderProfilePictureUrl: null,
  };

  if (!config) {
    return metadata;
  }

  if (isGroup) {
    const groupInfo = await fetchEvolutionGroupInfo(config, remoteJid);
    if (groupInfo) {
      metadata.chatDisplayName = groupInfo.displayName ?? metadata.chatDisplayName;
      metadata.chatProfilePictureUrl = groupInfo.profilePictureUrl ?? metadata.chatProfilePictureUrl;
      await upsertChatProfile(resolvedInstanceName, remoteJid, {
        displayName: metadata.chatDisplayName,
        profilePictureUrl: metadata.chatProfilePictureUrl,
        isGroup: true,
        rawProfile: groupInfo.rawProfile,
      });
    }
    return metadata;
  }

  const profilePictureUrl = await fetchEvolutionProfilePicture(config, remoteJid);
  metadata.chatProfilePictureUrl = profilePictureUrl ?? metadata.chatProfilePictureUrl;
  await upsertChatProfile(resolvedInstanceName, remoteJid, {
    displayName: metadata.chatDisplayName,
    profilePictureUrl: metadata.chatProfilePictureUrl,
    isGroup: false,
  });

  return metadata;
}

export async function refreshWhatsappInstanceProfiles() {
  const result = await pool.query(`
    SELECT id, instance_name, phone_number, evolution_base_url, evolution_api_key
    FROM whatsapp_instances
    WHERE status = 'ACTIVE'
      AND (provider = 'EVOLUTION' OR provider IS NULL)
    ORDER BY is_default DESC, display_label ASC
  `);

  let refreshed = 0;
  for (const row of result.rows) {
    const config: EvolutionInstanceConfig = {
      instanceName: String(row.instance_name),
      baseUrl: String(row.evolution_base_url),
      apiKey: String(row.evolution_api_key),
    };

    let profilePictureUrl: string | null = null;
    let ownerPhone: string | null = null;
    let rawProfile: Record<string, unknown> = {};

    try {
      const instances = await fetchEvolutionInstances(config);
      const match = instances
        .map(parseInstanceSummary)
        .find((item) => item.instanceName === config.instanceName);

      profilePictureUrl = match?.profilePictureUrl ?? null;
      ownerPhone = phoneFromJid(match?.ownerJid ?? null);
      rawProfile = match?.rawProfile ?? {};
    } catch (error) {
      logger.warn("Failed to fetch Evolution instances", {
        instanceName: config.instanceName,
        error: String(error),
      });
    }

    if (!profilePictureUrl) {
      const destination = ownerPhone ?? (row.phone_number ? String(row.phone_number) : null);
      if (destination) {
        profilePictureUrl = await fetchEvolutionProfilePicture(config, destination);
      }
    }

    if (profilePictureUrl || ownerPhone) {
      await pool.query(
        `
        UPDATE whatsapp_instances
        SET
          profile_picture_url = COALESCE($2, profile_picture_url),
          phone_number = COALESCE(NULLIF(phone_number, ''), $3),
          last_health_check_at = NOW(),
          last_health_status = COALESCE(last_health_status, 'OK')
        WHERE id = $1
        `,
        [row.id, profilePictureUrl, ownerPhone],
      );
      refreshed++;
    }

    if (ownerPhone || profilePictureUrl) {
      await upsertParticipantProfile(config.instanceName, ownerPhone ? `${ownerPhone}@s.whatsapp.net` : config.instanceName, {
        displayName: String(row.instance_name),
        profilePictureUrl,
        rawProfile,
      });
    }
  }

  return { refreshed };
}

export async function refreshMissingWhatsappMonitorProfiles(limit = 60) {
  const result = await pool.query(
    `
    SELECT DISTINCT
      d.whatsapp_jid AS remote_jid,
      COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance') AS instance_name,
      COALESCE(wcp.display_name, latest_whatsapp.metadata ->> 'chatDisplayName', d.customer_display_name, d.title) AS display_name,
      wcp.profile_picture_url
    FROM deals d
    LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
    LEFT JOIN LATERAL (
      SELECT da.metadata
      FROM deal_activities da
      WHERE da.deal_id = d.id
        AND da.activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
      ORDER BY da.created_at DESC
      LIMIT 1
    ) latest_whatsapp ON true
    LEFT JOIN LATERAL (
      SELECT display_name, profile_picture_url
      FROM whatsapp_chat_profiles wcp_inner
      WHERE wcp_inner.remote_jid = d.whatsapp_jid
        AND (
          wcp_inner.instance_name = COALESCE(wi.instance_name, latest_whatsapp.metadata ->> 'instance', '')
          OR wcp_inner.instance_name = ''
        )
      ORDER BY wcp_inner.updated_at DESC
      LIMIT 1
    ) wcp ON true
    WHERE d.whatsapp_jid IS NOT NULL
      AND (
        wcp.profile_picture_url IS NULL
        OR wcp.display_name IS NULL
        OR wcp.display_name = ''
      )
    ORDER BY d.whatsapp_jid
    LIMIT $1
    `,
    [limit],
  );

  const candidates: RefreshProfileCandidate[] = result.rows.map((row) => ({
    remoteJid: String(row.remote_jid),
    instanceName: row.instance_name ? String(row.instance_name) : null,
    displayName: row.display_name ? String(row.display_name) : null,
  }));

  let refreshed = 0;
  for (const candidate of candidates) {
    if (
      candidate.remoteJid.endsWith("@g.us") ||
      isWhatsappFallbackDisplayName(candidate.displayName, candidate.remoteJid)
    ) {
      await refreshWhatsappChatProfile(candidate.remoteJid, candidate.instanceName);
      refreshed++;
    }
  }

  const instanceResult = await refreshWhatsappInstanceProfiles();

  return {
    scanned: candidates.length,
    refreshed,
    refreshedInstances: instanceResult.refreshed,
  };
}

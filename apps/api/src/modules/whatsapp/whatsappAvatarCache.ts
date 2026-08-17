import crypto from "node:crypto";

import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

// Chatwoot-style avatar handling, fully self-hosted on the VPS Postgres.
// WhatsApp profile-picture URLs (pps.whatsapp.net / Evolution) are signed and
// expire within hours (the `oe`/`oh` query params), so storing them directly
// makes the avatar 403 shortly after. Instead we download the image once, store
// the raw bytes in Postgres (whatsapp_avatars) and serve them from our own
// endpoint (/api/whatsapp-monitor/avatar/:key) with a permanent URL.
//
// Everything here is best-effort: any failure simply leaves the existing
// (ephemeral) URL in place, so this can never regress current behaviour.

const AVATAR_ROUTE = "/api/whatsapp-monitor/avatar/";
const EXECUTIVE_AVATAR_ROUTE = "/api/dashboard/executive/avatar/";
const DEFAULT_PUBLIC_URL = "https://xpcrm-crm-backend.f0dgeg.easypanel.host";
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB safety cap
const FETCH_TIMEOUT_MS = 8000;
const INSTANCE_AVATAR_JID = "__instance_profile__";

interface WhatsappInstanceAvatarRow {
  id: string;
  instance_name: string;
  phone_number: string | null;
  provider: string | null;
  evolution_base_url: string | null;
  evolution_api_key: string | null;
  profile_picture_url: string | null;
}

/** Deterministic storage key for an (instance, jid) pair. Pure / testable. */
export function avatarStorageKey(instanceName: string, remoteJid: string): string {
  const hash = crypto
    .createHash("sha1")
    .update(`${(instanceName || "").toLowerCase()}::${remoteJid}`)
    .digest("hex");
  return `${hash}.jpg`;
}

/** Permanent public URL served by our own backend. Pure / testable. */
export function avatarPublicUrl(key: string): string {
  const base = (env.PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, "");
  return `${base}${AVATAR_ROUTE}${key}`;
}

/** URL publica e estavel usada pelo ranking do dashboard executivo. */
export function executiveSellerAvatarPublicUrl(instanceId: string): string {
  const base = (env.PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, "");
  const path = `${EXECUTIVE_AVATAR_ROUTE}${encodeURIComponent(instanceId)}`;
  return `${base}${path}`;
}

/**
 * Should this URL be downloaded + re-hosted? Pure / testable.
 * - null/empty -> no
 * - non-http -> no
 * - already pointing at our own avatar endpoint -> no
 */
export function isCacheableAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }
  if (url.includes(AVATAR_ROUTE)) {
    return false;
  }
  return true;
}

/** WhatsApp assina as URLs com o timestamp hexadecimal `oe`. */
export function isExpiredAvatarUrl(url: string | null | undefined, now = Date.now()): boolean {
  if (!url) return true;
  const match = url.match(/[?&]oe=([0-9a-fA-F]+)/);
  if (!match) return false;
  const expiresAt = Number.parseInt(match[1] as string, 16) * 1000;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function readAvatarUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["profilePictureUrl", "profilePicUrl", "pictureUrl", "url"]) {
    const value = record[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  for (const key of ["data", "response", "result"]) {
    const nested = readAvatarUrl(record[key]);
    if (nested) return nested;
  }
  return null;
}

async function downloadAvatar(sourceUrl: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; XPCRM/1.0)" },
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) return null;
    return {
      contentType: response.headers.get("content-type") || "image/jpeg",
      bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function storeAvatar(
  key: string,
  sourceUrl: string,
  avatar: { contentType: string; bytes: Buffer },
) {
  await pool.query(
    `INSERT INTO whatsapp_avatars (storage_key, content_type, bytes, source_url, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (storage_key) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       bytes = EXCLUDED.bytes,
       source_url = EXCLUDED.source_url,
       updated_at = NOW()`,
    [key, avatar.contentType, avatar.bytes, sourceUrl],
  );
}

async function refreshEvolutionInstanceAvatar(row: WhatsappInstanceAvatarRow): Promise<string | null> {
  const baseUrl = (row.evolution_base_url || env.EVOLUTION_API_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = row.evolution_api_key || env.EVOLUTION_API_KEY;
  const phone = String(row.phone_number || "").replace(/\D/g, "");
  if (!baseUrl || !apiKey || !phone) return null;

  const response = await fetch(
    `${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(row.instance_name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: phone }),
    },
  );
  if (!response.ok) return null;
  const freshUrl = readAvatarUrl(await response.json().catch(() => null));
  if (!freshUrl) return null;

  await pool.query(
    "UPDATE whatsapp_instances SET profile_picture_url = $2, updated_at = NOW() WHERE id = $1",
    [row.id, freshUrl],
  );
  return freshUrl;
}

/**
 * Entrega a foto de uma instancia pelo proprio CRM. Na primeira chamada, baixa
 * e guarda a imagem; se o link assinado ja venceu, renova-o na Evolution antes.
 */
export async function getWhatsappInstanceAvatarBytes(
  instanceId: string,
): Promise<{ contentType: string; bytes: Buffer } | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(instanceId)) return null;

  const result = await pool.query<WhatsappInstanceAvatarRow>(
    `SELECT id, instance_name, phone_number, provider, evolution_base_url,
            evolution_api_key, profile_picture_url
       FROM whatsapp_instances
      WHERE id = $1 AND UPPER(COALESCE(status, 'ACTIVE')) = 'ACTIVE'
      LIMIT 1`,
    [instanceId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const key = avatarStorageKey(row.instance_name, INSTANCE_AVATAR_JID);
  const cached = await getAvatarBytes(key);
  if (cached) return cached;

  try {
    let sourceUrl = row.profile_picture_url;
    let avatar = sourceUrl && !isExpiredAvatarUrl(sourceUrl)
      ? await downloadAvatar(sourceUrl)
      : null;

    if (!avatar && String(row.provider || "EVOLUTION").toUpperCase() === "EVOLUTION") {
      sourceUrl = await refreshEvolutionInstanceAvatar(row);
      avatar = sourceUrl ? await downloadAvatar(sourceUrl) : null;
    }

    if (!sourceUrl || !avatar) return null;
    await storeAvatar(key, sourceUrl, avatar);
    return avatar;
  } catch (error) {
    logger.warn("whatsapp instance avatar cache failed", {
      instanceId,
      instanceName: row.instance_name,
      error: String(error),
    });
    return null;
  }
}

/**
 * Download the avatar at `sourceUrl`, store the bytes in Postgres and persist
 * the permanent URL on whatsapp_chat_profiles. Best-effort and silent on
 * failure. Safe to call fire-and-forget.
 */
export async function cacheChatProfileAvatar(
  instanceName: string,
  remoteJid: string,
  sourceUrl: string | null | undefined,
): Promise<string | null> {
  try {
    if (!remoteJid || !isCacheableAvatarUrl(sourceUrl)) {
      return null;
    }

    // Skip if we already cached this exact source URL.
    const existing = await pool.query(
      `SELECT cached_source_url
         FROM whatsapp_chat_profiles
        WHERE instance_name = $1 AND remote_jid = $2
        LIMIT 1`,
      [instanceName, remoteJid],
    );
    if (existing.rows[0]?.cached_source_url === sourceUrl) {
      return null;
    }

    const avatar = await downloadAvatar(sourceUrl as string);
    if (!avatar) return null;

    const key = avatarStorageKey(instanceName, remoteJid);
    await storeAvatar(key, sourceUrl as string, avatar);

    // Cache-bust so the browser picks up a replaced image.
    const finalUrl = `${avatarPublicUrl(key)}?v=${Date.now()}`;

    await pool.query(
      `UPDATE whatsapp_chat_profiles
          SET cached_picture_url = $3,
              cached_source_url = $4,
              cached_at = NOW()
        WHERE instance_name = $1 AND remote_jid = $2`,
      [instanceName, remoteJid, finalUrl, sourceUrl],
    );

    return finalUrl;
  } catch (error) {
    logger.warn("whatsapp avatar cache failed", { remoteJid, error: String(error) });
    return null;
  }
}

/** Fetch stored avatar bytes for the public endpoint. */
export async function getAvatarBytes(
  key: string,
): Promise<{ contentType: string; bytes: Buffer } | null> {
  const safeKey = String(key).replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safeKey) {
    return null;
  }
  const result = await pool.query(
    `SELECT content_type, bytes FROM whatsapp_avatars WHERE storage_key = $1 LIMIT 1`,
    [safeKey],
  );
  const row = result.rows[0];
  if (!row || !row.bytes) {
    return null;
  }
  return {
    contentType: row.content_type ? String(row.content_type) : "image/jpeg",
    bytes: Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes),
  };
}

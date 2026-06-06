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
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB safety cap
const FETCH_TIMEOUT_MS = 8000;

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
  const base = (env.PUBLIC_URL || "").replace(/\/+$/, "");
  return base ? `${base}${AVATAR_ROUTE}${key}` : `${AVATAR_ROUTE}${key}`;
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let bytes: Buffer;
    let contentType = "image/jpeg";
    try {
      const response = await fetch(sourceUrl as string, { signal: controller.signal });
      if (!response.ok) {
        return null;
      }
      contentType = response.headers.get("content-type") || "image/jpeg";
      bytes = Buffer.from(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }

    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) {
      return null;
    }

    const key = avatarStorageKey(instanceName, remoteJid);

    await pool.query(
      `INSERT INTO whatsapp_avatars (storage_key, content_type, bytes, source_url, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (storage_key) DO UPDATE SET
         content_type = EXCLUDED.content_type,
         bytes = EXCLUDED.bytes,
         source_url = EXCLUDED.source_url,
         updated_at = NOW()`,
      [key, contentType, bytes, sourceUrl],
    );

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

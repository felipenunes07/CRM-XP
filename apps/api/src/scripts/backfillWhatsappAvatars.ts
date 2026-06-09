/**
 * One-off backfill: re-host WhatsApp avatars (and group names) in Postgres,
 * using the CONNECTED instances to fetch them — NOT the instance stored on the
 * row (which may be a dead/test instance like "teste" that returns 404).
 *
 * For each JID without a cached avatar it tries every ACTIVE instance until one
 * returns the picture (groups: only the member instance answers; 1:1: any
 * connected instance can fetch the public picture). The result is written to a
 * UNIVERSAL profile row (instance_name = '') so the conversation read always
 * matches it, regardless of which instance the conversation resolves to.
 *
 * Run on the server (needs DATABASE_URL + at least one connected instance):
 *   npx tsx apps/api/src/scripts/backfillWhatsappAvatars.ts
 */
import { pool } from "../db/client.js";
import { refreshWhatsappChatProfile } from "../modules/whatsapp/evolutionMetadataService.js";
import { cacheChatProfileAvatar } from "../modules/whatsapp/whatsappAvatarCache.js";

async function getActiveInstances(): Promise<string[]> {
  const r = await pool.query(
    `SELECT instance_name
       FROM whatsapp_instances
      WHERE status = 'ACTIVE'
        AND (provider = 'EVOLUTION' OR provider IS NULL)
        AND NULLIF(evolution_base_url, '') IS NOT NULL
        AND NULLIF(evolution_api_key, '') IS NOT NULL
      ORDER BY is_default DESC, instance_name ASC`,
  );
  return r.rows.map((x) => String(x.instance_name)).filter(Boolean);
}

async function upsertUniversal(jid: string, cachedUrl: string | null, displayName: string | null) {
  const isGroup = jid.endsWith("@g.us");
  await pool.query(
    `INSERT INTO whatsapp_chat_profiles
       (instance_name, remote_jid, display_name, cached_picture_url, cached_at, is_group, last_synced_at)
     VALUES ('', $1, $2, $3, NOW(), $4, NOW())
     ON CONFLICT (instance_name, remote_jid) DO UPDATE SET
       cached_picture_url = COALESCE(EXCLUDED.cached_picture_url, whatsapp_chat_profiles.cached_picture_url),
       display_name = COALESCE(NULLIF(whatsapp_chat_profiles.display_name, ''), EXCLUDED.display_name),
       cached_at = NOW()`,
    [jid, displayName, cachedUrl, isGroup],
  );
}

async function main() {
  const instances = await getActiveInstances();
  console.log("Instancias ativas usadas para puxar avatar/nome:", instances);
  if (!instances.length) {
    console.log("Nenhuma instancia conectada (evolution_base_url/api_key). Abortando.");
    await pool.end();
    return;
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT remote_jid
       FROM whatsapp_chat_profiles
      WHERE cached_picture_url IS NULL AND remote_jid IS NOT NULL`,
  );
  console.log(`JIDs sem avatar: ${rows.length}`);

  let comFoto = 0;
  let semFoto = 0;
  for (const row of rows) {
    const jid = String(row.remote_jid);
    let cachedUrl: string | null = null;
    let displayName: string | null = null;

    for (const inst of instances) {
      try {
        const meta = await refreshWhatsappChatProfile(jid, inst);
        if (meta.chatDisplayName && !displayName) {
          displayName = meta.chatDisplayName;
        }
        if (meta.chatProfilePictureUrl) {
          cachedUrl = await cacheChatProfileAvatar(inst, jid, meta.chatProfilePictureUrl);
          if (cachedUrl) {
            break;
          }
        }
      } catch {
        // instance is not a member / not connected -> try the next one
      }
    }

    await upsertUniversal(jid, cachedUrl, displayName);
    if (cachedUrl) {
      comFoto++;
    } else {
      semFoto++;
    }
    if ((comFoto + semFoto) % 25 === 0) {
      console.log(`  progresso: com_foto=${comFoto} sem_foto=${semFoto} / ${rows.length}`);
    }
  }

  console.log(`Concluido: com_foto=${comFoto} sem_foto=${semFoto} total=${rows.length}`);
  await pool.end();
}

main().catch((e) => {
  console.error("backfill falhou:", e);
  process.exit(1);
});

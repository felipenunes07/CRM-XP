/**
 * One-off backfill: re-host every WhatsApp profile picture in Postgres
 * (whatsapp_avatars) so avatars stop breaking when the ephemeral CDN URL
 * expires.
 *
 * Strategy per profile:
 *   1) try the stored profile_picture_url (works while still valid, e.g. 1:1);
 *   2) if that fails (expired -> 403, common for groups), fetch a FRESH url
 *      from the Evolution API via refreshWhatsappChatProfile, then cache that.
 *
 * Run on the server (needs DATABASE_URL + EVOLUTION_* env + network):
 *   npx tsx apps/api/src/scripts/backfillWhatsappAvatars.ts
 */
import { pool } from "../db/client.js";
import { refreshWhatsappChatProfile } from "../modules/whatsapp/evolutionMetadataService.js";
import { cacheChatProfileAvatar } from "../modules/whatsapp/whatsappAvatarCache.js";

async function main() {
  const { rows } = await pool.query(
    `SELECT instance_name, remote_jid, profile_picture_url
       FROM whatsapp_chat_profiles
      WHERE cached_picture_url IS NULL
        AND remote_jid IS NOT NULL`,
  );

  console.log(`backfill: ${rows.length} perfis candidatos`);
  let ok = 0;
  let freshOk = 0;
  let fail = 0;

  for (const row of rows) {
    const instance = String(row.instance_name ?? "");
    const jid = String(row.remote_jid);

    // 1) try the stored URL
    let url = await cacheChatProfileAvatar(instance, jid, row.profile_picture_url ?? null);

    // 2) stored URL missing/expired -> fetch a fresh one from Evolution
    if (!url) {
      try {
        const meta = await refreshWhatsappChatProfile(jid, instance || null);
        url = await cacheChatProfileAvatar(instance, jid, meta.chatProfilePictureUrl ?? null);
        if (url) {
          freshOk++;
        }
      } catch {
        // ignore, counted as fail below
      }
    } else {
      ok++;
    }

    if (!url) {
      fail++;
    }

    if ((ok + freshOk + fail) % 25 === 0) {
      console.log(`  progresso: ok=${ok} fresh=${freshOk} fail=${fail} / ${rows.length}`);
    }
  }

  console.log(`backfill concluido: ok=${ok} fresh=${freshOk} fail=${fail} total=${rows.length}`);
  await pool.end();
}

main().catch((error) => {
  console.error("backfill falhou:", error);
  process.exit(1);
});

/**
 * One-off backfill: re-host every existing WhatsApp profile picture in Supabase
 * Storage so avatars stop breaking when the ephemeral CDN URL expires.
 *
 * Run on the server (needs DATABASE_URL + SUPABASE_* env + network):
 *   npx tsx apps/api/src/scripts/backfillWhatsappAvatars.ts
 */
import { pool } from "../db/client.js";
import {
  cacheChatProfileAvatar,
  isCacheableAvatarUrl,
} from "../modules/whatsapp/whatsappAvatarCache.js";

async function main() {
  const { rows } = await pool.query(
    `SELECT instance_name, remote_jid, profile_picture_url
       FROM whatsapp_chat_profiles
      WHERE NULLIF(profile_picture_url, '') IS NOT NULL
        AND (
          cached_picture_url IS NULL
          OR cached_source_url IS DISTINCT FROM profile_picture_url
        )`,
  );

  console.log(`backfill: ${rows.length} perfis candidatos`);
  let ok = 0;
  let fail = 0;
  let skip = 0;

  for (const row of rows) {
    if (!isCacheableAvatarUrl(row.profile_picture_url)) {
      skip++;
      continue;
    }
    const url = await cacheChatProfileAvatar(
      String(row.instance_name ?? ""),
      String(row.remote_jid),
      String(row.profile_picture_url),
    );
    if (url) {
      ok++;
    } else {
      fail++;
    }
    if ((ok + fail) % 25 === 0) {
      console.log(`  progresso: ok=${ok} fail=${fail} skip=${skip} / ${rows.length}`);
    }
  }

  console.log(`backfill concluido: ok=${ok} fail=${fail} skip=${skip} total=${rows.length}`);
  await pool.end();
}

main().catch((error) => {
  console.error("backfill falhou:", error);
  process.exit(1);
});

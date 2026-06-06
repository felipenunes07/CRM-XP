/**
 * Diagnostic: why is avatar caching failing? Fetches a few stored profile
 * picture URLs and prints the HTTP status / error so we know if it's expired
 * URLs (403/404) vs a network block vs something else.
 *
 *   npx tsx apps/api/src/scripts/diagnoseWhatsappAvatar.ts
 */
import { pool } from "../db/client.js";

async function probe(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const ct = res.headers.get("content-type");
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
    console.log(`  status=${res.status} ok=${res.ok} type=${ct} bytes=${buf.length}`);
  } catch (error) {
    console.log(`  THROW: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { rows } = await pool.query(
    `SELECT instance_name, remote_jid, profile_picture_url
       FROM whatsapp_chat_profiles
      WHERE NULLIF(profile_picture_url, '') IS NOT NULL
      LIMIT 3`,
  );
  console.log(`amostras: ${rows.length}`);
  for (const r of rows) {
    console.log(`jid=${r.remote_jid} instance=${r.instance_name}`);
    console.log(`  url=${String(r.profile_picture_url).slice(0, 120)}`);
    await probe(String(r.profile_picture_url));
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

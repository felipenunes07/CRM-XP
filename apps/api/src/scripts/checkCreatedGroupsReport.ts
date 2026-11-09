import assert from "node:assert/strict";
import { pool, redis, whatsappMonitorPool } from "../db/client.js";
import { recordWhatsappGroupUpdates } from "../modules/whatsapp/evolutionMetadataService.js";
import { getWhatsappGroupsCreatedOnDate } from "../modules/whatsapp/whatsappMonitorService.js";

try {
  if (process.argv.includes("--self-test")) {
    const client = await pool.connect();
    const originalQuery = pool.query;
    const originalMonitorQuery = whatsappMonitorPool.query;
    // Route the real ingestion and report SQL through one isolated temporary fixture.
    pool.query = client.query.bind(client) as typeof pool.query;
    whatsappMonitorPool.query = client.query.bind(client) as typeof whatsappMonitorPool.query;
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE whatsapp_instances (instance_name text, status text) ON COMMIT DROP;
        INSERT INTO whatsapp_instances VALUES ('Thais', 'ACTIVE'), ('Amanda', 'ACTIVE');
        CREATE TEMP TABLE whatsapp_chat_profiles (
          instance_name text, remote_jid text, display_name text, is_group boolean,
          raw_profile jsonb DEFAULT '{}'::jsonb, last_synced_at timestamptz DEFAULT NOW(),
          created_at timestamptz DEFAULT NOW(), PRIMARY KEY (instance_name, remote_jid)
        ) ON COMMIT DROP
      `);
      const group = (id: string, subject: string, time: string, extra = {}) => ({
        id, subject, creation: new Date(time).getTime() / 1000, ...extra,
      });
      const first = group("120300000000001@g.us", "Grupo sem compra", "2026-11-09T03:00:00Z");
      await recordWhatsappGroupUpdates("Thais", [
        first,
        group("120300000000002@g.us", "Fim do dia", "2026-11-10T02:59:59Z"),
        group("120300000000003@g.us", "Dia anterior", "2026-11-09T02:59:59Z"),
        group("120300000000004@g.us", "Dia seguinte", "2026-11-10T03:00:00Z"),
        group("120300000000005@g.us", "Comunidade", "2026-11-09T12:00:00Z", { isCommunity: true }),
        group("120300000000006@g.us", "Avisos", "2026-11-09T12:00:00Z", { isCommunityAnnounce: true }),
        group("120363024604307554@g.us", "Equipe", "2026-11-09T12:00:00Z"),
        group("120300000000007@g.us", "INT atendimento XP BRASIL", "2026-11-09T12:00:00Z"),
        group("120300000000008@g.us", "Antigo importado hoje", "2026-01-01T12:00:00Z"),
        { id: "120300000000009@g.us", subject: "Data desconhecida", creation: "invalid" },
        group("120300000000010@g.us", "Timestamp em milissegundos", "2026-11-09T12:00:00Z", { creation: new Date("2026-11-09T12:00:00Z").getTime() }),
        { id: "5511999999999@s.whatsapp.net", subject: "Particular", creation: first.creation },
      ]);
      await recordWhatsappGroupUpdates("Amanda", [first, { id: first.id, subject: "Grupo sem compra atualizado", creation: null }]);
      await recordWhatsappGroupUpdates("Amanda", { id: first.id, subject: "Grupo renomeado", creation: null });
      assert.equal(await recordWhatsappGroupUpdates("Desconhecida", group("120300000000011@g.us", "Outro", "2026-11-09T12:00:00Z")), 0);
      const groups = await getWhatsappGroupsCreatedOnDate("2026-11-09");
      assert.equal(groups.length, 3);
      assert.equal(groups.find((item) => item.jid === first.id)?.name, "Grupo renomeado");
      assert.equal(groups.find((item) => item.jid === first.id)?.createdAt, "2026-11-09T03:00:00.000Z");
      console.log("PASS: real group creation date, Brasilia midnight boundaries, no-purchase groups, duplicate instances, rename preservation, invalid dates, internal groups and communities (Postgres temporary fixture)");
    } finally {
      try {
        await client.query("ROLLBACK");
      } finally {
        pool.query = originalQuery;
        whatsappMonitorPool.query = originalMonitorQuery;
        client.release();
      }
    }
  } else {
    const date = process.argv[2] || new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
    console.log(JSON.stringify({ date, groups: await getWhatsappGroupsCreatedOnDate(date) }, null, 2));
  }
} finally {
  await Promise.all([pool.end(), whatsappMonitorPool.end(), redis.quit()]);
}

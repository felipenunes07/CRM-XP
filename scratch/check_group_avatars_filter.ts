import { pool } from "../apps/api/src/db/client.js";

async function run() {
  try {
    console.log("=== CHECKING GROUP AVATARS SELECTION IN SQL ===");

    const res = await pool.query(
      `SELECT 
        d.id, 
        d.title, 
        d.whatsapp_jid,
        chat_profile.profile_picture_url AS chat_profile_url,
        incoming_profile.chat_profile_picture_url AS incoming_profile_url,
        safe_profile.profile_picture_url AS safe_profile_url
       FROM deals d
       LEFT JOIN whatsapp_instances wi ON wi.id = d.whatsapp_instance_id
       LEFT JOIN LATERAL (
         SELECT wmm.instance_name, wmm.media_json, wmm.content
         FROM whatsapp_monitor_messages wmm
         WHERE wmm.deal_id = d.id
         ORDER BY wmm.created_at DESC, wmm.id DESC
         LIMIT 1
       ) latest_whatsapp ON true
       LEFT JOIN LATERAL (
         SELECT wja.canonical_jid
         FROM whatsapp_jid_aliases wja
         WHERE LOWER(wja.instance_name) = LOWER(COALESCE(wi.instance_name, latest_whatsapp.instance_name, ''))
           AND wja.alias_jid = d.whatsapp_jid
         ORDER BY wja.updated_at DESC
         LIMIT 1
       ) conversation_alias ON true
       LEFT JOIN LATERAL (
         SELECT wcp.profile_picture_url
         FROM whatsapp_chat_profiles wcp
         WHERE wcp.remote_jid = d.whatsapp_jid OR wcp.remote_jid = COALESCE(conversation_alias.canonical_jid, d.whatsapp_jid)
         ORDER BY wcp.updated_at DESC
         LIMIT 1
       ) chat_profile ON true
       LEFT JOIN LATERAL (
         SELECT wim.chat_profile_picture_url
         FROM whatsapp_incoming_messages wim
         WHERE wim.remote_jid = d.whatsapp_jid OR wim.remote_jid = COALESCE(conversation_alias.canonical_jid, d.whatsapp_jid)
         ORDER BY wim.created_at DESC
         LIMIT 1
       ) incoming_profile ON true
       LEFT JOIN LATERAL (
         SELECT candidate.url AS profile_picture_url
         FROM (
           VALUES
             (
               CASE
                 WHEN d.whatsapp_jid LIKE '%@g.us'
                   THEN COALESCE(incoming_profile.chat_profile_picture_url, chat_profile.profile_picture_url)
                 ELSE NULL
               END,
               3
             )
         ) AS candidate(url, priority)
         WHERE NULLIF(candidate.url, '') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM whatsapp_instances wi_avatar
             WHERE wi_avatar.status = 'ACTIVE'
               AND wi_avatar.profile_picture_url IS NOT NULL
               AND wi_avatar.profile_picture_url = candidate.url
           )
         ORDER BY candidate.priority ASC
         LIMIT 1
       ) safe_profile ON true
       WHERE d.whatsapp_jid LIKE '%@g.us'
       LIMIT 20`
    );

    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();

SET statement_timeout=0;
SELECT count(*) AS lid_deals_abertos FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id
WHERE ps.is_won=false AND ps.is_lost=false AND d.whatsapp_jid LIKE '%@lid';


WITH existing_message_deal AS (
  SELECT d.id, d.whatsapp_instance_id, d.last_activity_at, da.created_at, da.id AS activity_id, d.whatsapp_jid
  FROM deal_activities da JOIN deals d ON d.id=da.deal_id WHERE da.metadata->>'messageId'='3EB0E98AF3EF3BCC9EECB7'
  UNION ALL
  SELECT d.id, d.whatsapp_instance_id, d.last_activity_at, da.created_at, da.id, d.whatsapp_jid
  FROM deal_activities da JOIN deals d ON d.id=da.deal_id WHERE da.metadata->>'providerMessageId'='3EB0E98AF3EF3BCC9EECB7'
  ORDER BY created_at DESC, activity_id DESC LIMIT 1
),
remote_jid_deal AS (
  SELECT d.id, d.whatsapp_instance_id, d.last_activity_at, d.whatsapp_jid
  FROM deals d
  LEFT JOIN LATERAL (
    SELECT COALESCE(ARRAY_AGG(DISTINCT assoc_jid) FILTER (WHERE assoc_jid IS NOT NULL),'{}'::text[]) AS associated_jids
    FROM ( SELECT wja.canonical_jid AS assoc_jid FROM whatsapp_jid_aliases wja WHERE LOWER(wja.instance_name)=LOWER('amanda') AND wja.alias_jid=d.whatsapp_jid
           UNION ALL SELECT wja.alias_jid FROM whatsapp_jid_aliases wja WHERE LOWER(wja.instance_name)=LOWER('amanda') AND wja.canonical_jid=d.whatsapp_jid ) assoc
  ) deal_aliases ON true
  JOIN pipeline_stages ps ON ps.id=d.stage_id
  WHERE ps.is_won=false AND ps.is_lost=false
    AND ( d.whatsapp_jid='554191086212@s.whatsapp.net' OR d.whatsapp_jid=ANY(ARRAY['554191086212@s.whatsapp.net']) OR '554191086212@s.whatsapp.net'=ANY(deal_aliases.associated_jids) OR ARRAY['554191086212@s.whatsapp.net']::text[] && deal_aliases.associated_jids::text[]
      OR ( ((d.whatsapp_jid LIKE '%@lid' AND '554191086212@s.whatsapp.net' LIKE '%@s.whatsapp.net') OR (d.whatsapp_jid LIKE '%@s.whatsapp.net' AND '554191086212@s.whatsapp.net' LIKE '%@lid'))
        AND EXISTS ( SELECT 1 FROM whatsapp_incoming_messages wim WHERE (wim.remote_jid=d.whatsapp_jid OR wim.participant_jid=d.whatsapp_jid OR wim.remote_jid='554191086212@s.whatsapp.net' OR wim.participant_jid='554191086212@s.whatsapp.net')
          AND ( COALESCE(wim.raw_payload->'key'->>'participantPn', wim.raw_payload->'key'->>'remoteJidPn', wim.raw_payload->>'participantPn', wim.raw_payload->>'remoteJidPn') IN ('554191086212@s.whatsapp.net', d.whatsapp_jid, regexp_replace('554191086212@s.whatsapp.net','@s.whatsapp.net',''), regexp_replace(d.whatsapp_jid,'@s.whatsapp.net','')) ) ) )
      OR ( '554191086212@s.whatsapp.net' NOT LIKE '%@g.us' AND d.whatsapp_jid NOT LIKE '%@g.us'
        AND ( regexp_replace(d.whatsapp_jid,'\D','','g')=regexp_replace('554191086212@s.whatsapp.net','\D','','g')
          OR ( length(regexp_replace(d.whatsapp_jid,'\D','','g'))>=10 AND length(regexp_replace('554191086212@s.whatsapp.net','\D','','g'))>=10
            AND ( CASE WHEN (length(regexp_replace(d.whatsapp_jid,'\D','','g'))=13 AND substring(regexp_replace(d.whatsapp_jid,'\D','','g') from 5 for 1)='9') THEN substring(regexp_replace(d.whatsapp_jid,'\D','','g') from 3 for 2)||right(regexp_replace(d.whatsapp_jid,'\D','','g'),8)
                   WHEN (length(regexp_replace(d.whatsapp_jid,'\D','','g'))=11 AND substring(regexp_replace(d.whatsapp_jid,'\D','','g') from 3 for 1)='9') THEN substring(regexp_replace(d.whatsapp_jid,'\D','','g') from 1 for 2)||right(regexp_replace(d.whatsapp_jid,'\D','','g'),8)
                   ELSE right(regexp_replace(d.whatsapp_jid,'\D','','g'),10) END )
              = right(regexp_replace('554191086212@s.whatsapp.net','\D','','g'),10) ) ) ) )
    AND ( d.whatsapp_instance_id='8b1f1149-4947-45c8-8dfd-e752bc2644f0'::uuid OR ( d.whatsapp_instance_id IS NULL AND ( LOWER(COALESCE(d.assigned_to_name,''))='' OR LOWER(COALESCE(d.assigned_to_name,''))='amanda' ) ) )
  ORDER BY CASE WHEN d.whatsapp_instance_id='8b1f1149-4947-45c8-8dfd-e752bc2644f0'::uuid THEN 0 ELSE 1 END ASC, d.last_activity_at DESC LIMIT 1
)
SELECT id FROM ( SELECT id, last_activity_at, 0 mp FROM existing_message_deal UNION ALL SELECT id, last_activity_at, 1 mp FROM remote_jid_deal ) md ORDER BY mp, last_activity_at DESC NULLS LAST LIMIT 1;

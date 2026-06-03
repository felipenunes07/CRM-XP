-- WhatsApp monitor identity repair for Evolution JID/LID payloads.
-- This is plain Postgres SQL; the folder name is only the repo migration convention.

create index if not exists idx_whatsapp_incoming_participant_lower_instance_created
  on public.whatsapp_incoming_messages(
    participant_jid,
    (lower(coalesce(instance_name, ''))),
    created_at desc,
    id desc
  );

create index if not exists idx_whatsapp_incoming_lower_instance_created
  on public.whatsapp_incoming_messages(
    (lower(coalesce(instance_name, ''))),
    created_at desc,
    id desc
  );

create index if not exists idx_whatsapp_jid_aliases_instance_alias_canonical
  on public.whatsapp_jid_aliases(instance_name, alias_jid, canonical_jid);

do $$
declare
  lid_deals integer;
  numeric_names integer;
  seller_avatar_profiles integer;
  unlinked_outbound integer;
begin
  select count(*) into lid_deals
  from public.deals
  where whatsapp_jid like '%@lid'
    and coalesce(last_activity_at, created_at) >= now() - interval '90 days';

  select count(*) into numeric_names
  from public.deals
  where whatsapp_jid is not null
    and coalesce(last_activity_at, created_at) >= now() - interval '90 days'
    and (
      customer_display_name is null
      or customer_display_name = ''
      or lower(customer_display_name) = lower(whatsapp_jid)
      or regexp_replace(customer_display_name, '\D', '', 'g') = regexp_replace(whatsapp_jid, '\D', '', 'g')
    );

  select count(*) into seller_avatar_profiles
  from public.whatsapp_chat_profiles wcp
  join public.whatsapp_instances wi
    on lower(wi.instance_name) = lower(wcp.instance_name)
  where wcp.updated_at >= now() - interval '90 days'
    and nullif(wcp.profile_picture_url, '') is not null
    and wcp.profile_picture_url = wi.profile_picture_url;

  select count(*) into unlinked_outbound
  from public.whatsapp_incoming_messages wim
  where wim.created_at >= now() - interval '90 days'
    and coalesce(wim.from_me, false) = true
    and not exists (
      select 1
      from public.deal_activities da
      where da.metadata ->> 'messageId' = wim.message_id
         or da.metadata ->> 'providerMessageId' = wim.message_id
    );

  raise notice 'whatsapp_identity_repair before: lid_deals=%, numeric_names=%, seller_avatar_profiles=%, unlinked_outbound=%',
    lid_deals, numeric_names, seller_avatar_profiles, unlinked_outbound;
end $$;

with source_messages as (
  select
    lower(coalesce(instance_name, '')) as instance_name,
    lower(coalesce(remote_jid, '')) as remote_jid,
    lower(coalesce(participant_jid, '')) as participant_jid,
    raw_payload,
    created_at
  from public.whatsapp_incoming_messages
  where created_at >= now() - interval '90 days'
    and lower(coalesce(remote_jid, '')) not like '%@g.us'
),
candidate_pairs as (
  select
    source_messages.instance_name,
    source_messages.created_at,
    case
      when lower(alias_value) like '%@lid' then lower(alias_value)
      when regexp_replace(coalesce(alias_value, ''), '\D', '', 'g') <> ''
        and length(regexp_replace(coalesce(alias_value, ''), '\D', '', 'g')) > 13
        then regexp_replace(alias_value, '\D', '', 'g') || '@lid'
      else null
    end as alias_jid,
    case
      when lower(coalesce(phone_value, '')) like '%@lid' then null
      when lower(coalesce(phone_value, '')) like '%@g.us' then null
      when lower(coalesce(phone_value, '')) like '%@s.whatsapp.net' then lower(phone_value)
      when length(regexp_replace(coalesce(phone_value, ''), '\D', '', 'g')) between 10 and 13
        then regexp_replace(phone_value, '\D', '', 'g') || '@s.whatsapp.net'
      else null
    end as canonical_jid
  from source_messages
  cross join lateral (
    values
      (source_messages.remote_jid),
      (source_messages.participant_jid),
      (source_messages.raw_payload #>> '{key,remoteJid}'),
      (source_messages.raw_payload #>> '{key,participant}'),
      (source_messages.raw_payload #>> '{key,senderJid}'),
      (source_messages.raw_payload ->> 'remoteJid'),
      (source_messages.raw_payload ->> 'chatId'),
      (source_messages.raw_payload ->> 'jid'),
      (source_messages.raw_payload ->> 'participant'),
      (source_messages.raw_payload ->> 'participantJid'),
      (source_messages.raw_payload ->> 'senderJid')
  ) aliases(alias_value)
  cross join lateral (
    values
      (source_messages.raw_payload #>> '{key,remoteJidPn}'),
      (source_messages.raw_payload #>> '{key,remoteJidAlt}'),
      (source_messages.raw_payload #>> '{key,senderPn}'),
      (source_messages.raw_payload #>> '{key,participantPn}'),
      (source_messages.raw_payload #>> '{key,participantAlt}'),
      (source_messages.raw_payload ->> 'remoteJidPn'),
      (source_messages.raw_payload ->> 'remoteJidAlt'),
      (source_messages.raw_payload ->> 'chatIdPn'),
      (source_messages.raw_payload ->> 'chatIdAlt'),
      (source_messages.raw_payload ->> 'jidAlt'),
      (source_messages.raw_payload ->> 'senderPn'),
      (source_messages.raw_payload ->> 'participantPn'),
      (source_messages.raw_payload ->> 'participantAlt')
  ) phones(phone_value)
)
insert into public.whatsapp_jid_aliases (
  instance_name,
  alias_jid,
  canonical_jid,
  alias_type,
  source,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
select
  instance_name,
  alias_jid,
  canonical_jid,
  'LID',
  '90-day-identity-repair',
  min(created_at),
  max(created_at),
  now(),
  now()
from candidate_pairs
where alias_jid is not null
  and canonical_jid is not null
  and alias_jid <> canonical_jid
group by instance_name, alias_jid, canonical_jid
on conflict (instance_name, alias_jid) do update set
  canonical_jid = excluded.canonical_jid,
  alias_type = excluded.alias_type,
  source = coalesce(public.whatsapp_jid_aliases.source, excluded.source),
  first_seen_at = least(public.whatsapp_jid_aliases.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(public.whatsapp_jid_aliases.last_seen_at, excluded.last_seen_at),
  updated_at = now();

with safe_deal_alias as (
  select
    d.id as deal_id,
    min(wja.canonical_jid) as canonical_jid,
    count(distinct wja.canonical_jid) as canonical_count
  from public.deals d
  left join public.whatsapp_instances wi
    on wi.id = d.whatsapp_instance_id
  join public.whatsapp_jid_aliases wja
    on lower(wja.instance_name) = lower(coalesce(wi.instance_name, ''))
   and wja.alias_jid = lower(d.whatsapp_jid)
  where lower(coalesce(d.whatsapp_jid, '')) like '%@lid'
    and wja.canonical_jid like '%@s.whatsapp.net'
    and coalesce(d.last_activity_at, d.created_at) >= now() - interval '90 days'
  group by d.id
)
update public.deals d
set
  whatsapp_jid = safe_deal_alias.canonical_jid,
  last_activity_at = coalesce(d.last_activity_at, now())
from safe_deal_alias
where d.id = safe_deal_alias.deal_id
  and safe_deal_alias.canonical_count = 1;

with inbound_profiles as (
  select distinct on (profile_instance_name, profile_remote_jid)
    profile_instance_name as instance_name,
    profile_remote_jid as remote_jid,
    inbound_sender_name as display_name,
    profile_picture_url,
    jsonb_build_object(
      'source', '90-day-identity-repair',
      'messageId', message_id,
      'createdAt', created_at
    ) as raw_profile,
    created_at
  from (
    select
      lower(coalesce(wim.instance_name, '')) as profile_instance_name,
      coalesce(wja.canonical_jid, lower(wim.remote_jid)) as profile_remote_jid,
      nullif(wim.sender_name, '') as inbound_sender_name,
      coalesce(nullif(wim.chat_profile_picture_url, ''), nullif(wim.sender_profile_picture_url, '')) as profile_picture_url,
      wim.message_id,
      wim.created_at,
      wi.assigned_user_name,
      wi.display_label,
      wi.instance_name
    from public.whatsapp_incoming_messages wim
    left join public.whatsapp_jid_aliases wja
      on lower(wja.instance_name) = lower(coalesce(wim.instance_name, ''))
     and wja.alias_jid = lower(wim.remote_jid)
    left join public.whatsapp_instances wi
      on lower(wi.instance_name) = lower(coalesce(wim.instance_name, ''))
    where wim.created_at >= now() - interval '90 days'
      and coalesce(wim.from_me, false) = false
      and lower(coalesce(wim.remote_jid, '')) not like '%@g.us'
      and (
        nullif(wim.sender_name, '') is not null
        or nullif(wim.chat_profile_picture_url, '') is not null
        or nullif(wim.sender_profile_picture_url, '') is not null
      )
  ) candidates
  where profile_remote_jid is not null
    and not (
      inbound_sender_name is not null
      and (
        lower(inbound_sender_name) = lower(coalesce(assigned_user_name, ''))
        or lower(inbound_sender_name) = lower(coalesce(display_label, ''))
        or lower(inbound_sender_name) = lower(coalesce(instance_name, ''))
        or lower(inbound_sender_name) = 'xp ' || split_part(lower(coalesce(assigned_user_name, '')), ' ', 1)
      )
    )
  order by profile_instance_name, profile_remote_jid, created_at desc
)
insert into public.whatsapp_chat_profiles (
  instance_name,
  remote_jid,
  display_name,
  profile_picture_url,
  is_group,
  raw_profile,
  last_synced_at,
  created_at,
  updated_at
)
select
  instance_name,
  remote_jid,
  display_name,
  profile_picture_url,
  false,
  raw_profile,
  created_at,
  now(),
  now()
from inbound_profiles
on conflict (instance_name, remote_jid) do update set
  display_name = case
    when excluded.display_name is not null
      and (
        public.whatsapp_chat_profiles.display_name is null
        or public.whatsapp_chat_profiles.display_name = ''
        or lower(public.whatsapp_chat_profiles.display_name) = lower(public.whatsapp_chat_profiles.remote_jid)
        or regexp_replace(public.whatsapp_chat_profiles.display_name, '\D', '', 'g') = regexp_replace(public.whatsapp_chat_profiles.remote_jid, '\D', '', 'g')
      )
      then excluded.display_name
    else public.whatsapp_chat_profiles.display_name
  end,
  profile_picture_url = case
    when excluded.profile_picture_url is not null
      and (
        public.whatsapp_chat_profiles.profile_picture_url is null
        or public.whatsapp_chat_profiles.profile_picture_url = ''
        or exists (
          select 1
          from public.whatsapp_instances wi
          where lower(wi.instance_name) = lower(public.whatsapp_chat_profiles.instance_name)
            and wi.profile_picture_url = public.whatsapp_chat_profiles.profile_picture_url
        )
      )
      then excluded.profile_picture_url
    else public.whatsapp_chat_profiles.profile_picture_url
  end,
  raw_profile = coalesce(public.whatsapp_chat_profiles.raw_profile, '{}'::jsonb) || excluded.raw_profile,
  last_synced_at = greatest(coalesce(public.whatsapp_chat_profiles.last_synced_at, excluded.last_synced_at), excluded.last_synced_at),
  updated_at = now();

do $$
declare
  lid_deals integer;
  numeric_names integer;
  seller_avatar_profiles integer;
  unlinked_outbound integer;
begin
  select count(*) into lid_deals
  from public.deals
  where whatsapp_jid like '%@lid'
    and coalesce(last_activity_at, created_at) >= now() - interval '90 days';

  select count(*) into numeric_names
  from public.deals
  where whatsapp_jid is not null
    and coalesce(last_activity_at, created_at) >= now() - interval '90 days'
    and (
      customer_display_name is null
      or customer_display_name = ''
      or lower(customer_display_name) = lower(whatsapp_jid)
      or regexp_replace(customer_display_name, '\D', '', 'g') = regexp_replace(whatsapp_jid, '\D', '', 'g')
    );

  select count(*) into seller_avatar_profiles
  from public.whatsapp_chat_profiles wcp
  join public.whatsapp_instances wi
    on lower(wi.instance_name) = lower(wcp.instance_name)
  where wcp.updated_at >= now() - interval '90 days'
    and nullif(wcp.profile_picture_url, '') is not null
    and wcp.profile_picture_url = wi.profile_picture_url;

  select count(*) into unlinked_outbound
  from public.whatsapp_incoming_messages wim
  where wim.created_at >= now() - interval '90 days'
    and coalesce(wim.from_me, false) = true
    and not exists (
      select 1
      from public.deal_activities da
      where da.metadata ->> 'messageId' = wim.message_id
         or da.metadata ->> 'providerMessageId' = wim.message_id
    );

  raise notice 'whatsapp_identity_repair after: lid_deals=%, numeric_names=%, seller_avatar_profiles=%, unlinked_outbound=%',
    lid_deals, numeric_names, seller_avatar_profiles, unlinked_outbound;
end $$;

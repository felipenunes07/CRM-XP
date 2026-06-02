-- WhatsApp LID/PN alias mapping for Evolution/Baileys mixed identifiers

create table if not exists public.whatsapp_jid_aliases (
  id uuid primary key default gen_random_uuid(),
  instance_name varchar(100) not null default '',
  alias_jid varchar(200) not null,
  canonical_jid varchar(200) not null,
  alias_type varchar(20) not null default 'UNKNOWN',
  source varchar(80),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_name, alias_jid)
);

create index if not exists idx_whatsapp_jid_aliases_canonical
  on public.whatsapp_jid_aliases(instance_name, canonical_jid);

create index if not exists idx_whatsapp_jid_aliases_alias_type
  on public.whatsapp_jid_aliases(alias_type);

with raw_candidates as (
  select
    lower(coalesce(instance_name, '')) as instance_name,
    lower(remote_jid) as alias_jid,
    coalesce(
      nullif(raw_payload #>> '{key,remoteJidAlt}', ''),
      nullif(raw_payload ->> 'remoteJidAlt', ''),
      case
        when coalesce(from_me, false) = false then coalesce(
          nullif(raw_payload #>> '{key,senderPn}', ''),
          nullif(raw_payload ->> 'senderPn', '')
        )
        else null
      end
    ) as phone_candidate
  from public.whatsapp_incoming_messages
  where remote_jid like '%@lid'
    or (
      remote_jid not like '%@%'
      and length(regexp_replace(remote_jid, '\D', '', 'g')) > 13
    )
),
normalized_candidates as (
  select
    instance_name,
    alias_jid,
    case
      when lower(phone_candidate) like '%@s.whatsapp.net' then lower(phone_candidate)
      when regexp_replace(coalesce(phone_candidate, ''), '\D', '', 'g') <> '' then
        regexp_replace(phone_candidate, '\D', '', 'g') || '@s.whatsapp.net'
      else null
    end as canonical_jid
  from raw_candidates
)
insert into public.whatsapp_jid_aliases (
  instance_name, alias_jid, canonical_jid, alias_type, source,
  first_seen_at, last_seen_at, created_at, updated_at
)
select
  instance_name,
  alias_jid,
  canonical_jid,
  'LID',
  'migration-backfill',
  now(),
  now(),
  now(),
  now()
from normalized_candidates
where canonical_jid is not null
  and canonical_jid <> alias_jid
on conflict (instance_name, alias_jid) do update set
  canonical_jid = excluded.canonical_jid,
  alias_type = excluded.alias_type,
  source = coalesce(public.whatsapp_jid_aliases.source, excluded.source),
  last_seen_at = now(),
  updated_at = now();

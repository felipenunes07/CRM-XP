alter table public.whatsapp_incoming_messages
  add column if not exists participant_jid varchar(200),
  add column if not exists participant_name varchar(200),
  add column if not exists sender_profile_picture_url text,
  add column if not exists chat_display_name varchar(300),
  add column if not exists chat_profile_picture_url text,
  add column if not exists from_me boolean not null default false;

create table if not exists public.whatsapp_chat_profiles (
  id uuid primary key default gen_random_uuid(),
  instance_name varchar(100) not null default '',
  remote_jid varchar(200) not null,
  display_name varchar(300),
  profile_picture_url text,
  is_group boolean not null default false,
  raw_profile jsonb default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_name, remote_jid)
);

create table if not exists public.whatsapp_participant_profiles (
  id uuid primary key default gen_random_uuid(),
  instance_name varchar(100) not null default '',
  participant_jid varchar(200) not null,
  display_name varchar(300),
  profile_picture_url text,
  raw_profile jsonb default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(instance_name, participant_jid)
);

create table if not exists public.whatsapp_conversation_reads (
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null,
  last_read_at timestamptz,
  force_unread boolean not null default false,
  marked_unread_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

create index if not exists idx_whatsapp_incoming_participant
  on public.whatsapp_incoming_messages(participant_jid);

create index if not exists idx_whatsapp_chat_profiles_remote_jid
  on public.whatsapp_chat_profiles(remote_jid);

create index if not exists idx_whatsapp_participant_profiles_participant_jid
  on public.whatsapp_participant_profiles(participant_jid);

create index if not exists idx_whatsapp_conversation_reads_user
  on public.whatsapp_conversation_reads(user_id);

create index if not exists idx_whatsapp_conversation_reads_force_unread
  on public.whatsapp_conversation_reads(user_id, force_unread)
  where force_unread = true;

drop trigger if exists set_whatsapp_chat_profiles_updated_at on public.whatsapp_chat_profiles;
create trigger set_whatsapp_chat_profiles_updated_at
before update on public.whatsapp_chat_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_whatsapp_participant_profiles_updated_at on public.whatsapp_participant_profiles;
create trigger set_whatsapp_participant_profiles_updated_at
before update on public.whatsapp_participant_profiles
for each row execute function public.set_updated_at();

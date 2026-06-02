-- Pre-aggregated WhatsApp activity read model.
-- The report reads this table instead of scanning raw message history on every request.

create table if not exists public.whatsapp_activity_rollups (
  period_date date not null,
  hour smallint not null check (hour >= 0 and hour <= 23),
  agent_id text not null,
  agent_name text not null,
  instance_name text,
  display_label text,
  phone_number text,
  profile_picture_url text,
  remote_jid text not null,
  chat_name text,
  sent_messages integer not null default 0,
  received_messages integer not null default 0,
  response_count integer not null default 0,
  response_seconds_total double precision not null default 0,
  last_message_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (period_date, hour, agent_id, remote_jid)
);

create index if not exists idx_whatsapp_activity_rollups_period
  on public.whatsapp_activity_rollups(period_date desc, hour);

create index if not exists idx_whatsapp_activity_rollups_agent_period
  on public.whatsapp_activity_rollups(agent_id, period_date desc);

create index if not exists idx_whatsapp_activity_rollups_last_message
  on public.whatsapp_activity_rollups(last_message_at desc);

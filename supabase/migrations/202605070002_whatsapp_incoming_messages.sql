create table if not exists public.whatsapp_incoming_messages (
  id uuid primary key default gen_random_uuid(),
  remote_jid varchar(200) not null,
  sender_name varchar(200),
  message_text text not null,
  message_id varchar(200) not null unique,
  instance_name varchar(100),
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_incoming_jid on whatsapp_incoming_messages(remote_jid);

-- Tabela de leitura desnormalizada do monitor de WhatsApp.
-- Cada linha é uma mensagem JÁ RESOLVIDA (remetente, foto, lado), pronta para exibir.
-- Populada na escrita (webhook + envio de resposta). Espelho de leitura — nunca a verdade canônica.
create table if not exists public.whatsapp_monitor_messages (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null,
  message_id        varchar(200) not null,
  remote_jid        varchar(200),
  instance_name     varchar(100),
  direction         varchar(10) not null,          -- 'INBOUND' | 'OUTBOUND'
  from_me           boolean not null default false,
  sender_name       varchar(200),
  sender_jid        varchar(200),
  sender_pic_url    text,
  content           text not null default '',
  media_json        jsonb,                          -- mídia/contato já extraídos (ou null)
  source            varchar(20) not null,           -- 'incoming' | 'activity'
  created_at        timestamptz not null default now(),
  -- idempotência: a mesma mensagem (mesma fonte) nunca duplica
  constraint uq_wmm_deal_msg_source unique (deal_id, message_id, source)
);

-- Leitura do detalhe da conversa: filtra por deal_id e ordena por created_at desc.
create index if not exists idx_wmm_deal_created
  on public.whatsapp_monitor_messages (deal_id, created_at desc, id desc);

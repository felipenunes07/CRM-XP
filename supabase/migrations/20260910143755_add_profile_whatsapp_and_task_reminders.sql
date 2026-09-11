-- Numero usado apenas pelo backend para lembretes privados de tarefas.
alter table public.profiles
  add column if not exists whatsapp_phone text;

comment on column public.profiles.whatsapp_phone is
  'Telefone WhatsApp normalizado com codigo do pais; nunca exposto publicamente.';
